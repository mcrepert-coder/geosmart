import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Polygon } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import {
  type SqlRunner,
  type TransactionRunner,
  rowsOf,
} from '../audit/sql-runner';
import {
  OverlapConflict,
  ParcelGeometryService,
} from './geometry/parcel-geometry.service';
import { formatParcelId } from './parcel-id';
import type { ParcelBoundary } from './parcel-version.entity';
import type { LegalStatus } from './parcel.entity';

// Utilisateur courant, fourni par le module comptes (Beni) une fois pret.
export interface LandActor {
  id: string;
  role: string;
  // Geometre inscrit a l'Ordre : seul cas ou une parcelle peut etre certifiee.
  registeredSurveyor?: boolean;
}

export interface ParcelCreateInput {
  surveySessionId: string;
  geometry: unknown;
  boundaries: ParcelBoundary[];
  locality?: string;
}

export interface ParcelView {
  id: string;
  version: number;
  geometry: Polygon;
  areaM2: number;
  perimeterM: number;
  locality: string | null;
  legalStatus: LegalStatus;
  certified: boolean;
  geometryHash: string;
  surveyor?: { id: string };
  boundaries: ParcelBoundary[];
  createdAt: string;
  updatedAt: string;
}

interface ParcelRow {
  id: string;
  current_version: number;
  geojson: string;
  area_m2: number | string;
  perimeter_m: number | string;
  locality: string | null;
  legal_status: LegalStatus;
  certified: boolean;
  geometry_hash: string;
  surveyor_id: string;
  boundaries: ParcelBoundary[] | string;
  created_at: Date | string;
  updated_at: Date | string;
}

// Cle du verrou qui serialise les creations : sans lui, deux parcelles qui se
// chevauchent pourraient passer le controle en meme temps.
export const LAND_WRITE_LOCK_KEY = 726381002;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIX_QUALITIES = ['FIXED', 'FLOAT', 'AUTONOME', 'INVALIDE'];

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_ERROR', message });
}

function validateInput(input: ParcelCreateInput, idempotencyKey: string) {
  if (!UUID.test(idempotencyKey ?? '')) {
    throw invalid("L'en-tete Idempotency-Key doit etre un UUID.");
  }
  if (!UUID.test(input?.surveySessionId ?? '')) {
    throw invalid('Le champ surveySessionId doit etre un UUID.');
  }
  if (input.locality !== undefined && typeof input.locality !== 'string') {
    throw invalid('Le champ locality doit etre un texte.');
  }
  if (input.locality && input.locality.length > 120) {
    throw invalid('Le champ locality depasse 120 caracteres.');
  }
  if (!Array.isArray(input.boundaries) || input.boundaries.length < 3) {
    throw invalid('Le champ boundaries doit contenir au moins 3 bornes.');
  }
  input.boundaries.forEach((b, i) => {
    if (
      !Number.isInteger(b?.pointNumber) ||
      typeof b.surveyPointId !== 'string' ||
      !FIX_QUALITIES.includes(b.fixQuality)
    ) {
      throw invalid(
        `La borne ${i + 1} doit avoir pointNumber, surveyPointId et fixQuality.`,
      );
    }
  });
}

