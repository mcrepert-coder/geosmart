import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import { AuditService } from '../audit/audit.service';
import type { SqlRunner } from '../audit/sql-runner';
import { ParcelGeometryService } from './geometry/parcel-geometry.service';
import { LandParcels1793102500000 } from './migrations/1793102500000-land-parcels';
import { LandParcelIdFormat1793103100000 } from './migrations/1793103100000-land-parcel-id-format';
import type { ParcelBoundary } from './parcel-version.entity';
import { LandActor, ParcelCreateInput, ParcelService } from './parcel.service';

jest.setTimeout(60000);

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

function boundaries(fix: ParcelBoundary['fixQuality'] = 'FIXED') {
  return [1, 2, 3, 4].map((n) => ({
    pointNumber: n,
    surveyPointId: randomUUID(),
    fixQuality: fix,
    pdop: 1.4,
    satellitesCount: 21,
    instrument: 'UM982',
  }));
}

function input(geometry: unknown, fix?: ParcelBoundary['fixQuality']) {
  return {
    surveySessionId: randomUUID(),
    commune: 'AG3',
    geometry,
    boundaries: boundaries(fix),
    locality: 'Agoe, Lome',
  } satisfies ParcelCreateInput;
}

const surveyor: LandActor = {
  id: randomUUID(),
  role: 'GEOMETRE',
  registeredSurveyor: true,
  accountActive: true,
};

