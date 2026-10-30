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
import { LandParcelIdFormat1793103100000 } from './migrations/1793103100000-land-parcel-id-format';
import { ParcelStatusService } from './parcel-status.service';
import {
  BornageInput,
  BornageNeighbour,
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
  accountActive: true,
};

// Voisins de la maquette T6.
const neighbours: BornageNeighbour[] = [
  {
    name: 'Komlan Adjete',
    phone: '+228 90 44 21 08',
    side: 'N',
    present: true,
  },
  { name: 'Abla Mensah', phone: '+228 91 07 66 34', side: 'E', present: true },
  {
    name: 'Famille Tchalla',
    side: 'S',
    present: false,
    representedBy: 'Essowe T.',
  },
];

function bornage(list: unknown[], heldAt = '2026-10-20'): BornageInput {
  return { neighbours: list as BornageNeighbour[], heldAt };
}

describe('normalizeBornage', () => {
  it('nettoie les voisins et la date', () => {
    expect(
      normalizeBornage(
        bornage(
          [{ ...neighbours[0], name: '  Komlan Adjete ' }, neighbours[2]],
          '2026-10-20T09:30:00+00:00',
        ),
      ),
    ).toEqual({
      neighbours: [neighbours[0], neighbours[2]],
      heldAt: '2026-10-20T09:30:00.000Z',
    });
  });

  it('accepte un bornage absent', () => {
    expect(normalizeBornage(undefined)).toBeNull();
  });

  it.each<[string, BornageInput]>([
    ['un nom vide', bornage([{ ...neighbours[0], name: '  ' }])],
    ['un cote inconnu', bornage([{ ...neighbours[0], side: 'NE' }])],
    ['une presence absente', bornage([{ name: 'X', side: 'N' }])],
    [
      'un telephone hors Togo',
      bornage([{ ...neighbours[0], phone: '+33 6 12 34 56 78' }]),
    ],
    ['trop de voisins', bornage(Array(21).fill(neighbours[0]) as unknown[])],
    ['une date illisible', bornage([], 'hier')],
    ['une date future', bornage([], '2999-01-01')],
    [
      'une liste absente',
      { neighbours: 'Kossi' as never, heldAt: '2026-10-20' },
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
    await new LandParcelIdFormat1793103100000().up(qr);
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
        commune: 'AG3',
        geometry: square(1.21),
        boundaries,
        bornage: bornage(neighbours, '2026-10-20T09:30:00Z'),
      },
      randomUUID(),
    );
    expect(created.bornage).toEqual({
      neighbours,
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
    expect(forAdmin.bornage?.neighbours).toHaveLength(3);

    // La page publique ne donne qu'un resume chiffre (maquette C1).
    const publicStatus = await status.getPublicStatus(created.id);
    expect(publicStatus.bornage).toEqual({
      neighboursTotal: 3,
      neighboursPresent: 2,
      heldAt: '2026-10-20T09:30:00.000Z',
    });
    const text = JSON.stringify(publicStatus);
    expect(text).not.toContain('Komlan');
    expect(text).not.toContain('+228');

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
    expect((await status.getPublicStatus(created.id)).versionsCount).toBe(2);
  });
});
