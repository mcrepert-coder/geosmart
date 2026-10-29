import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Polygon } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import {
  type SqlRunner,
  type TransactionRunner,
  rowsOf,
} from '../../audit/sql-runner';
import { ParcelGeometryService } from '../geometry/parcel-geometry.service';
import type { ParcelBoundary } from '../parcel-version.entity';
import { LAND_WRITE_LOCK_KEY, type LandActor } from '../parcel.service';
import {
  ATTESTATION_MENTION,
  buildAttestationPdf,
  surveyorLabel,
} from './attestation-pdf';

export type AttestationRefusal =
  'SURVEYOR_NOT_REGISTERED' | 'POINT_NOT_FIXED' | 'PARCEL_IN_CONFLICT';

export interface AttestationView {
  number: string;
  parcelId: string;
  parcelVersion: number;
  geometryHash: string;
  documentHash: string;
  issuedAt: string;
  mention: typeof ATTESTATION_MENTION;
  pdfUrl: string;
}

export interface AttestationVerification {
  number: string;
  valid: boolean;
  // Le fichier est bien celui emis, meme si la parcelle a change depuis.
  authentic: boolean;
  parcelId: string;
  parcelVersion: number;
  issuedAt: string;
  superseded: boolean;
  mention: typeof ATTESTATION_MENTION;
}

interface AttestationRow {
  number: string;
  parcel_id: string;
  parcel_version: number;
  geometry_hash: string;
  document_hash: string;
  surveyor_id: string;
  issued_at: Date | string;
}

interface ParcelForAttestation {
  id: string;
  current_version: number;
  geojson: string;
  area_m2: number | string;
  perimeter_m: number | string;
  locality: string | null;
  geometry_hash: string;
  surveyor_id: string;
  boundaries: ParcelBoundary[] | string;
}

type IssueOutcome =
  | { denied: true }
  | { attestation: AttestationView }
  | { reasons: AttestationRefusal[]; notFixed: string[]; version: number };

const ATTESTATION_NUMBER = /^AT-\d{4}-\d{6}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ATTESTATION_COLUMNS = `number, parcel_id, parcel_version, geometry_hash,
  document_hash, surveyor_id, issued_at`;

function toView(row: AttestationRow): AttestationView {
  return {
    number: row.number,
    parcelId: row.parcel_id,
    parcelVersion: row.parcel_version,
    geometryHash: row.geometry_hash,
    documentHash: row.document_hash,
    issuedAt: new Date(row.issued_at).toISOString(),
    mention: ATTESTATION_MENTION,
    pdfUrl: `/attestations/${row.number}/pdf`,
  };
}

function refusalMessage(reasons: AttestationRefusal[], fixMissing: string[]) {
  if (reasons.includes('SURVEYOR_NOT_REGISTERED')) {
    return "Seul un geometre inscrit a l'Ordre peut emettre une attestation.";
  }
  if (reasons.includes('POINT_NOT_FIXED')) {
    return `Borne(s) non mesuree(s) en RTK Fixed : ${fixMissing.join(', ')}.`;
  }
  return 'La parcelle recouvre une parcelle deja enregistree.';
}

