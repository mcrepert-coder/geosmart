import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import { AuditService } from '../audit/audit.service';
import type { SqlRunner } from '../audit/sql-runner';
import { ParcelGeometryService } from './geometry/parcel-geometry.service';
import { LandParcels1793102500000 } from './migrations/1793102500000-land-parcels';
import { ParcelStatusService } from './parcel-status.service';
import {
  BornageInput,
  LandActor,
  ParcelService,
  normalizeBornage,
} from './parcel.service';

jest.setTimeout(60000);

function square(lon: number) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon, 6.13],
        [lon + 0.001, 6.13],
        [lon + 0.001, 6.131],
        [lon, 6.131],
        [lon, 6.13],
      ],
    ],
  };
}

const boundaries = [1, 2, 3, 4].map((n) => ({
  pointNumber: n,
  surveyPointId: randomUUID(),
  fixQuality: 'FIXED' as const,
}));

const author: LandActor = {
  id: randomUUID(),
  role: 'GEOMETRE',
  registeredSurveyor: true,
};

describe('normalizeBornage', () => {
  it('nettoie les noms et la date', () => {
    expect(
      normalizeBornage({
        neighboursPresent: ['  Kossi A. ', 'Ama B.'],
        heldAt: '2026-10-20T09:30:00+00:00',
      }),
    ).toEqual({
      neighboursPresent: ['Kossi A.', 'Ama B.'],
      heldAt: '2026-10-20T09:30:00.000Z',
    });
  });

  it('accepte un bornage absent', () => {
    expect(normalizeBornage(undefined)).toBeNull();
  });

  it.each<[string, BornageInput]>([
    ['un nom vide', { neighboursPresent: ['  '], heldAt: '2026-10-20' }],
    [
      'trop de voisins',
      {
        neighboursPresent: Array(21).fill('X') as string[],
        heldAt: '2026-10-20',
      },
    ],
    ['une date illisible', { neighboursPresent: [], heldAt: 'hier' }],
    ['une date future', { neighboursPresent: [], heldAt: '2999-01-01' }],
    [
      'une liste absente',
      { neighboursPresent: 'Kossi' as never, heldAt: '2026-10-20' },
    ],
  ])('refuse %s', (_label, input) => {
    expect(() => normalizeBornage(input)).toThrow(BadRequestException);
  });
});

describe('bornage enregistre avec la version (PostGIS)', () => {
  let db: PGlite;
  let parcels: ParcelService;
  let status: ParcelStatusService;

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    const runner: SqlRunner = { query: (sql, params) => db.query(sql, params) };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new LandParcels1793102500000().up(qr);
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    const audit = new AuditService(dataSource);
    parcels = new ParcelService(dataSource, new ParcelGeometryService(), audit);
    status = new ParcelStatusService(dataSource, audit);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('garde les voisins par version et ne les montre qu a l auteur et a l admin', async () => {
    const created = await parcels.create(
      author,
      {
        surveySessionId: randomUUID(),
        geometry: square(1.21),
        boundaries,
        bornage: {
          neighboursPresent: ['Kossi A.', 'Ama B.'],
          heldAt: '2026-10-20T09:30:00Z',
        },
      },
      randomUUID(),
    );
    expect(created.bornage).toEqual({
      neighboursPresent: ['Kossi A.', 'Ama B.'],
      heldAt: '2026-10-20T09:30:00.000Z',
    });

    const forAgent = await parcels.findOne(
      { id: randomUUID(), role: 'AGENT' },
      created.id,
    );
    expect(forAgent).not.toHaveProperty('bornage');
    const forAdmin = await parcels.findOne(
      { id: randomUUID(), role: 'ADMIN' },
      created.id,
    );
    expect(forAdmin.bornage?.neighboursPresent).toEqual(['Kossi A.', 'Ama B.']);
    expect(
      JSON.stringify(await status.getPublicStatus(created.id)),
    ).not.toContain('Kossi');

    const updated = await parcels.update(author, created.id, {
      expectedVersion: 1,
      geometry: square(1.21),
      boundaries,
    });
    expect(updated.bornage).toBeNull();
    const { rows } = await db.query<{ version: number; bornage: unknown }>(
      'SELECT version, bornage FROM parcel_versions WHERE parcel_id = $1 ORDER BY version',
      [created.id],
    );
    expect(rows.map((r) => r.bornage === null)).toEqual([false, true]);
  });
});
