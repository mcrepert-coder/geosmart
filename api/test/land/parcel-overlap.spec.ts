import { InvalidParcelGeometryError, withParcelOverlapCheck, ParcelTransaction } from '../../src/land/parcel-overlap';
import { prepareParcelGeometry } from '../../src/land/parcel-geometry';
import { inTransaction, landTestDbAvailable, migrate, openLandTestDb, LandTestDb } from './support/land-test-db';
import { insertParcelWithVersion, SQUARE } from './support/land-fixtures';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PgAuditStore } from '../../src/audit/pg-audit.store';
import { GENESIS_HASH, seal, verifyChain } from '../../src/audit/audit-chain';
import { JsonValue } from '../../src/audit/canonical-json';

function geometry(points: number[][]) {
  return prepareParcelGeometry(points.map(([lon, lat], i) => ({
    number: `B${i}`, lon, lat, source: { instrument: 'UM982', fixMode: 'RTK_FIXED',
      pdop: 1.4, satellites: 21, measuredAt: '2026-10-24T09:00:00Z' },
  }))).geometry;
}

const square = [[1.2123, 6.1724], [1.2126, 6.1724], [1.2126, 6.1721], [1.2123, 6.1721]];
const describeDb = landTestDbAvailable() ? describe : describe.skip;

