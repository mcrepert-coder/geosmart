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
import { LandParcelIdFormat1793103100000 } from './migrations/1793103100000-land-parcel-id-format';
import { LandOverlapAlertReviews1793102900000 } from './migrations/1793102900000-land-overlap-alert-reviews';
import { OverlapAlertService } from './overlap-alert.service';
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

const boundaries = [1, 2, 3, 4].map((n) => ({
  pointNumber: n,
  surveyPointId: randomUUID(),
  fixQuality: 'FIXED' as const,
}));

const surveyor: LandActor = {
  id: randomUUID(),
  role: 'GEOMETRE',
  registeredSurveyor: true,
  accountActive: true,
};
const admin: LandActor = {
  id: randomUUID(),
  role: 'ADMIN',
  accountActive: true,
};

describe('OverlapAlertService (PostGIS)', () => {
  let db: PGlite;
  let parcels: ParcelService;
  let alerts: OverlapAlertService;
  let existing: ParcelView;
  let other: ParcelView;

  const create = (lon: number) =>
    parcels.create(
      surveyor,
      {
        surveySessionId: randomUUID(),
        commune: 'AG3',
        geometry: square(lon, 6.13),
        boundaries,
      },
      randomUUID(),
    );

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    const runner: SqlRunner = { query: (sql, params) => db.query(sql, params) };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new LandParcels1793102500000().up(qr);
    await new LandParcelIdFormat1793103100000().up(qr);
    await new LandOverlapAlertReviews1793102900000().up(qr);
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    const audit = new AuditService(dataSource);
    parcels = new ParcelService(dataSource, new ParcelGeometryService(), audit);
    alerts = new OverlapAlertService(dataSource, audit);

    existing = await create(1.21);
    other = await create(1.3);
    // Creation refusee : recouvre la moitie est de la premiere parcelle.
    await create(1.2105).catch(() => undefined);
    // Modification refusee : la seconde parcelle s'etend sur la premiere.
    await parcels
      .update(surveyor, other.id, {
        expectedVersion: 1,
        geometry: square(1.2108, 6.13, 0.0012),
        boundaries,
      })
      .catch(() => undefined);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('liste les refus, du plus recent au plus ancien, avec les deux polygones', async () => {
    const list = await alerts.list(admin);

    expect(list).toHaveLength(2);
    const [update, creation] = list;
    expect(update.auditSeq).toBeGreaterThan(creation.auditSeq);

    expect(creation.submittedParcelId).toBeNull();
    expect(creation.surveySessionId).toEqual(expect.any(String));
    expect(creation.submittedGeometry?.type).toBe('Polygon');
    expect(creation.conflicts).toHaveLength(1);
    const c = creation.conflicts[0];
    expect(c).toMatchObject({
      parcelId: existing.id,
      version: 1,
      legalStatus: 'INCONNU',
      certified: true,
    });
    expect(c.overlapAreaM2).toBeGreaterThan(5900);
    expect(c.geometry?.type).toBe('Polygon');
    expect(c.overlap?.type).toBe('Polygon');

    expect(update.submittedParcelId).toBe(other.id);
    expect(update.conflicts.map((x) => x.parcelId)).toEqual([existing.id]);
    expect(update.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(update.prevHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('respecte la limite demandee', async () => {
    await expect(alerts.list(admin, '1')).resolves.toHaveLength(1);
    await expect(alerts.list(admin, '0')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each(['GEOMETRE', 'AGENT', 'CLIENT'])(
    'refuse le role %s (403)',
    async (role) => {
      await expect(
        alerts.list({ id: randomUUID(), role }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  describe('examen par l administrateur (bouton W3)', () => {
    it('marque une alerte comme examinee, une seule fois', async () => {
      const [open] = await alerts.list(admin);
      expect(open.review).toBeNull();

      const reviewed = await alerts.review(
        admin,
        String(open.auditSeq),
        '  Geometre contacte.  ',
      );
      expect(reviewed.review).toMatchObject({
        reviewedBy: admin.id,
        note: 'Geometre contacte.',
      });

      const again: unknown = await alerts
        .review(admin, open.auditSeq)
        .catch((e: unknown) => e);
      expect(again).toBeInstanceOf(ConflictException);
      expect((again as ConflictException).getResponse()).toMatchObject({
        code: 'ALERT_ALREADY_REVIEWED',
      });
    });

    it('filtre les alertes ouvertes et examinees', async () => {
      const open = await alerts.list(admin, 50, 'open');
      const reviewed = await alerts.list(admin, 50, 'reviewed');
      expect(open).toHaveLength(1);
      expect(reviewed).toHaveLength(1);
      expect(reviewed[0].review).not.toBeNull();
      await expect(alerts.list(admin, 50, 'toutes')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('repond 404 pour une ligne qui n est pas une alerte', async () => {
      // La ligne 1 du journal est la creation de la premiere parcelle.
      await expect(alerts.review(admin, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(alerts.review(admin, 'abc')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuse un geometre (403)', async () => {
      const [open] = await alerts.list(admin, 50, 'open');
      await expect(
        alerts.review(surveyor, open.auditSeq),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