@Injectable()
export class AttestationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly geometry: ParcelGeometryService,
    private readonly audit: AuditService,
  ) {}

  private get db(): TransactionRunner {
    return this.dataSource;
  }

  // EF-204, RG-03 : geometre inscrit, auteur, toutes bornes en RTK Fixed,
  // parcelle sans conflit. Une seule attestation par version de parcelle.
  async issue(actor: LandActor, parcelId: string): Promise<AttestationView> {
    if (actor.role !== 'GEOMETRE' || actor.accountActive !== true) {
      throw await this.deny(actor, 'ATTESTATION_ISSUE', parcelId);
    }

    const outcome = await this.db.transaction<IssueOutcome>(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [LAND_WRITE_LOCK_KEY]);
      const [parcel] = rowsOf<ParcelForAttestation>(
        await tx.query(
          `SELECT p.id, p.current_version, ST_AsGeoJSON(p.geom) AS geojson,
                  p.area_m2, p.perimeter_m, p.locality, p.geometry_hash,
                  p.surveyor_id, v.boundaries
             FROM parcels p
             JOIN parcel_versions v
               ON v.parcel_id = p.id AND v.version = p.current_version
            WHERE p.id = $1
              FOR UPDATE OF p`,
          [parcelId],
        ),
      );
      if (!parcel) throw this.notFound('Parcelle introuvable.');
      if (parcel.surveyor_id !== actor.id) return { denied: true as const };

      const [existing] = rowsOf<AttestationRow>(
        await tx.query(
          `SELECT ${ATTESTATION_COLUMNS} FROM attestations
            WHERE parcel_id = $1 AND parcel_version = $2`,
          [parcelId, parcel.current_version],
        ),
      );
      if (existing) return { attestation: toView(existing) };

      const boundaries =
        typeof parcel.boundaries === 'string'
          ? (JSON.parse(parcel.boundaries) as ParcelBoundary[])
          : parcel.boundaries;
      const polygon = JSON.parse(parcel.geojson) as Polygon;
      const notFixed = boundaries
        .filter((b) => b.fixQuality !== 'FIXED')
        .map((b) => b.name ?? `B${b.pointNumber}`);
      const conflicts = await this.geometry.findOverlaps(tx, polygon, parcelId);
      const reasons: AttestationRefusal[] = [];
      if (actor.registeredSurveyor !== true) {
        reasons.push('SURVEYOR_NOT_REGISTERED');
      }
      if (notFixed.length > 0) reasons.push('POINT_NOT_FIXED');
      if (conflicts.length > 0) reasons.push('PARCEL_IN_CONFLICT');
      if (reasons.length > 0) {
        return { reasons, notFixed, version: parcel.current_version };
      }

      const issuedAt = new Date();
      const number = await this.nextNumber(tx, issuedAt);
      const pdf = await buildAttestationPdf({
        number,
        parcelId,
        parcelVersion: parcel.current_version,
        issuedAt,
        areaM2: Number(parcel.area_m2),
        perimeterM: Number(parcel.perimeter_m),
        locality: parcel.locality,
        surveyorLabel: surveyorLabel(actor),
        geometryHash: parcel.geometry_hash,
        boundaries,
        vertices: polygon.coordinates[0].slice(0, -1) as [number, number][],
      });
      const documentHash = createHash('sha256').update(pdf).digest('hex');
      await tx.query(
        `INSERT INTO attestations (number, parcel_id, parcel_version,
           geometry_hash, document_hash, pdf, surveyor_id, issued_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          number,
          parcelId,
          parcel.current_version,
          parcel.geometry_hash,
          documentHash,
          pdf,
          actor.id,
          issuedAt.toISOString(),
        ],
      );
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ATTESTATION_ISSUED',
          resourceType: 'attestation',
          resourceId: number,
          result: 'SUCCESS',
          details: {
            parcelId,
            parcelVersion: parcel.current_version,
            documentHash,
          },
        },
        tx,
      );
      const [row] = rowsOf<AttestationRow>(
        await tx.query(
          `SELECT ${ATTESTATION_COLUMNS} FROM attestations WHERE number = $1`,
          [number],
        ),
      );
      return { attestation: toView(row) };
    });

    if ('denied' in outcome) {
      throw await this.deny(actor, 'ATTESTATION_ISSUE', parcelId);
    }
    if ('reasons' in outcome) {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'ATTESTATION_REFUSED',
        resourceType: 'parcel',
        resourceId: parcelId,
        result: 'REJECTED',
        details: {
          parcelVersion: outcome.version,
          reasons: outcome.reasons,
          pointsNotFixed: outcome.notFixed,
        },
      });
      throw new UnprocessableEntityException({
        code: 'ATTESTATION_NOT_ALLOWED',
        message: refusalMessage(outcome.reasons, outcome.notFixed),
        details: { reasons: outcome.reasons },
      });
    }
    return outcome.attestation;
  }

  // Le PDF tel qu'emis, pour ADMIN et le geometre auteur.
  async getPdf(actor: LandActor, number: string): Promise<Buffer> {
    if (actor.role !== 'ADMIN' && actor.role !== 'GEOMETRE') {
      throw await this.deny(actor, 'ATTESTATION_PDF', number);
    }
    if (!ATTESTATION_NUMBER.test(number ?? '')) {
      throw this.notFound('Attestation introuvable.');
    }
    const [row] = rowsOf<{ pdf: Buffer | Uint8Array; surveyor_id: string }>(
      await this.dataSource.query(
        'SELECT pdf, surveyor_id FROM attestations WHERE number = $1',
        [number],
      ),
    );
    if (!row) throw this.notFound('Attestation introuvable.');
    if (actor.role !== 'ADMIN' && row.surveyor_id !== actor.id) {
      throw await this.deny(actor, 'ATTESTATION_PDF', number);
    }
    return Buffer.from(row.pdf);
  }

  // Verification publique : ne renvoie aucune donnee personnelle. Une
  // attestation d'une version depassee reste authentique mais n'est plus valide.
  async verify(
    number: string,
    documentHash: string,
  ): Promise<AttestationVerification> {
    if (!ATTESTATION_NUMBER.test(number ?? '')) {
      throw this.notFound('Attestation introuvable.');
    }
    const hash = (documentHash ?? '').toLowerCase();
    const [row] = rowsOf<AttestationRow & { current_version: number }>(
      await this.dataSource.query(
        `SELECT a.number, a.parcel_id, a.parcel_version, a.geometry_hash,
                a.document_hash, a.surveyor_id, a.issued_at, p.current_version
           FROM attestations a
           JOIN parcels p ON p.id = a.parcel_id
          WHERE a.number = $1`,
        [number],
      ),
    );
    if (!row) throw this.notFound('Attestation introuvable.');
    const authentic = SHA256_HEX.test(hash) && hash === row.document_hash;
    const superseded = row.parcel_version !== row.current_version;
    const valid = authentic && !superseded;
    await this.audit.log({
      action: 'ATTESTATION_VERIFIED',
      resourceType: 'attestation',
      resourceId: number,
      result: 'SUCCESS',
      details: { valid, authentic, superseded },
    });
    return {
      number: row.number,
      valid,
      authentic,
      parcelId: row.parcel_id,
      parcelVersion: row.parcel_version,
      issuedAt: new Date(row.issued_at).toISOString(),
      superseded,
      mention: ATTESTATION_MENTION,
    };
  }

  private async nextNumber(tx: SqlRunner, issuedAt: Date): Promise<string> {
    const [row] = rowsOf<{ n: number | string }>(
      await tx.query("SELECT nextval('attestation_number_seq') AS n"),
    );
    const n = Number(row.n);
    if (n > 999999) throw new Error('Numerotation des attestations epuisee.');
    return `AT-${issuedAt.getUTCFullYear()}-${String(n).padStart(6, '0')}`;
  }

  private async deny(
    actor: LandActor,
    operation: string,
    resourceId: string,
  ): Promise<ForbiddenException> {
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ACCESS_DENIED',
      resourceType: 'attestation',
      resourceId,
      result: 'DENIED',
      details: { operation },
    });
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Action non autorisee pour votre role.',
    });
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message });
  }
}
