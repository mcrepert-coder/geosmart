import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import { AuditService } from '../audit/audit.service';
import type { SqlRunner } from '../audit/sql-runner';
import { ParcelGeometryService } from './geometry/parcel-geometry.service';
import { LandParcels1793102500000 } from './migrations/1793102500000-land-parcels';
import type { ParcelBoundary } from './parcel-version.entity';
import { LandActor, ParcelService, ParcelView } from './parcel.service';

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
  }));
}

const author: LandActor = {
  id: randomUUID(),
  role: 'GEOMETRE',
  registeredSurveyor: true,
  accountActive: true,
};

describe('ParcelService.update et listVersions (PostGIS)', () => {
  let db: PGlite;
  let service: ParcelService;
  let audit: AuditService;
  let runner: SqlRunner;
  let parcel: ParcelView;
  let neighbour: ParcelView;

  async function lastAudit() {
    const { rows } = await db.query<{
      action: string;
      result: string;
      resource_id: string | null;
      details: Record<string, unknown>;
    }>('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    return rows[0];
  }

  async function currentVersion(id: string): Promise<number> {
    const { rows } = await db.query<{ v: number }>(
      'SELECT current_version AS v FROM parcels WHERE id = $1',
      [id],
    );
    return rows[0].v;
  }

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    runner = { query: (sql, params) => db.query(sql, params) };
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
    audit = new AuditService(dataSource);
    service = new ParcelService(dataSource, new ParcelGeometryService(), audit);

    const create = (lon: number) =>
      service.create(
        author,
        {
          surveySessionId: randomUUID(),
          commune: 'AGO',
          geometry: square(lon, 6.13),
          boundaries: boundaries(),
        },
        randomUUID(),
      );
    parcel = await create(1.21);
    neighbour = await create(1.212);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('cree la version 2, garde la version 1 et journalise', async () => {
    const updated = await service.update(author, parcel.id, {
      expectedVersion: 1,
      geometry: square(1.21, 6.13, 0.0012),
      boundaries: boundaries(),
      reason: 'Reprise de la borne B3 apres bornage',
    });

    expect(updated.version).toBe(2);
    expect(updated.areaM2).toBeGreaterThan(parcel.areaM2);
    expect(updated.geometryHash).not.toBe(parcel.geometryHash);
    const versions = await service.listVersions(author, parcel.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[1].geometryHash).toBe(parcel.geometryHash);
    expect(versions[0].reason).toBe('Reprise de la borne B3 apres bornage');
    expect(await lastAudit()).toMatchObject({
      action: 'PARCEL_UPDATE',
      result: 'SUCCESS',
      resource_id: parcel.id,
      details: expect.objectContaining({
        version: 2,
        previousGeometryHash: parcel.geometryHash,
      }) as unknown,
    });
  });

  it('refuse une version perimee sans rien changer (409)', async () => {
    const error: unknown = await service
      .update(author, parcel.id, {
        expectedVersion: 1,
        geometry: square(1.21, 6.13, 0.0011),
        boundaries: boundaries(),
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: 2 },
    });
    expect(await currentVersion(parcel.id)).toBe(2);
  });

  it('refuse une limite qui empiete sur la voisine et journalise (409)', async () => {
    const error: unknown = await service
      .update(author, parcel.id, {
        expectedVersion: 2,
        geometry: square(1.21, 6.13, 0.0025),
        boundaries: boundaries(),
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'PARCEL_OVERLAP',
      details: { conflicts: [{ parcelId: neighbour.id }] },
    });
    expect(await currentVersion(parcel.id)).toBe(2);
    expect(await lastAudit()).toMatchObject({
      action: 'PARCEL_OVERLAP_REJECTED',
      resource_id: parcel.id,
    });
  });

  it('accepte de toucher la voisine sur une limite commune', async () => {
    const updated = await service.update(author, parcel.id, {
      expectedVersion: 2,
      geometry: square(1.21, 6.13, 0.002),
      boundaries: boundaries(),
    });
    expect(updated.version).toBe(3);
  });

  it('retire la certification si une borne passe en RTK Float', async () => {
    const updated = await service.update(author, parcel.id, {
      expectedVersion: 3,
      geometry: square(1.21, 6.13, 0.002),
      boundaries: boundaries('FLOAT'),
    });
    expect(updated.certified).toBe(false);
  });

  it("refuse un autre geometre que l'auteur et journalise (403)", async () => {
    await expect(
      service.update({ ...author, id: randomUUID() }, parcel.id, {
        expectedVersion: 4,
        geometry: square(1.21, 6.13),
        boundaries: boundaries(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await currentVersion(parcel.id)).toBe(4);
    expect(await lastAudit()).toMatchObject({
      action: 'ACCESS_DENIED',
      resource_id: parcel.id,
    });
  });

  it.each(['AGENT', 'ADMIN', 'TOPOGRAPHE', 'CLIENT'])(
    'refuse la modification par le role %s (CA-4)',
    async (role) => {
      await expect(
        service.update({ id: randomUUID(), role }, parcel.id, {
          expectedVersion: 4,
          geometry: square(1.21, 6.13),
          boundaries: boundaries(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await currentVersion(parcel.id)).toBe(4);
    },
  );

  it('repond 404 pour une parcelle inconnue', async () => {
    await expect(
      service.update(author, 'TG-AGO-99999', {
        expectedVersion: 1,
        geometry: square(1.21, 6.13),
        boundaries: boundaries(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.listVersions(author, 'TG-AGO-99999'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse une version attendue invalide (400)', async () => {
    await expect(
      service.update(author, parcel.id, {
        expectedVersion: 0,
        geometry: square(1.21, 6.13),
        boundaries: boundaries(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reserve l'historique a ADMIN et GEOMETRE", async () => {
    await expect(
      service.listVersions({ id: randomUUID(), role: 'ADMIN' }, parcel.id),
    ).resolves.toHaveLength(4);
    await expect(
      service.listVersions({ id: randomUUID(), role: 'AGENT' }, parcel.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('laisse un journal dont la chaine est intacte', async () => {
    await expect(audit.verify(runner)).resolves.toMatchObject({ valid: true });
  });
});