describeDb('controle de chevauchement PostGIS', () => {
  let db: LandTestDb;
  const audit = { log: jest.fn(async (_action: string, _actorId: string,
    _details: Record<string, JsonValue>, _target: { type: string; id: string }) => ({ seq: 42 })) };
  beforeAll(async () => {
    db = (await openLandTestDb())!;
    await migrate(db);
    await db.exec(readFileSync(join(__dirname, '../../migrations/202610241200_audit_log.sql'), 'utf8'));
    await inTransaction(db, () => insertParcelWithVersion(db, { id: 'existing', geometry: SQUARE }).then(() => undefined));
  }, 120_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(() => { audit.log.mockClear(); });

  it.each([
    ['identique', square],
    ['inclusion', [[1.2124, 6.1723], [1.2125, 6.1723], [1.2125, 6.1722], [1.2124, 6.1722]]],
    ['contenant', [[1.2122, 6.1725], [1.2127, 6.1725], [1.2127, 6.1720], [1.2122, 6.1720]]],
    ['partiel', [[1.2125, 6.1723], [1.2128, 6.1723], [1.2128, 6.1720], [1.2125, 6.1720]]],
    ['bande inferieure a 5 cm', [[1.2125999, 6.1724], [1.2129, 6.1724], [1.2129, 6.1721], [1.2125999, 6.1721]]],
  ])('refuse un recouvrement %s et journalise apres rollback', async (_label, points) => {
    const write = jest.fn();
    await expect(withParcelOverlapCheck(db, { id: 'candidate', geometry: geometry(points as number[][]) },
      'geo', audit, write)).rejects.toMatchObject({ status: 409, code: 'PARCEL_OVERLAP',
      details: { conflictingParcelIds: ['existing'], alertSeq: 42 } });
    expect(write).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toBe('PARCEL_OVERLAP_REJECTED');
    // La connexion est utilisable apres le refus : aucune transaction annulee restante.
    expect(await db.query('SELECT 1 AS ok')).toEqual([{ ok: 1 }]);
  });

  it.each([
    ['limite', [[1.2126, 6.1724], [1.2129, 6.1724], [1.2129, 6.1721], [1.2126, 6.1721]]],
    ['sommet', [[1.2126, 6.1727], [1.2129, 6.1727], [1.2129, 6.1724], [1.2126, 6.1724]]],
    ['distinct', [[1.2130, 6.1724], [1.2133, 6.1724], [1.2133, 6.1721], [1.2130, 6.1721]]],
  ])('accepte un contact %s sans alerte', async (_label, points) => {
    const write = jest.fn(async () => 'accepted');
    await expect(withParcelOverlapCheck(db, { id: 'candidate', geometry: geometry(points as number[][]) },
      'geo', audit, write)).resolves.toBe('accepted');
    expect(write).toHaveBeenCalledTimes(1);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('exclut la parcelle elle-meme lors de sa modification', async () => {
    await expect(withParcelOverlapCheck(db, { id: 'existing', excludeParcelId: 'existing', geometry: geometry(square) },
      'geo', audit, async () => true)).resolves.toBe(true);
  });

  it('conserve une alerte chainee via PgAuditStore apres le refus', async () => {
    // Adaptateur du client de test : le rollback foncier precede la transaction
    // ouverte par le vrai PgAuditStore. La concurrence du pool reste a tester.
    const client = {
      query: async (sql: string, params?: unknown[]) => ({ rows: await db.query(sql, params) }),
      release: () => undefined,
    };
    const pool = { connect: async () => client, query: client.query };
    const store = new PgAuditStore(pool as unknown as ConstructorParameters<typeof PgAuditStore>[0]);
    const persistentAudit = {
      log: async (action: string, actorId: string, details: Record<string, JsonValue>,
        target: { type: string; id: string }) => store.append((last) => seal({
          seq: last ? last.seq + 1 : 1, prevHash: last?.hash ?? GENESIS_HASH,
          at: '2026-10-24T09:00:00.000Z', actorId, action,
          entityType: target.type, entityId: target.id, details,
        })),
    };
    await expect(withParcelOverlapCheck(db, { id: 'rejected', geometry: geometry(square) },
      'geo', persistentAudit, jest.fn())).rejects.toMatchObject({ details: { alertSeq: 1 } });
    const entries = await store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'PARCEL_OVERLAP_REJECTED', entityId: 'rejected' });
    expect(verifyChain(entries).valid).toBe(true);
    expect(await db.query("SELECT id FROM parcels WHERE id = 'rejected'")).toEqual([]);
  });

  it('refuse une auto-intersection avant le controle des voisins', async () => {
    const crossing = geometry([square[0], square[2], square[1], square[3]]);
    await expect(withParcelOverlapCheck(db, { id: 'candidate', geometry: crossing },
      'geo', audit, async () => true)).rejects.toBeInstanceOf(InvalidParcelGeometryError);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('annule une ecriture echouee sans annoncer un chevauchement', async () => {
    const error = new Error('ecriture echouee');
    await expect(withParcelOverlapCheck(db, { id: 'existing', excludeParcelId: 'existing', geometry: geometry(square) },
      'geo', audit, async (transaction) => {
        await transaction.query("UPDATE parcels SET label = 'temporaire' WHERE id = 'existing'");
        throw error;
      })).rejects.toBe(error);
    const [row] = await db.query<{ label: string }>("SELECT label FROM parcels WHERE id = 'existing'");
    expect(row.label).toBe('Lot fictif');
  });
});

describe('ordre transactionnel du controle', () => {
  it('libere la transaction avant de journaliser un refus', async () => {
    const steps: string[] = [];
    const db = { query: jest.fn(async (sql: string) => {
      steps.push(sql);
      if (sql.includes('AS valid')) return [{ valid: true }];
      if (sql.includes('ORDER BY p.id')) return [{ id: 'existing', overlap_area_m2: 1 }];
      return [];
    }) } as unknown as ParcelTransaction;
    const audit = { log: jest.fn(async () => {
      expect(steps[steps.length - 1]).toBe('ROLLBACK');
      return { seq: 5 };
    }) };
    await expect(withParcelOverlapCheck(db, { id: 'candidate', geometry: geometry(square) },
      'geo', audit, jest.fn())).rejects.toMatchObject({ details: { alertSeq: 5 } });
    expect(steps[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(steps[1]).toBe('LOCK TABLE parcels IN SHARE ROW EXCLUSIVE MODE');
  });

  it('remonte une panne du journal sans annoncer une alerte inexistante', async () => {
    const db = { query: jest.fn(async (sql: string) => {
      if (sql.includes('AS valid')) return [{ valid: true }];
      if (sql.includes('ORDER BY p.id')) return [{ id: 'existing', overlap_area_m2: 1 }];
      return [];
    }) } as unknown as ParcelTransaction;
    const failure = new Error('journal indisponible');
    const audit = { log: jest.fn(async () => { throw failure; }) };
    await expect(withParcelOverlapCheck(db, { id: 'candidate', geometry: geometry(square) },
      'geo', audit, jest.fn())).rejects.toBe(failure);
  });
});