describe('ParcelService.create (PostGIS)', () => {
  let db: PGlite;
  let runner: SqlRunner;
  let audit: AuditService;
  let service: ParcelService;

  async function count(table: string): Promise<number> {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table}`,
    );
    return rows[0].n;
  }

  async function lastAudit() {
    const { rows } = await db.query<{
      action: string;
      result: string;
      resource_id: string | null;
    }>('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    return rows[0];
  }

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    runner = { query: (sql, params) => db.query(sql, params) };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new LandParcels1793102500000().up(qr);
    await new LandParcelIdFormat1793103100000().up(qr);

    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    audit = new AuditService(dataSource);
    service = new ParcelService(dataSource, new ParcelGeometryService(), audit);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('cree la parcelle, sa version 1 et la ligne de journal', async () => {
    const parcel = await service.create(
      surveyor,
      input(square(1.21, 6.13)),
      randomUUID(),
    );

    expect(parcel.id).toBe('TG-AG3-00001');
    expect(parcel.version).toBe(1);
    expect(parcel.certified).toBe(true);
    expect(parcel.legalStatus).toBe('INCONNU');
    expect(parcel.areaM2).toBeGreaterThan(12000);
    expect(parcel.surveyor).toEqual({ id: surveyor.id });
    expect(parcel.boundaries).toHaveLength(4);
    expect(parcel.geometry.type).toBe('Polygon');
    expect(await count('parcel_versions')).toBe(1);
    expect(await lastAudit()).toMatchObject({
      action: 'PARCEL_CREATE',
      result: 'SUCCESS',
      resource_id: parcel.id,
    });
  });

  it('accepte une voisine qui partage une limite (CA-2)', async () => {
    const parcel = await service.create(
      surveyor,
      input(square(1.211, 6.13)),
      randomUUID(),
    );
    expect(parcel.id).toMatch(/00002$/);
  });

  it('refuse un chevauchement avec les deux voisines, ne cree rien et journalise l alerte (CA-2)', async () => {
    const before = await count('parcels');
    const error: unknown = await service
      .create(surveyor, input(square(1.2105, 6.1305)), randomUUID())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    const body = (error as ConflictException).getResponse() as {
      code: string;
      details: { conflicts: { parcelId: string }[]; auditSeq: number };
    };
    expect(body.code).toBe('PARCEL_OVERLAP');
    expect(body.details.conflicts.map((c) => c.parcelId)).toEqual([
      expect.stringMatching(/00001$/),
      expect.stringMatching(/00002$/),
    ]);
    expect(await count('parcels')).toBe(before);
    expect(await lastAudit()).toMatchObject({
      action: 'PARCEL_OVERLAP_REJECTED',
      result: 'REJECTED',
    });
    const { rows } = await db.query<{ seq: number }>(
      "SELECT seq::int FROM audit_log WHERE action = 'PARCEL_OVERLAP_REJECTED'",
    );
    expect(body.details.auditSeq).toBe(rows[0].seq);
  });

  it('refuse une geometrie invalide sans rien creer (422)', async () => {
    const before = await count('parcels');
    const bowtie = {
      type: 'Polygon',
      coordinates: [
        [
          [1.3, 6.2],
          [1.301, 6.201],
          [1.301, 6.2],
          [1.3, 6.201],
          [1.3, 6.2],
        ],
      ],
    };
    await expect(
      service.create(surveyor, input(bowtie), randomUUID()),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(await count('parcels')).toBe(before);
  });

  it('ne certifie pas une parcelle avec une borne en RTK Float (RG-03)', async () => {
    const parcel = await service.create(
      surveyor,
      input(square(1.4, 6.3), 'FLOAT'),
      randomUUID(),
    );
    expect(parcel.certified).toBe(false);
  });

  it('ne certifie pas une parcelle d un geometre non inscrit', async () => {
    const parcel = await service.create(
      { ...surveyor, registeredSurveyor: false },
      input(square(1.5, 6.3)),
      randomUUID(),
    );
    expect(parcel.certified).toBe(false);
  });

  it('renvoie la meme parcelle si la requete est rejouee (RG-08)', async () => {
    const key = randomUUID();
    const body = input(square(1.6, 6.3));
    const first = await service.create(surveyor, body, key);
    const before = await count('parcels');
    const replay = await service.create(surveyor, body, key);

    expect(replay).toEqual(first);
    expect(await count('parcels')).toBe(before);
  });

  it('refuse une cle de requete reprise par un autre geometre', async () => {
    const key = randomUUID();
    await service.create(surveyor, input(square(1.7, 6.3)), key);
    await expect(
      service.create(
        { ...surveyor, id: randomUUID() },
        input(square(1.8, 6.3)),
        key,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['AGENT', 'ADMIN', 'TOPOGRAPHE', 'CLIENT'])(
    'refuse le role %s et journalise le refus',
    async (role) => {
      const before = await count('parcels');
      await expect(
        service.create(
          { id: randomUUID(), role },
          input(square(1.9, 6.3)),
          randomUUID(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await count('parcels')).toBe(before);
      expect(await lastAudit()).toMatchObject({
        action: 'ACCESS_DENIED',
        result: 'DENIED',
      });
    },
  );

  it.each([
    ['une cle de requete absente', (b: ParcelCreateInput) => b, ''],
    [
      'moins de 3 bornes',
      (b: ParcelCreateInput) => ({
        ...b,
        boundaries: b.boundaries.slice(0, 2),
      }),
      randomUUID(),
    ],
    [
      'plus de 500 bornes',
      (b: ParcelCreateInput) => ({
        ...b,
        boundaries: Array.from({ length: 501 }, (_, i) => ({
          ...b.boundaries[0],
          pointNumber: i + 1,
        })),
      }),
      randomUUID(),
    ],
    [
      'un chantier sans identifiant',
      (b: ParcelCreateInput) => ({ ...b, surveySessionId: 'chantier-1' }),
      randomUUID(),
    ],
  ])('refuse %s (400)', async (_label, change, key) => {
    await expect(
      service.create(surveyor, change(input(square(2, 6.3))), key),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('numerote chaque commune separement', async () => {
    const lome = await service.create(
      surveyor,
      { ...input(square(2.1, 6.4)), commune: 'GO1' },
      randomUUID(),
    );
    expect(lome.id).toBe('TG-GO1-00001');
  });

  it('refuse une commune hors de la liste (400)', async () => {
    await expect(
      service.create(
        surveyor,
        { ...input(square(2.2, 6.4)), commune: 'XYZ' },
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('laisse un journal dont la chaine est intacte', async () => {
    await expect(audit.verify(runner)).resolves.toMatchObject({
      valid: true,
      firstBrokenSeq: null,
    });
  });
});
