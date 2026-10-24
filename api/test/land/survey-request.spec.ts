import { readFileSync } from 'fs';
import { join } from 'path';
import type { Pool } from 'pg';
import { verifyChain, AuditEntry } from '../../src/audit/audit-chain';
import { SurveyRequestService, SurveyRequestActor } from '../../src/land/survey-request.service';
import {
  inTransaction, landTestDbAvailable, LandTestDb, migrate, openLandTestDb, rejectsInIsolation,
} from './support/land-test-db';
import { insertParcelWithVersion } from './support/land-fixtures';

const migration = (name: string) => readFileSync(join(__dirname, '../../migrations', name), 'utf8');

const agent: SurveyRequestActor = { id: 'agent-1', role: 'agent', active: true };
const otherAgent: SurveyRequestActor = { id: 'agent-2', role: 'agent', active: true };
const geo: SurveyRequestActor = { id: 'geo-1', role: 'geometre', active: true };
const otherGeo: SurveyRequestActor = { id: 'geo-2', role: 'geometre', active: true };
const admin: SurveyRequestActor = { id: 'admin-1', role: 'admin', active: true };
const clock = () => new Date('2026-10-24T12:00:00.000Z');

function request(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Terrain de 600 m2 a lever avant mise en vente',
    location: { lon: 1.2125, lat: 6.1723 },
    contactPhone: '90112233',
    ...overrides,
  };
}

