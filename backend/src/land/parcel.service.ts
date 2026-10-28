import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
import { formatParcelId, isParcelId } from './parcel-id';
import type { ParcelBoundary } from './parcel-version.entity';
import type { LegalStatus } from './parcel.entity';

// Utilisateur courant, fourni par le module comptes (Beni) une fois pret.
export interface LandActor {
  id: string;
  role: string;
  // Geometre inscrit a l'Ordre : seul cas ou une parcelle peut etre certifiee.
  registeredSurveyor?: boolean;
  // Compte valide et actif (EF-301) : requis pour un agent.
  accountActive?: boolean;
}

export interface ParcelCreateInput {
  surveySessionId: string;
  geometry: unknown;
  boundaries: ParcelBoundary[];
  locality?: string;
  bornage?: BornageInput;
}

export interface ParcelUpdateInput {
  expectedVersion: number;
  geometry: unknown;
  boundaries: ParcelBoundary[];
  reason?: string;
  bornage?: BornageInput;
}

// EF-208, bornage contradictoire : voisins presents et date. Les photos
// attendent la decision de LGR sur leur stockage.
export interface BornageInput {
  neighboursPresent: string[];
  heldAt: string;
}

export interface BornageRecord {
  neighboursPresent: string[];
  heldAt: string;
}

export interface ParcelVersionView {
  version: number;
  geometry: Polygon;
  geometryHash: string;
  areaM2: number;
  reason: string | null;
  authorId: string;
  createdAt: string;
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
  // Noms des voisins : visibles seulement par ADMIN et l'auteur.
  bornage?: BornageRecord | null;
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
  bornage: BornageRecord | string | null;
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
  validateBoundaries(input.boundaries);
}

export function normalizeBornage(
  bornage: BornageInput | undefined,
): BornageRecord | null {
  if (bornage === undefined || bornage === null) return null;
  const names = Array.isArray(bornage.neighboursPresent)
    ? bornage.neighboursPresent.map((n) =>
        typeof n === 'string' ? n.trim() : '',
      )
    : null;
  if (
    !names ||
    names.length > 20 ||
    names.some((n) => n.length === 0 || n.length > 120)
  ) {
    throw invalid(
      'Le champ bornage.neighboursPresent doit lister 20 noms au plus (120 caracteres chacun).',
    );
  }
  const heldAt = Date.parse(bornage.heldAt);
  if (typeof bornage.heldAt !== 'string' || Number.isNaN(heldAt)) {
    throw invalid('Le champ bornage.heldAt doit etre une date ISO 8601.');
  }
  // Petite marge pour l'horloge du telephone.
  if (heldAt > Date.now() + 5 * 60 * 1000) {
    throw invalid('Le bornage ne peut pas etre date dans le futur.');
  }
  return {
    neighboursPresent: names,
    heldAt: new Date(heldAt).toISOString(),
  };
}

function validateUpdate(input: ParcelUpdateInput) {
  if (!Number.isInteger(input?.expectedVersion) || input.expectedVersion < 1) {
    throw invalid('Le champ expectedVersion doit etre un entier positif.');
  }
  if (
    input.reason !== undefined &&
    (typeof input.reason !== 'string' || input.reason.length > 500)
  ) {
    throw invalid(
      'Le champ reason doit etre un texte de 500 caracteres au plus.',
    );
  }
  validateBoundaries(input.boundaries);
}

