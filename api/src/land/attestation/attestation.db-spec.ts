import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditLog1793102400000 } from '../../audit/migrations/1793102400000-audit-log';
import { AuditService } from '../../audit/audit.service';
import type { SqlRunner } from '../../audit/sql-runner';
import { ParcelGeometryService } from '../geometry/parcel-geometry.service';
import { LandAttestations1793102600000 } from '../migrations/1793102600000-land-attestations';
import { LandParcels1793102500000 } from '../migrations/1793102500000-land-parcels';
import type { ParcelBoundary } from '../parcel-version.entity';
import { LandActor, ParcelService, ParcelView } from '../parcel.service';
import { ATTESTATION_MENTION } from './attestation-pdf';
import { AttestationService } from './attestation.service';

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

function boundaries(fix: ParcelBoundary['fixQuality'][] = []) {
  return [1, 2, 3, 4].map((n) => ({
    pointNumber: n,
    name: `B${n}`,
    surveyPointId: randomUUID(),
    fixQuality: fix[n - 1] ?? 'FIXED',
    pdop: 1.4,
    satellitesCount: 21,
  }));
}

async function pdfText(pdf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
}

const surveyor: LandActor = {
  id: randomUUID(),
  role: 'GEOMETRE',
  registeredSurveyor: true,
  accountActive: true,
};

