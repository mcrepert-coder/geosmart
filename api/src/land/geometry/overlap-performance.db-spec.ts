import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import type { Polygon, QueryRunner } from 'typeorm';
import type { SqlRunner } from '../../audit/sql-runner';
import { LandParcels1793102500000 } from '../migrations/1793102500000-land-parcels';
import { LandParcelIdFormat1793103100000 } from '../migrations/1793103100000-land-parcel-id-format';
import { ParcelGeometryService } from './parcel-geometry.service';

// Exigence de performance (cahier des charges, section 8) : verification d'un
// chevauchement en moins de 2 secondes pour 10 000 parcelles. Mesure sur
// PGlite (PostGIS en WebAssembly), plus lent qu'un serveur PostgreSQL : si le
// seuil tient ici, il tient en production.

jest.setTimeout(180_000);

const PARCELS = 10_000;
const SIDE = 100; // grille de 100 x 100 parcelles
const STEP = 0.0003; // environ 33 m entre deux parcelles
const SIZE = 0.0002; // parcelles d'environ 22 m de cote
const ORIGIN = { lon: 1.15, lat: 6.12 }; // Grand Lome
const LIMIT_MS = 2000;

function square(lon: number, lat: number, size: number): Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon, lat],
        [lon + size, lat],
        [lon + size, lat + size],
        [lon, lat + size],
        [lon, lat],
      ],
    ],
  };
}

async function timed<T>(work: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await work();
  return [result, performance.now() - start];
}

describe('controle de chevauchement sur 10 000 parcelles (performance)', () => {
  let db: PGlite;
  let runner: SqlRunner;
  const service = new ParcelGeometryService();

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    runner = { query: (sql, params) => db.query(sql, params) };
    await new LandParcels1793102500000().up(runner as unknown as QueryRunner);
    await new LandParcelIdFormat1793103100000().up(
      runner as unknown as QueryRunner,
    );
    // Une seule requete : la grille entiere, avec son index spatial (GiST).
    await db.query(
      `INSERT INTO parcels (id, geom, area_m2, perimeter_m, geometry_hash,
         surveyor_id, survey_session_id, idempotency_key, commune)
       SELECT 'TG-GO1-' || lpad(n::text, 5, '0'),
              ST_MakeEnvelope($1::float8 + (n % $3::int) * $4::float8,
                              $2::float8 + (n / $3::int) * $4::float8,
                              $1::float8 + (n % $3::int) * $4::float8 + $5::float8,
                              $2::float8 + (n / $3::int) * $4::float8 + $5::float8, 4326),
              484, 88, repeat('0', 64),
              gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'GO1'
         FROM generate_series(1, $6::int) AS n`,
      [ORIGIN.lon, ORIGIN.lat, SIDE, STEP, SIZE, PARCELS],
    );
    await db.query('ANALYZE parcels');
  });

  afterAll(async () => {
    await db?.close();
  });

  it('charge bien 10 000 parcelles', async () => {
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM parcels',
    );
    expect(rows[0].n).toBe(PARCELS);
  });

  it('trouve les parcelles recouvertes en moins de 2 secondes', async () => {
    // Un carre a cheval sur quatre parcelles, au milieu de la grille.
    const middle = square(
      ORIGIN.lon + 50 * STEP + SIZE / 2,
      ORIGIN.lat + 50 * STEP + SIZE / 2,
      STEP,
    );
    await service.findOverlaps(runner, middle); // chauffe
    const [conflicts, ms] = await timed(() =>
      service.findOverlaps(runner, middle),
    );
    expect(conflicts.length).toBeGreaterThanOrEqual(4);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('accepte en moins de 2 secondes une parcelle libre entre les autres', async () => {
    // Dans l'allee entre deux rangees : aucune parcelle recouverte.
    const free = square(
      ORIGIN.lon + 20 * STEP + SIZE + 0.00001,
      ORIGIN.lat + 20 * STEP + SIZE + 0.00001,
      STEP - SIZE - 0.00002,
    );
    const [conflicts, ms] = await timed(() =>
      service.findOverlaps(runner, free),
    );
    expect(conflicts).toEqual([]);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('reste sous 2 secondes pour un grand polygone qui en recoupe beaucoup', async () => {
    const large = square(
      ORIGIN.lon + 10 * STEP,
      ORIGIN.lat + 10 * STEP,
      10 * STEP,
    );
    const [conflicts, ms] = await timed(() =>
      service.findOverlaps(runner, large),
    );
    expect(conflicts.length).toBeGreaterThan(50);
    expect(ms).toBeLessThan(LIMIT_MS);
  });
});