const describeDb = landTestDbAvailable() ? describe : describe.skip;
describeDb('demandes de leve (EF-207)', () => {
  let db: LandTestDb;
  let service: SurveyRequestService;
  let busy = false;
  let sequence = 0;

  beforeAll(async () => {
    db = (await openLandTestDb())!;
    await migrate(db);
    await inTransaction(db, async () => {
      await db.exec(migration('202610241200_audit_log.sql'));
      await db.exec(migration('202610241500_land_survey_requests.sql'));
    });
    const run = async (sql: string, params?: unknown[]) => ({ rows: await db.query(sql, params) });
    const pool = {
      query: run,
      connect: async () => {
        if (busy) throw new Error('Client deja emprunte');
        busy = true;
        return { query: run, release: () => { if (!busy) throw new Error('Double release'); busy = false; } };
      },
    } as unknown as Pool;
    service = new SurveyRequestService(pool, clock, () => `DML-TEST-${++sequence}`);
  }, 120_000);

  afterEach(() => { expect(busy).toBe(false); });
  afterAll(async () => { await db?.close(); });

  async function audit(): Promise<AuditEntry[]> {
    const rows = await db.query<Record<string, unknown>>(
      'SELECT seq, at, actor_id, action, entity_type, entity_id, details, prev_hash, hash FROM audit_log ORDER BY seq');
    return rows.map((r) => ({
      seq: Number(r.seq), at: new Date(r.at as string).toISOString(), actorId: r.actor_id as string | null,
      action: r.action as string, entityType: r.entity_type as string, entityId: r.entity_id as string,
      details: r.details as AuditEntry['details'], prevHash: r.prev_hash as string, hash: r.hash as string,
    }));
  }

  async function count(): Promise<number> {
    const [row] = await db.query<{ n: string | number }>('SELECT count(*) AS n FROM survey_requests');
    return Number(row.n);
  }

  describe('creation', () => {
    it('cree une demande ouverte et la journalise dans la meme transaction', async () => {
      const before = (await audit()).length;
      const created = await service.create(request(), agent);
      expect(created).toEqual({
        id: expect.stringMatching(/^DML-TEST-/), status: 'OUVERTE', agentId: 'agent-1',
        surveyorId: null, parcelId: null, description: request().description,
        location: { lon: 1.2125, lat: 6.1723 }, contactPhone: '90112233',
        createdAt: '2026-10-24T12:00:00.000Z',
      });
      const entries = await audit();
      expect(entries).toHaveLength(before + 1);
      expect(entries[entries.length - 1]).toMatchObject({
        action: 'SURVEY_REQUEST_CREATED', actorId: 'agent-1', entityType: 'survey_request', entityId: created.id,
      });
      expect(verifyChain(entries)).toMatchObject({ valid: true });
    });

    it('accepte une demande sans telephone', async () => {
      const { contactPhone: _omitted, ...withoutPhone } = request();
      const created = await service.create(withoutPhone, agent);
      expect(created).not.toHaveProperty('contactPhone');
    });

    it.each<[string, SurveyRequestActor | undefined, number]>([
      ['sans authentification', undefined, 401],
      ['un geometre', geo, 403],
      ['un administrateur', admin, 403],
      ['un client', { id: 'client-1', role: 'client', active: true }, 403],
      ['un agent inactif', { ...agent, active: false }, 403],
      ['un agent sans identifiant', { ...agent, id: ' ' }, 403],
    ])('refuse %s sans rien ecrire', async (_label, actor, status) => {
      const before = await count();
      await expect(service.create(request(), actor)).rejects.toMatchObject({ status });
      expect(await count()).toBe(before);
    });

    it.each<[string, unknown]>([
      ['un corps absent', null],
      ['un champ inconnu', request({ agentId: 'agent-2' })],
      ['une description vide', request({ description: '   ' })],
      ['une description de plus de 1000 caracteres', request({ description: 'x'.repeat(1001) })],
      ['une localisation absente', request({ location: undefined })],
      ['une longitude hors domaine', request({ location: { lon: 181, lat: 6 } })],
      ['une latitude non finie', request({ location: { lon: 1.2, lat: NaN } })],
      ['une coordonnee en texte', request({ location: { lon: '1.2', lat: 6 } })],
      ['un champ de localisation inconnu', request({ location: { lon: 1.2, lat: 6, alt: 3 } })],
      ['un telephone mal forme', request({ contactPhone: '90 11 22 33' })],
      ['un telephone trop court', request({ contactPhone: '1234' })],
    ])('refuse %s avec 400', async (_label, input) => {
      const before = await count();
      await expect(service.create(input, agent)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
      expect(await count()).toBe(before);
    });

    it('annule la demande si le journal echoue', async () => {
      const before = await count();
      await db.exec(`CREATE FUNCTION fail_audit() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'journal indisponible'; END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_audit();`);
      try {
        await expect(service.create(request(), agent)).rejects.toThrow(/journal indisponible/);
      } finally {
        await db.exec('DROP TRIGGER fail_audit ON audit_log; DROP FUNCTION fail_audit();');
      }
      expect(await count()).toBe(before);
    });
  });

  describe('consultation et prise', () => {
    let mine: string;
    let taken: string;
    let foreign: string;

    beforeAll(async () => {
      mine = (await service.create(request({ description: 'Demande A' }), agent)).id;
      taken = (await service.create(request({ description: 'Demande B' }), agent)).id;
      foreign = (await service.create(request({ description: 'Demande C' }), otherAgent)).id;
      await service.take(taken, otherGeo);
    });

    it('montre a l agent ses seules demandes, telephone compris', async () => {
      const list = await service.list({}, agent);
      expect(list.every((r) => r.agentId === 'agent-1')).toBe(true);
      expect(list.map((r) => r.id)).toEqual(expect.arrayContaining([mine, taken]));
      expect(list.map((r) => r.id)).not.toContain(foreign);
      expect(list.find((r) => r.id === mine)?.contactPhone).toBe('90112233');
    });

    it('montre au geometre les demandes ouvertes sans telephone et pas celles prises par un autre', async () => {
      const list = await service.list({}, geo);
      expect(list.map((r) => r.id)).toEqual(expect.arrayContaining([mine, foreign]));
      expect(list.map((r) => r.id)).not.toContain(taken);
      expect(list.every((r) => r.status === 'OUVERTE')).toBe(true);
      expect(list.some((r) => 'contactPhone' in r)).toBe(false);
    });

    it('montre au geometre qui a pris la demande son telephone', async () => {
      const list = await service.list({ status: 'PRISE' }, otherGeo);
      expect(list).toEqual([expect.objectContaining({ id: taken, surveyorId: 'geo-2', contactPhone: '90112233' })]);
    });

    it('montre tout a l administrateur et filtre par statut', async () => {
      const all = await service.list({}, admin);
      expect(all.map((r) => r.id)).toEqual(expect.arrayContaining([mine, taken, foreign]));
      const open = await service.list({ status: 'OUVERTE' }, admin);
      expect(open.map((r) => r.id)).not.toContain(taken);
    });

    it.each<[string, unknown, SurveyRequestActor | undefined, number]>([
      ['un client', {}, { id: 'client-1', role: 'client', active: true }, 403],
      ['un topographe', {}, { id: 'topo-1', role: 'topographe', active: true }, 403],
      ['sans authentification', {}, undefined, 401],
      ['un statut inconnu', { status: 'FERMEE' }, admin, 400],
      ['un filtre inconnu', { agentId: 'agent-2' }, admin, 400],
    ])('refuse la liste pour %s', async (_label, filters, actor, status) => {
      await expect(service.list(filters, actor)).rejects.toMatchObject({ status });
    });

    it('laisse un geometre prendre une demande ouverte et le journalise', async () => {
      const id = (await service.create(request({ description: 'Demande D' }), agent)).id;
      const before = (await audit()).length;
      const result = await service.take(id, geo);
      expect(result).toMatchObject({ id, status: 'PRISE', surveyorId: 'geo-1',
        takenAt: '2026-10-24T12:00:00.000Z', contactPhone: '90112233' });
      const entries = await audit();
      expect(entries).toHaveLength(before + 1);
      expect(entries[entries.length - 1]).toMatchObject({ action: 'SURVEY_REQUEST_TAKEN', actorId: 'geo-1', entityId: id });
      expect(verifyChain(entries)).toMatchObject({ valid: true });
    });

    it('refuse 409 a un second geometre, sans changer le titulaire', async () => {
      await expect(service.take(taken, geo)).rejects.toMatchObject({ status: 409, code: 'REQUEST_ALREADY_TAKEN' });
      const [row] = await db.query<{ surveyor_id: string }>('SELECT surveyor_id FROM survey_requests WHERE id = $1', [taken]);
      expect(row.surveyor_id).toBe('geo-2');
    });

    it('rejoue une prise du meme geometre sans nouvel audit', async () => {
      const before = (await audit()).length;
      expect(await service.take(taken, otherGeo)).toMatchObject({ id: taken, status: 'PRISE', surveyorId: 'geo-2' });
      expect((await audit()).length).toBe(before);
    });

    it.each<[string, unknown, SurveyRequestActor | undefined, number]>([
      ['une demande inconnue', 'DML-INCONNUE', geo, 404],
      ['un identifiant vide', '', geo, 400],
      ['un agent', 'DML-TEST-1', agent, 403],
      ['un geometre inactif', 'DML-TEST-1', { ...geo, active: false }, 403],
      ['sans authentification', 'DML-TEST-1', undefined, 401],
    ])('refuse la prise pour %s', async (_label, id, actor, status) => {
      await expect(service.take(id, actor)).rejects.toMatchObject({ status });
    });
  });

  describe('garanties de la base', () => {
    let id: string;
    beforeAll(async () => { id = (await service.create(request(), agent)).id; });

    it.each([
      ['modifier la description', `UPDATE survey_requests SET description = 'autre' WHERE id = $1`, /immuable/],
      ['changer l agent', `UPDATE survey_requests SET agent_id = 'agent-2' WHERE id = $1`, /immuable/],
      ['deplacer la localisation', `UPDATE survey_requests SET location = ST_SetSRID(ST_MakePoint(2, 6), 4326) WHERE id = $1`, /immuable/],
      ['supprimer la demande', 'DELETE FROM survey_requests WHERE id = $1', /ajout seul/],
    ])('refuse de %s', async (_label, sql, message) => {
      const error = await rejectsInIsolation(db, () => db.query(sql, [id]));
      expect(error.message).toMatch(message);
    });

    it('refuse de tronquer la table', async () => {
      const error = await rejectsInIsolation(db, () => db.exec('TRUNCATE survey_requests'));
      expect(error.message).toMatch(/ajout seul/);
    });

    it('refuse de changer le geometre d une demande prise', async () => {
      await service.take(id, geo);
      const error = await rejectsInIsolation(db, () =>
        db.query(`UPDATE survey_requests SET surveyor_id = 'geo-2' WHERE id = $1`, [id]));
      expect(error.message).toMatch(/deja prise/);
    });

    it.each([
      ['une demande prise sans geometre', `INSERT INTO survey_requests (id, agent_id, description, location, status, created_at)
        VALUES ('X1', 'a', 'd', ST_SetSRID(ST_MakePoint(1, 6), 4326), 'PRISE', now())`],
      ['une demande ouverte avec geometre', `INSERT INTO survey_requests (id, agent_id, description, location, surveyor_id, created_at)
        VALUES ('X2', 'a', 'd', ST_SetSRID(ST_MakePoint(1, 6), 4326), 'g', now())`],
      ['un statut inconnu', `INSERT INTO survey_requests (id, agent_id, description, location, status, created_at)
        VALUES ('X3', 'a', 'd', ST_SetSRID(ST_MakePoint(1, 6), 4326), 'FERMEE', now())`],
      ['une localisation hors domaine', `INSERT INTO survey_requests (id, agent_id, description, location, created_at)
        VALUES ('X4', 'a', 'd', ST_SetSRID(ST_MakePoint(200, 6), 4326), now())`],
      ['une localisation dans un autre SRID', `INSERT INTO survey_requests (id, agent_id, description, location, created_at)
        VALUES ('X5', 'a', 'd', ST_SetSRID(ST_MakePoint(1, 6), 3857), now())`],
      ['un polygone a la place d un point', `INSERT INTO survey_requests (id, agent_id, description, location, created_at)
        VALUES ('X6', 'a', 'd', 'SRID=4326;POLYGON((1 6,2 6,2 7,1 6))'::geometry, now())`],
      ['un telephone mal forme', `INSERT INTO survey_requests (id, agent_id, description, location, contact_phone, created_at)
        VALUES ('X7', 'a', 'd', ST_SetSRID(ST_MakePoint(1, 6), 4326), 'abc', now())`],
      ['une parcelle inconnue', `INSERT INTO survey_requests (id, agent_id, description, location, status, surveyor_id, taken_at, parcel_id, created_at)
        VALUES ('X8', 'a', 'd', ST_SetSRID(ST_MakePoint(1, 6), 4326), 'PRISE', 'g', now(), 'PRC-INCONNUE', now())`],
    ])('refuse %s', async (_label, sql) => {
      const error = await rejectsInIsolation(db, () => db.exec(sql));
      expect(error.message).toBeTruthy();
    });

    it('accepte le rattachement a une parcelle existante', async () => {
      await inTransaction(db, async () => {
        const parcel = await insertParcelWithVersion(db);
        await db.query(`INSERT INTO survey_requests (id, agent_id, description, location, status, surveyor_id,
          taken_at, parcel_id, created_at) VALUES ('X9', 'a', 'd', ST_SetSRID(ST_MakePoint(1, 6), 4326),
          'PRISE', 'g', now(), $1, now())`, [parcel.id]);
      });
    });
  });
});