function validateBoundaries(boundaries: ParcelBoundary[]) {
  if (!Array.isArray(boundaries) || boundaries.length < 3) {
    throw invalid('Le champ boundaries doit contenir au moins 3 bornes.');
  }
  boundaries.forEach((b, i) => {
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

const LEGAL_STATUSES: LegalStatus[] = [
  'TITRE',
  'COUTUMIER_NON_TITRE',
  'EN_LITIGE',
  'INCONNU',
];

export interface ParcelFeatureCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    id: string;
    geometry: Polygon;
    properties: {
      legalStatus: LegalStatus;
      certified: boolean;
      areaM2: number;
    };
  }[];
}

// bbox = minLon,minLat,maxLon,maxLat en WGS84, limitee a 1 degre de cote
// pour ne pas renvoyer tout le pays d'un coup.
function parseBbox(bbox: string): [number, number, number, number] {
  const parts = (bbox ?? '').split(',').map((p) => Number(p.trim()));
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (
    parts.length !== 4 ||
    !parts.every(Number.isFinite) ||
    minLon < -180 ||
    maxLon > 180 ||
    minLat < -90 ||
    maxLat > 90 ||
    minLon >= maxLon ||
    minLat >= maxLat
  ) {
    throw invalid('Le parametre bbox doit valoir minLon,minLat,maxLon,maxLat.');
  }
  if (maxLon - minLon > 1 || maxLat - minLat > 1) {
    throw invalid('La zone demandee ne doit pas depasser 1 degre de cote.');
  }
  return [minLon, minLat, maxLon, maxLat];
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
    ...(canSeeSurveyor
      ? {
          surveyor: { id: row.surveyor_id },
          bornage:
            typeof row.bornage === 'string'
              ? (JSON.parse(row.bornage) as BornageRecord)
              : row.bornage,
        }
      : {}),
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
         p.geometry_hash, p.surveyor_id, v.boundaries, v.bornage,
         p.created_at, p.updated_at
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
      throw await this.deny(actor, 'PARCEL_CREATE');
    }
    validateInput(input, idempotencyKey);
    const bornage = normalizeBornage(input.bornage);

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
           perimeter_m, geometry_hash, boundaries, author_id, bornage)
         VALUES ($1, 1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3, $4, $5,
           $6::jsonb, $7, $8::jsonb)`,
        [
          id,
          JSON.stringify(checked.polygon),
          checked.areaM2,
          checked.perimeterM,
          checked.geometryHash,
          JSON.stringify(input.boundaries),
          actor.id,
          bornage ? JSON.stringify(bornage) : null,
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
      throw await this.rejectOverlap(actor, outcome.conflicts, {
        surveySessionId: input.surveySessionId,
      });
    }
    return outcome.parcel;
  }

  // EF-205, CA-4 : seul le geometre auteur modifie la limite. Chaque
  // modification ajoute une version ; les anciennes restent consultables.
  async update(
    actor: LandActor,
    parcelId: string,
    input: ParcelUpdateInput,
  ): Promise<ParcelView> {
    if (actor.role !== 'GEOMETRE') {
      throw await this.deny(actor, 'PARCEL_UPDATE', parcelId);
    }
    validateUpdate(input);
    const bornage = normalizeBornage(input.bornage);

    const outcome = await this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [LAND_WRITE_LOCK_KEY]);
      const [current] = rowsOf<ParcelRow>(
        await tx.query(`${SELECT_PARCEL} WHERE p.id = $1 FOR UPDATE OF p`, [
          parcelId,
        ]),
      );
      if (!current) throw this.notFound();
      if (current.surveyor_id !== actor.id) return { denied: true };
      if (current.current_version !== input.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: `La parcelle a ete modifiee depuis la version ${input.expectedVersion}.`,
          details: { currentVersion: current.current_version },
        });
      }

      const checked = await this.geometry.check(tx, input.geometry);
      const conflicts = await this.geometry.findOverlaps(
        tx,
        checked.polygon,
        parcelId,
      );
      if (conflicts.length > 0) return { conflicts };

      const version = current.current_version + 1;
      const certified =
        actor.registeredSurveyor === true &&
        input.boundaries.every((b) => b.fixQuality === 'FIXED');
      await tx.query(
        `UPDATE parcels
            SET geom = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
                area_m2 = $3, perimeter_m = $4, geometry_hash = $5,
                current_version = $6, certified = $7, updated_at = now()
          WHERE id = $1`,
        [
          parcelId,
          JSON.stringify(checked.polygon),
          checked.areaM2,
          checked.perimeterM,
          checked.geometryHash,
          version,
          certified,
        ],
      );
      await tx.query(
        `INSERT INTO parcel_versions (parcel_id, version, geom, area_m2,
           perimeter_m, geometry_hash, boundaries, reason, author_id, bornage)
         VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5, $6,
           $7::jsonb, $8, $9, $10::jsonb)`,
        [
          parcelId,
          version,
          JSON.stringify(checked.polygon),
          checked.areaM2,
          checked.perimeterM,
          checked.geometryHash,
          JSON.stringify(input.boundaries),
          input.reason ?? null,
          actor.id,
          bornage ? JSON.stringify(bornage) : null,
        ],
      );
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'PARCEL_UPDATE',
          resourceType: 'parcel',
          resourceId: parcelId,
          result: 'SUCCESS',
          details: {
            version,
            previousGeometryHash: current.geometry_hash,
            geometryHash: checked.geometryHash,
            areaM2: checked.areaM2,
            certified,
            reason: input.reason ?? null,
          },
        },
        tx,
      );
      const [row] = rowsOf<ParcelRow>(
        await tx.query(`${SELECT_PARCEL} WHERE p.id = $1`, [parcelId]),
      );
      return { parcel: toParcelView(row, actor) };
    });

    if (outcome.denied) {
      throw await this.deny(actor, 'PARCEL_UPDATE', parcelId);
    }
    if (outcome.conflicts) {
      throw await this.rejectOverlap(actor, outcome.conflicts, {
        parcelId,
        expectedVersion: input.expectedVersion,
      });
    }
    return outcome.parcel as ParcelView;
  }

  // Detail de la version courante. Le geometre n'est visible que par
  // ADMIN et l'auteur (toParcelView).
  async findOne(actor: LandActor, parcelId: string): Promise<ParcelView> {
    if (!isParcelId(parcelId ?? '')) throw this.notFound();
    const [row] = rowsOf<ParcelRow>(
      await this.dataSource.query(`${SELECT_PARCEL} WHERE p.id = $1`, [
        parcelId,
      ]),
    );
    if (!row) throw this.notFound();
    return toParcelView(row, actor);
  }

  // Carte (EF-406) : parcelles d'une zone, sans aucune donnee personnelle.
  async findInBbox(
    bbox: string,
    status?: string,
    limit?: string | number,
  ): Promise<ParcelFeatureCollection> {
    const box = parseBbox(bbox);
    if (
      status !== undefined &&
      !LEGAL_STATUSES.includes(status as LegalStatus)
    ) {
      throw invalid(
        `Le filtre status doit etre l'un de : ${LEGAL_STATUSES.join(', ')}.`,
      );
    }
    const max = limit === undefined || limit === '' ? 200 : Number(limit);
    if (!Number.isInteger(max) || max < 1 || max > 500) {
      throw invalid('Le parametre limit doit etre un entier entre 1 et 500.');
    }
    const rows = rowsOf<{
      id: string;
      geojson: string;
      legal_status: LegalStatus;
      certified: boolean;
      area_m2: number | string;
    }>(
      await this.dataSource.query(
        `SELECT id, ST_AsGeoJSON(geom) AS geojson, legal_status, certified, area_m2
           FROM parcels
          WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            AND ($5::text IS NULL OR legal_status = $5)
          ORDER BY id
          LIMIT $6`,
        [...box, status ?? null, max],
      ),
    );
    return {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        id: r.id,
        geometry: JSON.parse(r.geojson) as Polygon,
        properties: {
          legalStatus: r.legal_status,
          certified: r.certified,
          areaM2: Number(r.area_m2),
        },
      })),
    };
  }

  // Historique, de la plus recente a la plus ancienne (ADMIN, GEOMETRE).
  async listVersions(
    actor: LandActor,
    parcelId: string,
  ): Promise<ParcelVersionView[]> {
    if (actor.role !== 'ADMIN' && actor.role !== 'GEOMETRE') {
      throw await this.deny(actor, 'PARCEL_VERSIONS', parcelId);
    }
    const rows = rowsOf<{
      version: number;
      geojson: string;
      geometry_hash: string;
      area_m2: number | string;
      reason: string | null;
      author_id: string;
      created_at: Date | string;
    }>(
      await this.dataSource.query(
        `SELECT version, ST_AsGeoJSON(geom) AS geojson, geometry_hash, area_m2,
                reason, author_id, created_at
           FROM parcel_versions
          WHERE parcel_id = $1
          ORDER BY version DESC`,
        [parcelId],
      ),
    );
    if (rows.length === 0) throw this.notFound();
    return rows.map((r) => ({
      version: r.version,
      geometry: JSON.parse(r.geojson) as Polygon,
      geometryHash: r.geometry_hash,
      areaM2: Number(r.area_m2),
      reason: r.reason,
      authorId: r.author_id,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  // Refus journalise hors de toute transaction metier, pour qu'il reste.
  private async deny(
    actor: LandActor,
    operation: string,
    resourceId?: string,
  ): Promise<ForbiddenException> {
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ACCESS_DENIED',
      resourceType: 'parcel',
      resourceId: resourceId ?? null,
      result: 'DENIED',
      details: { operation },
    });
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Action non autorisee pour votre role.',
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'NOT_FOUND',
      message: 'Parcelle introuvable.',
    });
  }

  private async rejectOverlap(
    actor: LandActor,
    conflicts: OverlapConflict[],
    context: Record<string, unknown>,
  ): Promise<ConflictException> {
    const entry = await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'PARCEL_OVERLAP_REJECTED',
      resourceType: 'parcel',
      resourceId:
        typeof context.parcelId === 'string' ? context.parcelId : null,
      result: 'REJECTED',
      details: { ...context, conflicts },
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