describe('AttestationService (PostGIS)', () => {
  let db: PGlite;
  let runner: SqlRunner;
  let audit: AuditService;
  let parcels: ParcelService;
  let service: AttestationService;
  let parcel: ParcelView;

  async function lastAudit() {
    const { rows } = await db.query<{
      action: string;
      result: string;
      actor_id: string | null;
      details: Record<string, unknown>;
    }>('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    return rows[0];
  }

  const create = (lon: number, fix?: ParcelBoundary['fixQuality'][]) =>
    parcels.create(
      surveyor,
      {
        surveySessionId: randomUUID(),
        commune: 'AGO',
        geometry: square(lon, 6.13),
        boundaries: boundaries(fix),
        locality: 'Agoe, Lome',
      },
      randomUUID(),
    );

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { postgis } = await import('@electric-sql/pglite-postgis');
    db = new PGlite({ extensions: { postgis } });
    runner = { query: (sql, params) => db.query(sql, params) };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new LandParcels1793102500000().up(qr);
    await new LandAttestations1793102600000().up(qr);
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    audit = new AuditService(dataSource);
    const geometry = new ParcelGeometryService();
    parcels = new ParcelService(dataSource, geometry, audit);
    service = new AttestationService(dataSource, geometry, audit);
    parcel = await create(1.21);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('emet le PDF avec numero, mention et donnees du leve (EF-204)', async () => {
    const attestation = await service.issue(surveyor, parcel.id);

    expect(attestation).toMatchObject({
      number: expect.stringMatching(/^AT-\d{4}-000001$/) as unknown,
      parcelId: parcel.id,
      parcelVersion: 1,
      geometryHash: parcel.geometryHash,
      mention: 'Ne vaut pas titre foncier',
    });
    const pdf = await service.getPdf(surveyor, attestation.number);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(createHash('sha256').update(pdf).digest('hex')).toBe(
      attestation.documentHash,
    );
    const text = await pdfText(pdf);
    for (const expected of [
      'ATTESTATION DE LEVE',
      ATTESTATION_MENTION,
      attestation.number,
      `${parcel.id}, version 1`,
      parcel.geometryHash,
      'Agoe, Lome',
      'B1',
      'B4',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toMatch(/titre foncier officiel|QR/i);
    expect(await lastAudit()).toMatchObject({
      action: 'ATTESTATION_ISSUED',
      result: 'SUCCESS',
    });
  });

  it('renvoie la meme attestation pour la meme version', async () => {
    const first = await service.issue(surveyor, parcel.id);
    const again = await service.issue(surveyor, parcel.id);
    expect(again).toEqual(first);
  });

  it('refuse une borne qui n est pas en RTK Fixed et journalise (RG-03)', async () => {
    const floating = await create(1.3, ['FIXED', 'FIXED', 'FLOAT']);
    const error: unknown = await service
      .issue(surveyor, floating.id)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      code: 'ATTESTATION_NOT_ALLOWED',
      message: 'Borne(s) non mesuree(s) en RTK Fixed : B3.',
      details: { reasons: ['POINT_NOT_FIXED'] },
    });
    expect(await lastAudit()).toMatchObject({
      action: 'ATTESTATION_REFUSED',
      result: 'REJECTED',
    });
  });

  it('refuse un geometre non inscrit a l Ordre', async () => {
    const unregistered = { ...surveyor, registeredSurveyor: false };
    const own = await parcels.create(
      unregistered,
      {
        surveySessionId: randomUUID(),
        commune: 'AGO',
        geometry: square(1.4, 6.13),
        boundaries: boundaries(),
      },
      randomUUID(),
    );
    await expect(service.issue(unregistered, own.id)).rejects.toMatchObject({
      response: { details: { reasons: ['SURVEYOR_NOT_REGISTERED'] } },
    });
  });

  it.each(['ADMIN', 'AGENT', 'TOPOGRAPHE', 'CLIENT'])(
    'refuse l emission par le role %s (403)',
    async (role) => {
      await expect(
        service.issue({ id: randomUUID(), role }, parcel.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it("refuse un geometre qui n'est pas l'auteur", async () => {
    await expect(
      service.issue({ ...surveyor, id: randomUUID() }, parcel.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await lastAudit()).toMatchObject({ action: 'ACCESS_DENIED' });
  });

  it('reserve le PDF a ADMIN et a l auteur', async () => {
    const { number } = await service.issue(surveyor, parcel.id);
    await expect(
      service.getPdf({ id: randomUUID(), role: 'ADMIN' }, number),
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      service.getPdf({ id: randomUUID(), role: 'GEOMETRE' }, number),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getPdf({ id: randomUUID(), role: 'CLIENT' }, number),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getPdf(surveyor, 'AT-2026-999999'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('verify (public)', () => {
    it('valide le bon document sans donnee personnelle, et journalise', async () => {
      const attestation = await service.issue(surveyor, parcel.id);
      const result = await service.verify(
        attestation.number,
        attestation.documentHash.toUpperCase(),
      );

      expect(result).toEqual({
        number: attestation.number,
        valid: true,
        authentic: true,
        parcelId: parcel.id,
        parcelVersion: 1,
        issuedAt: attestation.issuedAt,
        superseded: false,
        mention: ATTESTATION_MENTION,
      });
      expect(JSON.stringify(result)).not.toContain(surveyor.id);
      expect(await lastAudit()).toMatchObject({
        action: 'ATTESTATION_VERIFIED',
        actor_id: null,
        details: { valid: true },
      });
    });

    it('refuse un document modifie', async () => {
      const { number } = await service.issue(surveyor, parcel.id);
      const result = await service.verify(number, 'f'.repeat(64));
      expect(result).toMatchObject({ valid: false, authentic: false });
    });

    it("n'est plus valide apres une modification de la parcelle", async () => {
      const attestation = await service.issue(surveyor, parcel.id);
      await parcels.update(surveyor, parcel.id, {
        expectedVersion: 1,
        geometry: square(1.21, 6.13, 0.0012),
        boundaries: boundaries(),
      });
      const result = await service.verify(
        attestation.number,
        attestation.documentHash,
      );
      expect(result).toMatchObject({
        valid: false,
        authentic: true,
        superseded: true,
      });
      const forged = await service.verify(attestation.number, '0'.repeat(64));
      expect(forged).toMatchObject({ authentic: false, superseded: true });

      const renewed = await service.issue(surveyor, parcel.id);
      expect(renewed.parcelVersion).toBe(2);
      expect(renewed.number).not.toBe(attestation.number);
    });

    it.each(['AT-2026-999999', 'mauvais'])('repond 404 pour %p', async (n) => {
      await expect(service.verify(n, 'a'.repeat(64))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('laisse un journal dont la chaine est intacte', async () => {
    await expect(audit.verify(runner)).resolves.toMatchObject({ valid: true });
  });
});
