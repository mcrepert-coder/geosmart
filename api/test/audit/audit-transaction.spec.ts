import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PoolClient } from 'pg';
import { AuditService } from '../../src/audit/audit.service';
import { PgAuditStore } from '../../src/audit/pg-audit.store';
import { verifyChain } from '../../src/audit/audit-chain';
import { prepareParcelGeometry } from '../../src/land/parcel-geometry';
import { withParcelOverlapCheck } from '../../src/land/parcel-overlap';
import { inTransaction, landTestDbAvailable, LandTestDb, migrate, openLandTestDb } from '../land/support/land-test-db';
import { insertParcel, insertParcelWithVersion, parcelRow } from '../land/support/land-fixtures';

const describeDb = landTestDbAvailable() ? describe : describe.skip;

describeDb('audit atomique avec le foncier', () => {
  let db: LandTestDb;
  let client: PoolClient;
  const clock = () => new Date('2026-10-24T10:00:00.000Z');

  beforeAll(async () => {
    db = (await openLandTestDb())!;
    await migrate(db);
    await db.exec(readFileSync(join(__dirname, '../../migrations/202610241200_audit_log.sql'), 'utf8'));
    client = {
      query: async (sql: string, params?: unknown[]) => ({ rows: await db.query(sql, params) }),
      release: jest.fn(),
    } as unknown as PoolClient;
  }, 120_000);
  afterAll(async () => { await db?.close(); });

  async function counts(id: string) {
    const [row] = await db.query<{ parcels: number; versions: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM parcels WHERE id=$1) AS parcels,
        (SELECT count(*)::int FROM parcel_versions WHERE parcel_id=$1) AS versions,
        (SELECT count(*)::int FROM audit_log WHERE entity_id=$1) AS events`, [id]);
    return row;
  }

  it('commit ensemble parcelle, version et evenement via le controle foncier', async () => {
    const row = parcelRow();
    const prepared = prepareParcelGeometry((row.creation_payload as { vertices: unknown }).vertices);
    const independentAudit = { log: jest.fn(async () => ({ seq: -1 })) };
    await withParcelOverlapCheck(db, { id: row.id, geometry: prepared.geometry },
      row.author_id, independentAudit, async () => {
        const audit = new AuditService(PgAuditStore.inTransaction(client), clock);
        await insertParcelWithVersion(db, row);
        await audit.log('PARCEL_CREATED', row.author_id, {}, { type: 'parcel', id: row.id });
      });
    expect(await counts(row.id)).toEqual({ parcels: 1, versions: 1, events: 1 });
    expect(independentAudit.log).not.toHaveBeenCalled();
    expect(client.release).not.toHaveBeenCalled();
  });

  it('annule les trois ecritures si une operation echoue apres l audit', async () => {
    const row = parcelRow();
    const failure = new Error('suite metier refusee');
    await expect(inTransaction(db, async () => {
      const audit = new AuditService(PgAuditStore.inTransaction(client), clock);
      await insertParcelWithVersion(db, row);
      await audit.log('PARCEL_CREATED', row.author_id, {}, { type: 'parcel', id: row.id });
      throw failure;
    })).rejects.toBe(failure);
    expect(await counts(row.id)).toEqual({ parcels: 0, versions: 0, events: 0 });
  });

  it('annule le foncier si la validation de l audit echoue', async () => {
    const row = parcelRow();
    await expect(inTransaction(db, async () => {
      const audit = new AuditService(PgAuditStore.inTransaction(client), clock);
      await insertParcelWithVersion(db, row);
      await audit.log('action_invalide', row.author_id, {}, { type: 'parcel', id: row.id });
    })).rejects.toThrow('Action invalide');
    expect(await counts(row.id)).toEqual({ parcels: 0, versions: 0, events: 0 });
  });

  it('annule le foncier si PostgreSQL refuse l insertion du journal', async () => {
    await db.exec(`CREATE FUNCTION test_reject_audit() RETURNS trigger AS $$
      BEGIN IF NEW.action = 'TEST_REJECTED' THEN RAISE EXCEPTION 'audit refuse'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_audit BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION test_reject_audit();`);
    const row = parcelRow();
    await expect(inTransaction(db, async () => {
      const audit = new AuditService(PgAuditStore.inTransaction(client), clock);
      await insertParcelWithVersion(db, row);
      await audit.log('TEST_REJECTED', row.author_id, {}, { type: 'parcel', id: row.id });
    })).rejects.toThrow('audit refuse');
    expect(await counts(row.id)).toEqual({ parcels: 0, versions: 0, events: 0 });
  });

  it('annule aussi l audit si une contrainte differee refuse le COMMIT', async () => {
    const row = parcelRow();
    await expect(inTransaction(db, async () => {
      const audit = new AuditService(PgAuditStore.inTransaction(client), clock);
      await insertParcel(db, row); // Version manquante : refus au COMMIT seulement.
      await audit.log('PARCEL_CREATED', row.author_id, {}, { type: 'parcel', id: row.id });
    })).rejects.toMatchObject({ code: '23503' });
    await db.exec('ROLLBACK');
    expect(await counts(row.id)).toEqual({ parcels: 0, versions: 0, events: 0 });
  });

  it('chaine plusieurs appels simultanes dans la meme transaction apres les rollbacks', async () => {
    await inTransaction(db, async () => {
      const store = PgAuditStore.inTransaction(client);
      const audit = new AuditService(store, clock);
      await Promise.all(Array.from({ length: 5 }, (_, i) =>
        audit.log('TEST_EVENT', 'usr', { i }, { type: 'system', id: 'test' })));
      const entries = await store.list();
      expect(entries).toHaveLength(6);
      expect(verifyChain(entries)).toMatchObject({ valid: true, checked: 6 });
    });
    expect(client.release).not.toHaveBeenCalled();
  });
});
