import type { Pool } from 'pg';
import type { Clock } from '../audit/audit.service';
import type { ParcelPolygon } from './parcel-geometry';

// Adaptateur du module comptes : informations courantes, pas le badge historique
// de creation_response. Aucun acces direct aux tables d'un autre proprietaire.
export interface SurveyorCertification {
  registeredAuthors(authorIds: string[]): Promise<ReadonlySet<string>>;
}

export interface ParcelReader { id: string; role: string; active: boolean }

export interface ParcelVersion {
  version: number;
  legalStatus: string;
  geometryHash: string;
  geometry: ParcelPolygon;
  changedBy: string;
  changedAt: string;
  reason?: string;
}

export interface ParcelSummary {
  id: string;
  label?: string;
  legalStatus: string;
  certified: boolean;
  inConflict: boolean;
  areaM2: number;
  geometry: ParcelPolygon;
}

export interface ParcelStatus {
  parcelId: string;
  legalStatus: string;
  certified: boolean;
  hasAttestation: boolean;
  inConflict: boolean;
  version: number;
  areaM2: number;
  perimeterM: number;
  surveyedAt?: string;
  checkedAt: string;
  notice: 'Ne vaut pas titre foncier';
}

export class ParcelQueryError extends Error {
  constructor(readonly code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN_ROLE' | 'NOT_FOUND',
    readonly status: 400 | 401 | 403 | 404, message: string) {
    super(message);
    this.name = 'ParcelQueryError';
  }
}

function invalid(): never {
  throw new ParcelQueryError('VALIDATION_ERROR', 400, 'Filtres de parcelles invalides');
}

function filters(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['legalStatus', 'bbox', 'certified', 'page', 'pageSize'].includes(key))) invalid();
  if (data.legalStatus !== undefined && !['TITRE', 'COUTUMIER_NON_TITRE', 'EN_LITIGE'].includes(data.legalStatus as string)) invalid();
  if (data.certified !== undefined && typeof data.certified !== 'boolean') invalid();
  const page = data.page ?? 1, pageSize = data.pageSize ?? 100;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 ||
      typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500 ||
      !Number.isSafeInteger((page - 1) * pageSize)) invalid();
  let bbox: number[] | null = null;
  if (data.bbox !== undefined) {
    if (typeof data.bbox !== 'string') invalid();
    const parts = data.bbox.split(',');
    if (parts.length !== 4 || parts.some((part) => !part.trim())) invalid();
    bbox = parts.map(Number);
    if (bbox.some((n) => !Number.isFinite(n)) || bbox[0] < -180 || bbox[2] > 180 ||
        bbox[1] < -90 || bbox[3] > 90 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) invalid();
  }
  return { legalStatus: data.legalStatus ?? null, certified: data.certified ?? null,
    bbox, limit: pageSize, offset: (page - 1) * pageSize };
}

const FIXED = `jsonb_array_length(p.vertices) >= 3 AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(p.vertices) v
  WHERE v->'source'->>'fixMode' IS DISTINCT FROM 'RTK_FIXED')`;

export class ParcelQueryService {
  constructor(private readonly db: Pick<Pool, 'query'>,
    private readonly certification: SurveyorCertification,
    private readonly clock: Clock = () => new Date()) {}

  async versions(id: string, reader?: ParcelReader): Promise<ParcelVersion[]> {
    if (!reader) throw new ParcelQueryError('UNAUTHORIZED',401,'Authentification requise');
    if (typeof reader.id !== 'string' || !reader.id.trim() || reader.active !== true ||
        !['geometre','admin'].includes(reader.role)) {
      throw new ParcelQueryError('FORBIDDEN_ROLE',403,'Role insuffisant pour consulter les versions');
    }
    if (typeof id !== 'string' || !id.trim()) invalid();
    const { rows } = await this.db.query<{ versions: ParcelVersion[] }>(
      `SELECT COALESCE(jsonb_agg(jsonb_build_object('version',v.version,
        'legalStatus',v.legal_status,'geometryHash',v.geometry_hash,
        'geometry',ST_AsGeoJSON(v.geometry,17)::jsonb,'changedBy',v.changed_by,'changedAt',v.changed_at)
        || CASE WHEN v.reason IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('reason',v.reason) END
        ORDER BY v.version DESC) FILTER (WHERE v.version IS NOT NULL),'[]'::jsonb) AS versions
        FROM parcels p LEFT JOIN parcel_versions v ON v.parcel_id=p.id WHERE p.id=$1 GROUP BY p.id`, [id]);
    if (!rows.length) throw new ParcelQueryError('NOT_FOUND',404,'Parcelle introuvable');
    return rows[0].versions.map((version) => ({ ...version, changedAt: new Date(version.changedAt).toISOString() }));
  }

