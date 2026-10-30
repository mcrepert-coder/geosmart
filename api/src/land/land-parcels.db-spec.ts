import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import type { QueryRunner } from 'typeorm';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import { LandParcels1793102500000 } from './migrations/1793102500000-land-parcels';
import { LandParcelIdFormat1793103100000 } from './migrations/1793103100000-land-parcel-id-format';

// Lance avec `npm run test:db` : PGlite (PostgreSQL + PostGIS en WebAssembly)
// est un module ESM, charge par import() dynamique.
jest.setTimeout(60000);

const SQUARE =
  "ST_GeomFromText('POLYGON((1.21 6.13,1.211 6.13,1.211 6.131,1.21 6.131,1.21 6.13))', 4326)";
const BOWTIE =
  "ST_GeomFromText('POLYGON((1.21 6.13,1.211 6.131,1.211 6.13,1.21 6.131,1.21 6.13))', 4326)";

function insertParcel(
  id: string,
  geom: string,
  legalStatus = 'INCONNU',
  commune = id.slice(3, 6),
) {
  return `INSERT INTO parcels (id, geom, area_m2, perimeter_m, geometry_hash,
      surveyor_id, survey_session_id, idempotency_key, legal_status, commune)
    VALUES ('${id}', ${geom}, 12000, 440, repeat('a', 64),
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '${legalStatus}',
      '${commune}')`;
}

function insertVersion(parcelId: string, boundaries: string) {
  return `INSERT INTO parcel_versions (parcel_id, version, geom, area_m2,
      perimeter_m, geometry_hash, boundaries, author_id)
    VALUES ('${parcelId}', 1, ${SQUARE}, 12000, 440, repeat('a', 64),
      '${boundaries}'::jsonb, gen_random_uuid())`;
}

describe('migration des parcelles (PostGIS)', () => {
  let db: PGlite;
  let runner: QueryRunner;
  const audit = new AuditLog1793102400000();
  const land = new LandParcels1793102500000();
  const idFormat = new LandParcelIdFormat1793103100000();

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    runner = {
      query: (sql: string, params?: unknown[]) => db.query(sql, params),
    } as unknown as QueryRunner;
    await audit.up(runner);
    await land.up(runner);
    await idFormat.up(runner);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('accepte une parcelle valide', async () => {
    await expect(
      db.query(insertParcel('TG-AG3-00001', SQUARE)),
    ).resolves.toBeDefined();
  });

  it.each([
    ['un polygone auto-intersecte', insertParcel('TG-AG3-00002', BOWTIE)],
    ['un identifiant mal forme', insertParcel('GS-26-1', SQUARE)],
    ['une commune en minuscules', insertParcel('TG-ag3-00008', SQUARE)],
    [
      'un statut juridique sans source',
      insertParcel('TG-AG3-00003', SQUARE, 'TITRE'),
    ],
    [
      'une commune differente de l identifiant',
      insertParcel('TG-AG3-00007', SQUARE, 'INCONNU', 'GO1'),
    ],
    [
      'un titre sans numero de titre',
      `UPDATE parcels SET legal_status = 'TITRE', status_source = 'ANDF',
         status_date = '2026-10-01' WHERE id = 'TG-AG3-00001'`,
    ],
    ['un statut hors liste', insertParcel('TG-AG3-00004', SQUARE, 'VENDU')],
    [
      'un point au lieu d un polygone',
      insertParcel(
        'TG-AG3-00005',
        'ST_SetSRID(ST_MakePoint(1.21, 6.13), 4326)',
      ),
    ],
    [
      'un autre systeme de reference',
      insertParcel(
        'TG-AG3-00006',
        "ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 0))', 32631)",
      ),
    ],
  ])('refuse %s', async (_label, sql) => {
    await expect(db.query(sql)).rejects.toThrow();
  });

  it('refuse une version avec moins de 3 bornes', async () => {
    await expect(
      db.query(insertVersion('TG-AG3-00001', '[{},{}]')),
    ).rejects.toThrow();
  });

  it('accepte une version puis refuse son doublon', async () => {
    await db.query(insertVersion('TG-AG3-00001', '[{},{},{},{}]'));
    await expect(
      db.query(insertVersion('TG-AG3-00001', '[{},{},{}]')),
    ).rejects.toThrow();
  });

  it("refuse la version d'une parcelle inconnue", async () => {
    await expect(
      db.query(insertVersion('TG-AG3-99999', '[{},{},{}]')),
    ).rejects.toThrow();
  });

  it('cree un index GiST sur la geometrie', async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'parcels_geom_idx'",
    );
    expect(rows[0]?.indexdef).toContain('gist');
  });

  it('annule proprement les migrations', async () => {
    await db.exec('DELETE FROM parcel_versions; DELETE FROM parcels');
    await idFormat.down(runner);
    await land.down(runner);
    await audit.down(runner);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_tables
       WHERE tablename IN ('parcels', 'parcel_versions', 'audit_log')`,
    );
    expect(rows[0].n).toBe(0);
  });
});
