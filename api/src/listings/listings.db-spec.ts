import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import { LandParcels1793102500000 } from '../land/migrations/1793102500000-land-parcels';
import { LandParcelIdFormat1793103100000 } from '../land/migrations/1793103100000-land-parcel-id-format';
import { Listings1793103200000 } from './migrations/1793103200000-listings';
import { ListingsService } from './listings.service';

jest.setTimeout(60000);

const PARCEL_ID = 'TG-AGO-00001';
const AGENT_ID = 'b1f0c2a4-1111-4a10-9c01-0a1b2c3d4e01';
const AGENT = { id: AGENT_ID, role: 'AGENT', accountActive: true };
const GEOMETRY =
  "ST_GeomFromText('POLYGON((1.21 6.13,1.211 6.13,1.211 6.131,1.21 6.131,1.21 6.13))', 4326)";

describe('ListingsService with PostgreSQL migrations', () => {
  let db: PGlite;
  let service: ListingsService;
  const audit = new AuditLog1793102400000();
  const land = new LandParcels1793102500000();
  const idFormat = new LandParcelIdFormat1793103100000();
  const listings = new Listings1793103200000();

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    const runner = {
      query: (sql: string, params?: unknown[]) => db.query(sql, params),
    } as unknown as QueryRunner;
    await audit.up(runner);
    await land.up(runner);
    await idFormat.up(runner);
    await listings.up(runner);
    await db.query(
      `INSERT INTO parcels
         (id, commune, geom, area_m2, perimeter_m, geometry_hash,
          surveyor_id, survey_session_id, idempotency_key, legal_status, certified)
       VALUES ($1, 'AGO', ${GEOMETRY}, 450, 90, repeat('a', 64),
               $2, gen_random_uuid(), gen_random_uuid(), 'INCONNU', true)`,
      [PARCEL_ID, AGENT_ID],
    );
    const parcelService = {
      getPublicStatus: async (id: string) => {
        const { rows } = await db.query<{
          id: string;
          legal_status:
            'TITRE' | 'COUTUMIER_NON_TITRE' | 'EN_LITIGE' | 'INCONNU';
          certified: boolean;
          area_m2: number;
        }>(
          'SELECT id, legal_status, certified, area_m2 FROM parcels WHERE id = $1',
          [id],
        );
        if (!rows[0]) throw new Error('parcel not found');
        return {
          id: rows[0].id,
          legalStatus: rows[0].legal_status,
          certified: rows[0].certified,
          areaM2: rows[0].area_m2,
        };
      },
    };
    service = new ListingsService(
      {
        query: (sql: string, params?: unknown[]) => db.query(sql, params),
      } as unknown as DataSource,
      parcelService as never,
    );
  });

  afterAll(async () => {
    await listings.down(db as unknown as QueryRunner);
    await idFormat.down(db as unknown as QueryRunner);
    await land.down(db as unknown as QueryRunner);
    await audit.down(db as unknown as QueryRunner);
    await db?.close();
  });

  it('publie et recherche un bien avec son statut foncier et son point indicatif', async () => {
    const created = await service.create(AGENT, {
      parcelId: PARCEL_ID,
      type: 'TERRAIN',
      transaction: 'VENTE',
      title: 'Terrain de test',
      price: 18_500_000,
      zone: 'Agoe',
      status: 'PUBLIE',
    });

    expect(created.status).toBe('PUBLIE');
    expect(created.parcel.certified).toBe(true);
    expect(created.parcel.approximateLocation.latitude).toBe(6.13);
    expect(created.publicUrl).toContain(created.id);
    const page = await service.search({
      type: 'TERRAIN',
      parcelCertified: 'true',
      q: 'Agoe',
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(created.id);
  });

  it('enregistre les photos privees en base et rend public le contenu publie', async () => {
    const created = await service.create(AGENT, {
      parcelId: PARCEL_ID,
      type: 'MAISON',
      transaction: 'VENTE',
      title: 'Maison de test',
      price: 20_000_000,
      status: 'PUBLIE',
    });
    const bytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
    ]);
    const photo = await service.uploadPhoto(AGENT, created.id, {
      mimetype: 'image/png',
      size: bytes.length,
      buffer: bytes,
    });

    expect(photo.isPrimary).toBe(true);
    expect(photo.contentType).toBe('image/png');
    await expect(
      service.photoContent(created.id, photo.id),
    ).resolves.toMatchObject({
      contentType: 'image/png',
      data: bytes,
    });
    await service.deletePhoto(AGENT, created.id, photo.id);
    await expect(service.photoContent(created.id, photo.id)).rejects.toThrow();
  });

  it('ne publie pas une parcelle en litige', async () => {
    await db.query(
      `UPDATE parcels SET legal_status = 'EN_LITIGE',
         status_source = 'ANDF', status_date = '2026-10-01', dispute_note = 'litige'
       WHERE id = $1`,
      [PARCEL_ID],
    );
    await expect(
      service.create(AGENT, {
        parcelId: PARCEL_ID,
        type: 'TERRAIN',
        transaction: 'VENTE',
        title: 'Parcelle bloquee',
        price: 1000,
        status: 'PUBLIE',
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('refuse le type et le couplage prix/periode invalides au niveau SQL', async () => {
    await expect(
      db.query(
        `INSERT INTO properties
           (parcel_id, agent_id, type, transaction, title, price, price_period)
         VALUES ($1, $2, 'VILLA', 'VENTE', 'Invalid', 100, 'MOIS')`,
        [PARCEL_ID, AGENT_ID],
      ),
    ).rejects.toThrow();
  });
});
