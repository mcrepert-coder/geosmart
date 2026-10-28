import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import {
  BadRequestException,
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
import {
  LegalStatusInput,
  NOT_A_LAND_TITLE,
  ParcelStatusService,
} from './parcel-status.service';
import { LandActor, ParcelService, ParcelView } from './parcel.service';

jest.setTimeout(60000);

const admin: LandActor = { id: randomUUID(), role: 'ADMIN' };
const surveyor: LandActor = {
  id: randomUUID(),
  role: 'GEOMETRE',
  registeredSurveyor: true,
};

describe('ParcelStatusService (PostGIS)', () => {
  let db: PGlite;
  let runner: SqlRunner;
  let audit: AuditService;
  let status: ParcelStatusService;
  let parcel: ParcelView;

  async function lastAudit() {
    const { rows } = await db.query<{
      action: string;
      result: string;
      details: Record<string, unknown>;
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
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    audit = new AuditService(dataSource);
    status = new ParcelStatusService(dataSource, audit);
    parcel = await new ParcelService(
      dataSource,
      new ParcelGeometryService(),
      audit,
    ).create(
      surveyor,
      {
        surveySessionId: randomUUID(),
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [1.21, 6.13],
              [1.211, 6.13],
              [1.211, 6.131],
              [1.21, 6.131],
              [1.21, 6.13],
            ],
          ],
        },
        boundaries: [1, 2, 3, 4].map((n) => ({
          pointNumber: n,
          surveyPointId: randomUUID(),
          fixQuality: 'FIXED' as const,
        })),
      },
      randomUUID(),
    );
  });

  afterAll(async () => {
    await db?.close();
  });

  describe('getPublicStatus', () => {
    it('signale un statut non renseigne, sans donnee personnelle', async () => {
      const result = await status.getPublicStatus(parcel.id);

      expect(result).toEqual({
        id: parcel.id,
        legalStatus: 'INCONNU',
        statusSource: null,
        statusDate: null,
        certified: true,
        areaM2: parcel.areaM2,
        version: 1,
        updatedAt: expect.any(String) as unknown,
        warnings: [
          'Statut juridique non renseigne par une source autorisee.',
          NOT_A_LAND_TITLE,
        ],
      });
      const text = JSON.stringify(result);
      expect(text).not.toContain(surveyor.id);
      expect(text).not.toContain('coordinates');
    });

    it.each(['GS-2026-999999', 'pas-un-identifiant', ''])(
      'repond 404 pour %p',
      async (id) => {
        await expect(status.getPublicStatus(id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      },
    );
  });

  describe('setLegalStatus', () => {
    it('enregistre un statut source et date, et journalise', async () => {
      const result = await status.setLegalStatus(admin, parcel.id, {
        legalStatus: 'TITRE',
        source: '  Releve ANDF n. 2026/1187  ',
        documentDate: '2026-10-01',
        note: 'Copie certifiee recue au guichet',
      });

      expect(result).toMatchObject({
        legalStatus: 'TITRE',
        statusSource: 'Releve ANDF n. 2026/1187',
        statusDate: '2026-10-01',
        warnings: [NOT_A_LAND_TITLE],
      });
      expect(await lastAudit()).toMatchObject({
        action: 'PARCEL_STATUS_SET',
        result: 'SUCCESS',
        details: {
          previous: {
            legalStatus: 'INCONNU',
            source: null,
            documentDate: null,
          },
          legalStatus: 'TITRE',
          source: 'Releve ANDF n. 2026/1187',
          documentDate: '2026-10-01',
          note: 'Copie certifiee recue au guichet',
        },
      });
    });

    it('avertit quand la source signale un litige', async () => {
      const result = await status.setLegalStatus(admin, parcel.id, {
        legalStatus: 'EN_LITIGE',
        source: 'Tribunal de Lome, ordonnance 2026/88',
        documentDate: '2026-10-20',
      });
      expect(result.warnings).toContain(
        'Parcelle signalee en litige par la source indiquee.',
      );
    });

    it('efface source et date quand le statut redevient INCONNU', async () => {
      const result = await status.setLegalStatus(admin, parcel.id, {
        legalStatus: 'INCONNU',
        source: 'ignoree',
        documentDate: '2026-10-20',
      });
      expect(result).toMatchObject({ statusSource: null, statusDate: null });
    });

    it.each<[string, LegalStatusInput]>([
      ['un statut hors liste', { legalStatus: 'VENDU' as never }],
      [
        'un statut sans source',
        { legalStatus: 'TITRE', documentDate: '2026-10-01' },
      ],
      [
        'une source vide',
        { legalStatus: 'TITRE', source: '   ', documentDate: '2026-10-01' },
      ],
      [
        'une date mal formee',
        { legalStatus: 'TITRE', source: 'ANDF', documentDate: '01/10/2026' },
      ],
      [
        'une date impossible',
        { legalStatus: 'TITRE', source: 'ANDF', documentDate: '2026-02-30' },
      ],
      [
        'une date future',
        { legalStatus: 'TITRE', source: 'ANDF', documentDate: '2999-01-01' },
      ],
    ])('refuse %s (400)', async (_label, input) => {
      await expect(
        status.setLegalStatus(admin, parcel.id, input),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['GEOMETRE', 'AGENT', 'TOPOGRAPHE', 'CLIENT'])(
      'refuse le role %s et journalise le refus (403)',
      async (role) => {
        await expect(
          status.setLegalStatus({ id: randomUUID(), role }, parcel.id, {
            legalStatus: 'TITRE',
            source: 'ANDF',
            documentDate: '2026-10-01',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await lastAudit()).toMatchObject({
          action: 'ACCESS_DENIED',
          result: 'DENIED',
        });
        expect((await status.getPublicStatus(parcel.id)).legalStatus).toBe(
          'INCONNU',
        );
      },
    );

    it('repond 404 pour une parcelle inconnue', async () => {
      await expect(
        status.setLegalStatus(admin, 'GS-2026-999999', {
          legalStatus: 'INCONNU',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('laisse un journal dont la chaine est intacte', async () => {
    await expect(audit.verify(runner)).resolves.toMatchObject({ valid: true });
  });
});
