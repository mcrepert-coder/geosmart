import type { Pool } from 'pg';
import { AuditService, Clock } from '../audit/audit.service';
import { canonicalize } from '../audit/canonical-json';
import { PgAuditStore } from '../audit/pg-audit.store';
import type { CreatedParcel, ParcelCreator } from './parcel-creation.service';
import { prepareParcelGeometry, PreparedParcelGeometry } from './parcel-geometry';
import { withParcelOverlapCheck } from './parcel-overlap';

export class ParcelUpdateError extends Error {
  constructor(readonly code: 'FORBIDDEN_ROLE' | 'NOT_AUTHOR' | 'NOT_FOUND' |
    'VALIDATION_ERROR' | 'NO_CHANGE' | 'VERSION_CONFLICT',
    readonly status: 400 | 403 | 404 | 409, message: string,
    readonly details: Record<string, unknown> = {}) {
    super(message); this.name = 'ParcelUpdateError';
  }
}

interface CurrentRow {
  author_id: string; project_id: string | null; label: string | null;
  legal_status: CreatedParcel['legalStatus']; version: number; vertices: unknown;
  in_conflict: boolean; created_at: Date;
}

function invalid(): never {
  throw new ParcelUpdateError('VALIDATION_ERROR', 400, 'Modification invalide');
}

function payload(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['expectedVersion','reason','vertices','label','legalStatus'].includes(key))) invalid();
  if (typeof data.expectedVersion !== 'number' || !Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 1) invalid();
  if (typeof data.reason !== 'string' || [...data.reason].length < 3) invalid();
  if (!['vertices','label','legalStatus'].some((key) => key in data)) invalid();
  if ('label' in data && (typeof data.label !== 'string' || [...data.label].length > 120)) invalid();
  if ('legalStatus' in data && !['TITRE','COUTUMIER_NON_TITRE','EN_LITIGE'].includes(data.legalStatus as string)) invalid();
  try { return JSON.parse(canonicalize(data)) as Record<string, unknown> & { expectedVersion: number; reason: string }; }
  catch { invalid(); }
}

export class ParcelUpdateService {
  constructor(private readonly pool: Pool, private readonly clock: Clock = () => new Date()) {}

  async update(id: string, input: unknown, creator: ParcelCreator): Promise<CreatedParcel> {
    if (!creator || typeof creator.id !== 'string' || !creator.id.trim() || creator.role !== 'geometre' ||
        creator.active !== true || typeof creator.surveyorRegistered !== 'boolean') {
      throw new ParcelUpdateError('FORBIDDEN_ROLE', 403, 'Geometre actif requis');
    }
    if (typeof id !== 'string' || !id.trim()) invalid();
    const actor = { ...creator }, data = payload(input);
    const client = await this.pool.connect();
    let released = false;
    const release = () => { if (!released) { released = true; client.release(); } };
    const db = { query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      (await client.query(sql, params)).rows as T[] };
    let current!: CurrentRow;
    let prepared!: PreparedParcelGeometry;
    let legalStatus!: CreatedParcel['legalStatus'];
    let label: string | null;
    const autonomousAudit = new AuditService(new PgAuditStore(this.pool), this.clock);
    try {
      return await withParcelOverlapCheck<CreatedParcel>(db,
        { id, excludeParcelId: id, geometry: () => prepared.geometry }, actor.id,
        { log: async (action, actorId, details, target) => {
          release(); return autonomousAudit.log(action, actorId, details, target);
        } },
        async () => {
          const [measure] = await db.query<{ area: number; perimeter: number }>(
            `WITH metric AS (SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),32631) AS geom)
             SELECT ST_Area(geom) AS area, ST_Perimeter(geom) AS perimeter FROM metric`,
            [JSON.stringify(prepared.geometry)]);
          const at = this.clock().toISOString();
          const parcel: CreatedParcel = { id, legalStatus, version: current.version + 1,
            authorId: current.author_id, certified: actor.surveyorRegistered,
            inConflict: current.in_conflict || legalStatus === 'EN_LITIGE',
            vertices: prepared.vertices, geometry: prepared.geometry, geometryHash: prepared.geometryHash,
            areaM2: Number(measure.area), perimeterM: Number(measure.perimeter),
            createdAt: current.created_at.toISOString(), updatedAt: at,
            ...(label !== null ? { label } : {}),
            ...(current.project_id !== null ? { projectId: current.project_id } : {}) };
          await client.query(`UPDATE parcels SET label=$2,legal_status=$3,version=$4,
            geometry=ST_SetSRID(ST_GeomFromGeoJSON($5),4326),geometry_hash=$6,vertices=$7::jsonb,
            area_m2=$8,perimeter_m=$9,in_conflict=$10,updated_at=$11 WHERE id=$1`,
            [id,label,legalStatus,parcel.version,JSON.stringify(prepared.geometry),prepared.geometryHash,
              JSON.stringify(prepared.vertices),parcel.areaM2,parcel.perimeterM,parcel.inConflict,at]);
          await client.query(`INSERT INTO parcel_versions(parcel_id,version,project_id,label,legal_status,
            geometry,geometry_hash,vertices,area_m2,perimeter_m,in_conflict,changed_by,changed_at,reason)
            SELECT id,version,project_id,label,legal_status,geometry,geometry_hash,vertices,
              area_m2,perimeter_m,in_conflict,$2,updated_at,$3 FROM parcels WHERE id=$1`, [id,actor.id,data.reason]);
          const audit = new AuditService(PgAuditStore.inTransaction(client), this.clock);
          await audit.log('PARCEL_UPDATED', actor.id, { version: parcel.version,
            previousVersion: current.version, reason: data.reason, geometryHash: prepared.geometryHash },
          { type: 'parcel', id });
          return parcel;
        },
        async () => {
          const rows = await db.query<CurrentRow>(`SELECT author_id,project_id,label,legal_status,
            version,vertices,in_conflict,created_at FROM parcels WHERE id=$1`, [id]);
          current = rows[0];
          if (!current) throw new ParcelUpdateError('NOT_FOUND',404,'Parcelle introuvable');
          if (current.author_id !== actor.id) throw new ParcelUpdateError('NOT_AUTHOR',403,'Geometre auteur requis');
          if (current.version !== data.expectedVersion) {
            throw new ParcelUpdateError('VERSION_CONFLICT',409,'La parcelle a ete modifiee entre-temps',
              { currentVersion: current.version });
          }
          prepared = prepareParcelGeometry('vertices' in data ? data.vertices : current.vertices);
          legalStatus = 'legalStatus' in data ? data.legalStatus as CreatedParcel['legalStatus'] : current.legal_status;
          label = 'label' in data ? data.label as string : current.label;
          if (legalStatus === current.legal_status && label === current.label &&
              canonicalize(prepared.vertices) === canonicalize(current.vertices)) {
            throw new ParcelUpdateError('NO_CHANGE',400,'Aucun changement effectif');
          }
          return { handled: false };
        });
    } finally { release(); }
  }
}