export function toParcelView(row: ParcelRow, viewer?: LandActor): ParcelView {
  const canSeeSurveyor =
    viewer && (viewer.role === 'ADMIN' || viewer.id === row.surveyor_id);
  return {
    id: row.id,
    version: row.current_version,
    geometry: JSON.parse(row.geojson) as Polygon,
    areaM2: Number(row.area_m2),
    perimeterM: Number(row.perimeter_m),
    locality: row.locality,
    legalStatus: row.legal_status,
    certified: row.certified,
    geometryHash: row.geometry_hash,
    ...(canSeeSurveyor ? { surveyor: { id: row.surveyor_id } } : {}),
    boundaries:
      typeof row.boundaries === 'string'
        ? (JSON.parse(row.boundaries) as ParcelBoundary[])
        : row.boundaries,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const SELECT_PARCEL = `
  SELECT p.id, p.current_version, ST_AsGeoJSON(p.geom) AS geojson,
         p.area_m2, p.perimeter_m, p.locality, p.legal_status, p.certified,
         p.geometry_hash, p.surveyor_id, v.boundaries, p.created_at, p.updated_at
    FROM parcels p
    JOIN parcel_versions v
      ON v.parcel_id = p.id AND v.version = p.current_version`;

@Injectable()
export class ParcelService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly geometry: ParcelGeometryService,
    private readonly audit: AuditService,
  ) {}

  private get db(): TransactionRunner {
    return this.dataSource;
  }

  // EF-201, EF-202 : tout ou rien. En cas de chevauchement rien n'est
  // enregistre, sauf l'alerte au journal (RG-02, RG-10).
  async create(
    actor: LandActor,
    input: ParcelCreateInput,
    idempotencyKey: string,
  ): Promise<ParcelView> {
    if (actor.role !== 'GEOMETRE') {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'ACCESS_DENIED',
        resourceType: 'parcel',
        result: 'DENIED',
        details: { operation: 'PARCEL_CREATE' },
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Action non autorisee pour votre role.',
      });
    }
    validateInput(input, idempotencyKey);

    const outcome = await this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [LAND_WRITE_LOCK_KEY]);
      const [existing] = rowsOf<ParcelRow>(
        await tx.query(`${SELECT_PARCEL} WHERE p.idempotency_key = $1`, [
          idempotencyKey,
        ]),
      );
      if (existing) {
        if (existing.surveyor_id !== actor.id) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message:
              'Cette cle de requete a deja servi pour une autre demande.',
          });
        }
        return { parcel: toParcelView(existing, actor) };
      }

      const checked = await this.geometry.check(tx, input.geometry);
      const conflicts = await this.geometry.findOverlaps(tx, checked.polygon);
      if (conflicts.length > 0) return { conflicts };

      const id = await this.nextParcelId(tx);
      const certified =
        actor.registeredSurveyor === true &&
        input.boundaries.every((b) => b.fixQuality === 'FIXED');
      await tx.query(
        `INSERT INTO parcels (id, geom, area_m2, perimeter_m, geometry_hash,
           locality, certified, surveyor_id, survey_session_id, idempotency_key)
         VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3, $4, $5,
           $6, $7, $8, $9, $10)`,
        [
          id,
          JSON.stringify(checked.polygon),
          checked.areaM2,
          checked.perimeterM,
          checked.geometryHash,
          input.locality ?? null,
          certified,
          actor.id,
          input.surveySessionId,
          idempotencyKey,
        ],
      );
      await tx.query(
        `INSERT INTO parcel_versions (parcel_id, version, geom, area_m2,
           perimeter_m, geometry_hash, boundaries, author_id)
         VALUES ($1, 1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3, $4, $5,
           $6::jsonb, $7)`,
        [
          id,
          JSON.stringify(checked.polygon),
          checked.areaM2,
          checked.perimeterM,
          checked.geometryHash,
          JSON.stringify(input.boundaries),
          actor.id,
        ],
      );
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'PARCEL_CREATE',
          resourceType: 'parcel',
          resourceId: id,
          result: 'SUCCESS',
          details: {
            version: 1,
            geometryHash: checked.geometryHash,
            areaM2: checked.areaM2,
            certified,
          },
        },
        tx,
      );
      const [row] = rowsOf<ParcelRow>(
        await tx.query(`${SELECT_PARCEL} WHERE p.id = $1`, [id]),
      );
      return { parcel: toParcelView(row, actor) };
    });

    if (outcome.conflicts) {
      throw await this.rejectOverlap(actor, input, outcome.conflicts);
    }
    return outcome.parcel;
  }

  private async rejectOverlap(
    actor: LandActor,
    input: ParcelCreateInput,
    conflicts: OverlapConflict[],
  ): Promise<ConflictException> {
    const entry = await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'PARCEL_OVERLAP_REJECTED',
      resourceType: 'parcel',
      result: 'REJECTED',
      details: { surveySessionId: input.surveySessionId, conflicts },
    });
    return this.geometry.overlapError(conflicts, entry.seq);
  }

  private async nextParcelId(tx: SqlRunner): Promise<string> {
    const [row] = rowsOf<{ n: number | string }>(
      await tx.query("SELECT nextval('parcel_number_seq') AS n"),
    );
    return formatParcelId(new Date().getUTCFullYear(), Number(row.n));
  }
}
