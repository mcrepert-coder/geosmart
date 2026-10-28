import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { LandParcels1793102500000 } from '../migrations/1793102500000-land-parcels';
import type { SqlRunner } from '../../audit/sql-runner';
import { ParcelGeometryService } from './parcel-geometry.service';

jest.setTimeout(60000);

// Carres d'environ 110 m de cote pres de Lome (1 millieme de degre).
function square(lon: number, lat: number, size = 0.001) {
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

describe('ParcelGeometryService (PostGIS)', () => {
  let db: PGlite;
  let runner: SqlRunner;
  const service = new ParcelGeometryService();
  const base = square(1.21, 6.13);

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    runner = { query: (sql, params) => db.query(sql, params) };
    await new LandParcels1793102500000().up(runner as unknown as QueryRunner);
    const checked = await service.check(runner, base);
    await db.query(
      `INSERT INTO parcels (id, geom, area_m2, perimeter_m, geometry_hash,
         surveyor_id, survey_session_id, idempotency_key, commune)
       VALUES ('TG-AGO-00001', ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
         $2, $3, $4, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'AGO')`,
      [
        JSON.stringify(checked.polygon),
        checked.areaM2,
        checked.perimeterM,
        checked.geometryHash,
      ],
    );
  });

  afterAll(async () => {
    await db?.close();
  });

  describe('check', () => {
    it('calcule surface et perimetre en UTM 31N', async () => {
      const checked = await service.check(runner, base);
      // 0,001 degre vaut environ 110,6 m en latitude et 110,7 m en longitude ici.
      expect(checked.areaM2).toBeGreaterThan(12000);
      expect(checked.areaM2).toBeLessThan(12500);
      expect(checked.perimeterM).toBeGreaterThan(440);
      expect(checked.perimeterM).toBeLessThan(445);
      expect(checked.geometryHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('refuse un polygone qui se recoupe (422)', async () => {
      const bowtie = {
        type: 'Polygon',
        coordinates: [
          [
            [1.21, 6.13],
            [1.211, 6.131],
            [1.211, 6.13],
            [1.21, 6.131],
            [1.21, 6.13],
          ],
        ],
      };
      const error: unknown = await service
        .check(runner, bowtie)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        code: 'INVALID_GEOMETRY',
        message: 'Le polygone se recoupe lui-meme.',
        details: { reason: 'SELF_INTERSECTION' },
      });
    });

    it('refuse moins de 3 sommets distincts avant PostGIS', async () => {
      const flat = {
        type: 'Polygon',
        coordinates: [
          [
            [1.21, 6.13],
            [1.211, 6.13],
            [1.21, 6.13],
          ],
        ],
      };
      await expect(service.check(runner, flat)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  describe('findOverlaps', () => {
    it('trouve une parcelle qui chevauche', async () => {
      const shifted = square(1.2105, 6.1305);
      const conflicts = await service.findOverlaps(
        runner,
        (await service.check(runner, shifted)).polygon,
      );
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].parcelId).toBe('TG-AGO-00001');
      // Un quart du carre recouvert : environ 3 060 m2.
      expect(conflicts[0].overlapAreaM2).toBeGreaterThan(2900);
      expect(conflicts[0].overlapAreaM2).toBeLessThan(3200);
    });

    it('trouve une parcelle entierement contenue', async () => {
      const inner = square(1.2102, 6.1302, 0.0005);
      expect(
        await service.findOverlaps(
          runner,
          (await service.check(runner, inner)).polygon,
        ),
      ).toHaveLength(1);
    });

    it('accepte une voisine qui partage une limite', async () => {
      const neighbour = square(1.211, 6.13);
      expect(
        await service.findOverlaps(
          runner,
          (await service.check(runner, neighbour)).polygon,
        ),
      ).toEqual([]);
    });

    it('accepte une voisine qui ne touche qu un sommet', async () => {
      const corner = square(1.211, 6.131);
      expect(
        await service.findOverlaps(
          runner,
          (await service.check(runner, corner)).polygon,
        ),
      ).toEqual([]);
    });

    it('accepte une parcelle eloignee', async () => {
      const far = square(1.3, 6.2);
      expect(
        await service.findOverlaps(
          runner,
          (await service.check(runner, far)).polygon,
        ),
      ).toEqual([]);
    });

    it('ignore la parcelle elle-meme lors d une modification', async () => {
      const moved = square(1.2101, 6.13);
      expect(
        await service.findOverlaps(
          runner,
          (await service.check(runner, moved)).polygon,
          'TG-AGO-00001',
        ),
      ).toEqual([]);
    });

    it('respecte la tolerance configuree', async () => {
      const sliver = square(1.21095, 6.13);
      const polygon = (await service.check(runner, sliver)).polygon;
      expect(await service.findOverlaps(runner, polygon)).toHaveLength(1);
      process.env.LAND_OVERLAP_TOLERANCE_M2 = '1000';
      try {
        expect(await service.findOverlaps(runner, polygon)).toEqual([]);
      } finally {
        delete process.env.LAND_OVERLAP_TOLERANCE_M2;
      }
    });
  });

  it('formate le 409 du contrat', () => {
    const error = service.overlapError(
      [{ parcelId: 'TG-AGO-00001', overlapAreaM2: 42.7 }],
      1205,
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'PARCEL_OVERLAP',
      details: {
        conflicts: [{ parcelId: 'TG-AGO-00001', overlapAreaM2: 42.7 }],
        auditSeq: 1205,
      },
    });
  });
});
