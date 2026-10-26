import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Pool } from 'pg';
import { ParcelCreationService, ParcelCreator } from '../../src/land/parcel-creation.service';
import { landTestDbAvailable, LandTestDb, migrate, openLandTestDb } from './support/land-test-db';
import { PgAuditStore } from '../../src/audit/pg-audit.store';
import { verifyChain } from '../../src/audit/audit-chain';

let site = 0;
function input() {
  const x = 1.2 + (++site) * 0.001;
  return { clientId: randomUUID(), legalStatus: 'COUTUMIER_NON_TITRE', label: 'Lot test',
    vertices: [[x, 6.1], [x + 0.0003, 6.1], [x + 0.0003, 6.1003], [x, 6.1003]]
      .map(([lon, lat], i) => ({ number: `B${i}`, lon, lat,
        source: { instrument: 'UM982', fixMode: 'RTK_FIXED', pdop: 1.4,
          satellites: 21, measuredAt: '2026-10-24T09:00:00Z' } })),
  };
}

const actor: ParcelCreator = { id: 'geo', role: 'geometre', active: true, surveyorRegistered: true };
const describeDb = landTestDbAvailable() ? describe : describe.skip;

describeDb('creation de parcelle', () => {
  let db: LandTestDb;
  let pool: Pool;
  let busy = false;
  let released = 0;
  let service: ParcelCreationService;
  const clock = () => new Date('2026-10-24T10:00:00.000Z');
  beforeAll(async () => {
    db = (await openLandTestDb())!;
    await migrate(db);
    await db.exec(readFileSync(join(__dirname, '../../migrations/202610241200_audit_log.sql'), 'utf8'));
    // Pool de test a un client : un nouvel emprunt avant release fait echouer
    // le test, notamment si l'alerte de refus conserve la connexion fonciere.
    pool = {
      connect: async () => {
        if (busy) throw new Error('Connexion deja empruntee');
        busy = true;
        return { query: async (sql: string, params?: unknown[]) => ({ rows: await db.query(sql, params) }),
          release: () => { if (!busy) throw new Error('Double release'); busy = false; released++; } };
      },
      query: async (sql: string, params?: unknown[]) => ({ rows: await db.query(sql, params) }),
    } as unknown as Pool;
    service = new ParcelCreationService(pool, clock);
  }, 120_000);
  afterAll(async () => { await db?.close(); });
  afterEach(() => { expect(busy).toBe(false); });

  async function counts(id: string) {
    const [row] = await db.query(`SELECT
      (SELECT count(*)::int FROM parcels WHERE id=$1) AS parcels,
      (SELECT count(*)::int FROM parcel_versions WHERE parcel_id=$1) AS versions,
      (SELECT count(*)::int FROM audit_log WHERE entity_id=$1) AS events`, [id]);
    return row;
  }

  it('cree la parcelle, la version et l audit avec mesures metriques', async () => {
    const request = input();
    const result = await service.create(request, actor);
    expect(result.status).toBe(201);
    expect(result.parcel).toMatchObject({ authorId: actor.id, version: 1,
      legalStatus: request.legalStatus, certified: true, inConflict: false, vertices: request.vertices });
    expect(result.parcel.areaM2).toBeGreaterThan(1000);
    expect(result.parcel.areaM2).toBeLessThan(1200);
    expect(result.parcel.perimeterM).toBeGreaterThan(120);
    expect(result.parcel.perimeterM).toBeLessThan(150);
    expect(await counts(result.parcel.id)).toEqual({ parcels: 1, versions: 1, events: 1 });
    expect(verifyChain(await new PgAuditStore(pool).list()).valid).toBe(true);
  });

  it('rejoue la reponse conservee sans version ni audit supplementaire', async () => {
    const request = input();
    const original = await service.create(request, actor);
    await db.query("UPDATE parcels SET legal_status='EN_LITIGE' WHERE id=$1", [original.parcel.id]);
    const replay = await service.create({ vertices: request.vertices, label: request.label,
      legalStatus: request.legalStatus, clientId: request.clientId }, { ...actor, surveyorRegistered: false });
    expect(replay).toEqual({ status: 200, parcel: original.parcel });
    expect(await counts(original.parcel.id)).toEqual({ parcels: 1, versions: 1, events: 1 });
  });

  it('refuse une cle reutilisee avec un autre contenu', async () => {
    const request = input();
    const original = await service.create(request, actor);
    await expect(service.create({ ...request, label: 'Autre' }, actor))
      .rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
    expect(await counts(original.parcel.id)).toEqual({ parcels: 1, versions: 1, events: 1 });
  });

  it('ne rejoue pas la parcelle d un autre auteur et conserve l alerte de conflit', async () => {
    const request = input();
    const original = await service.create(request, actor);
    const before = released;
    await expect(service.create(request, { ...actor, id: 'other' })).rejects.toMatchObject({
      status: 409, code: 'PARCEL_OVERLAP', details: { conflictingParcelIds: [original.parcel.id] },
    });
    expect(released - before).toBe(2); // Client foncier rendu, puis client d'audit.
    const entries = await new PgAuditStore(pool).list();
    expect(entries[entries.length - 1].action).toBe('PARCEL_OVERLAP_REJECTED');
    expect(verifyChain(entries).valid).toBe(true);
  });

  it.each(['agent', 'client', 'admin', 'topographe'])('refuse le role %s', async (role) => {
    await expect(service.create(input(), { ...actor, role })).rejects.toMatchObject({ status: 403 });
  });

  it('refuse un compte inactif meme lors du rejeu', async () => {
    const request = input(); await service.create(request, actor);
    await expect(service.create(request, { ...actor, active: false })).rejects.toMatchObject({ status: 403 });
  });

  it('accepte un geometre non inscrit sans certifier le leve', async () => {
    const result = await service.create(input(), { ...actor, surveyorRegistered: false });
    expect(result.parcel.certified).toBe(false);
  });

  it('accepte une parcelle voisine partageant exactement une limite', async () => {
    const request = input(); await service.create(request, actor);
    const right = request.vertices[1].lon;
    const adjacent = { ...request, clientId: randomUUID(), vertices: request.vertices.map((v, i) => ({
      ...v, lon: i === 0 || i === 3 ? right : right + 0.0003,
    })) };
    await expect(service.create(adjacent, actor)).resolves.toMatchObject({ status: 201 });
  });

  it.each(['clientId', 'legalStatus', 'vertices'])('refuse un champ obligatoire absent (%s)', async (field) => {
    const request = input() as Record<string, unknown>; delete request[field];
    await expect(service.create(request, actor)).rejects.toMatchObject({ status: 400 });
  });

  it('refuse un auteur injecte et les bornes Float', async () => {
    await expect(service.create({ ...input(), authorId: 'other' }, actor)).rejects.toMatchObject({ status: 400 });
    const request = input(); request.vertices[0].source.fixMode = 'RTK_FLOAT';
    await expect(service.create(request, actor)).rejects.toMatchObject({ status: 422 });
  });

  it('refuse une auto-intersection sans creation ni alerte de chevauchement', async () => {
    const request = input();
    [request.vertices[1], request.vertices[2]] = [request.vertices[2], request.vertices[1]];
    await expect(service.create(request, actor)).rejects.toMatchObject({ status: 400 });
    const rows = await db.query('SELECT id FROM parcels WHERE client_id=$1', [request.clientId]);
    expect(rows).toEqual([]);
  });

  it('annule creation et version lorsque l audit SQL echoue', async () => {
    await db.exec(`CREATE FUNCTION test_reject_creation_audit() RETURNS trigger AS $$
      BEGIN IF NEW.entity_id='audit-failure' THEN RAISE EXCEPTION 'audit indisponible'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_creation_audit BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION test_reject_creation_audit();`);
    const failing = new ParcelCreationService(pool, clock, () => 'audit-failure');
    const request = input();
    await expect(failing.create(request, actor)).rejects.toThrow('audit indisponible');
    expect(await counts('audit-failure')).toEqual({ parcels: 0, versions: 0, events: 0 });
    // La cle du refus n'est pas transformee en succes memorise.
    await expect(service.create(request, actor)).resolves.toMatchObject({ status: 201 });
  });
});