  async list(input: unknown = {}, reader?: ParcelReader): Promise<{ items: ParcelSummary[]; total: number }> {
    if (!reader) throw new ParcelQueryError('UNAUTHORIZED', 401, 'Authentification requise');
    if (typeof reader.id !== 'string' || !reader.id.trim() || reader.active !== true ||
        !['admin', 'geometre', 'topographe', 'agent', 'client'].includes(reader.role)) {
      throw new ParcelQueryError('FORBIDDEN_ROLE', 403, 'Compte actif requis');
    }
    const options = filters(input);
    // Les valeurs bbox restent des parametres, sans interpolation SQL.
    const condition = `($1::text IS NULL OR p.legal_status=$1) AND
      ($2::float8[] IS NULL OR ST_Intersects(p.geometry,
        ST_MakeEnvelope(($2::float8[])[1],($2::float8[])[2],($2::float8[])[3],($2::float8[])[4],4326)))`;
    const params = [options.legalStatus, options.bbox];
    const { rows: authors } = await this.db.query<{ author_id: string }>(
      `SELECT DISTINCT p.author_id FROM parcels p WHERE ${condition}`, params);
    const registered = await this.certification.registeredAuthors(authors.map((row) => row.author_id));
    const { rows } = await this.db.query<{ total: string; items: ParcelSummary[] }>(
      `WITH candidates AS (
        SELECT p.*, (p.author_id=ANY($3::text[]) AND ${FIXED}) AS certified
        FROM parcels p WHERE ${condition}
      ), eligible AS (SELECT * FROM candidates WHERE $4::boolean IS NULL OR certified=$4),
      page AS (SELECT * FROM eligible ORDER BY id COLLATE "C" LIMIT $5 OFFSET $6)
      SELECT (SELECT count(*) FROM eligible) AS total,
        COALESCE((SELECT jsonb_agg(
          jsonb_build_object('id',id,'legalStatus',legal_status,'certified',certified,
            'inConflict',in_conflict OR legal_status='EN_LITIGE','areaM2',area_m2,
            'geometry',ST_AsGeoJSON(geometry,17)::jsonb)
          || CASE WHEN label IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('label',label) END
          ORDER BY id COLLATE "C") FROM page),'[]'::jsonb) AS items`,
      [...params, [...registered], options.certified, options.limit, options.offset]);
    return { total: Number(rows[0].total), items: rows[0].items };
  }

  // Reponse en liste blanche pour la future verification publique. Aucune route
  // publique n'est activee ici : son exposition reste a faire valider par LGR.
  async status(id: string): Promise<ParcelStatus> {
    if (typeof id !== 'string' || !id.trim()) invalid();
    const { rows } = await this.db.query<{
      id: string; author_id: string; legal_status: string; version: number;
      in_conflict: boolean; area_m2: number; perimeter_m: number; fixed: boolean;
      has_attestation: boolean; surveyed_at: Date | null;
    }>(`SELECT p.id,p.author_id,p.legal_status,p.version,p.in_conflict,p.area_m2,p.perimeter_m,
      (${FIXED}) AS fixed,
      EXISTS(SELECT 1 FROM attestations a WHERE a.parcel_id=p.id) AS has_attestation,
      (SELECT max((v->'source'->>'measuredAt')::timestamptz)
        FROM jsonb_array_elements(p.vertices) v) AS surveyed_at
      FROM parcels p WHERE p.id=$1`, [id]);
    const row = rows[0];
    if (!row) throw new ParcelQueryError('NOT_FOUND', 404, 'Parcelle introuvable');
    const registered = await this.certification.registeredAuthors([row.author_id]);
    return { parcelId: row.id, legalStatus: row.legal_status,
      certified: registered.has(row.author_id) && row.fixed,
      hasAttestation: row.has_attestation, inConflict: row.in_conflict || row.legal_status === 'EN_LITIGE',
      version: row.version, areaM2: row.area_m2, perimeterM: row.perimeter_m,
      ...(row.surveyed_at ? { surveyedAt: row.surveyed_at.toISOString() } : {}),
      checkedAt: this.clock().toISOString(), notice: 'Ne vaut pas titre foncier' };
  }
}
