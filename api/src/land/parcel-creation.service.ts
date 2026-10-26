import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { AuditService, Clock } from '../audit/audit.service';
import { canonicalize } from '../audit/canonical-json';
import { PgAuditStore } from '../audit/pg-audit.store';
import { ParcelPolygon, prepareParcelGeometry } from './parcel-geometry';
import { withParcelOverlapCheck } from './parcel-overlap';
import { LandValidationError, Vertex } from './validate-vertices';

type LegalStatus = 'TITRE' | 'COUTUMIER_NON_TITRE' | 'EN_LITIGE';

// Contexte fiable fourni par auth, jamais issu du corps HTTP ou de X-Dev-* en production.
export interface ParcelCreator {
  id: string;
  role: string;
  active: boolean;
  surveyorRegistered: boolean;
}

export interface CreatedParcel {
  id: string;
  legalStatus: LegalStatus;
  certified: boolean;
  inConflict: boolean;
  version: number;
  areaM2: number;
  perimeterM: number;
  geometry: ParcelPolygon;
  geometryHash: string;
  authorId: string;
  vertices: Vertex[];
  createdAt: string;
  updatedAt: string;
  label?: string;
  projectId?: string;
}

export class ParcelCreationError extends Error {
  constructor(readonly code: 'FORBIDDEN_ROLE' | 'IDEMPOTENCY_CONFLICT',
    readonly status: 403 | 409, message: string) {
    super(message);
    this.name = 'ParcelCreationError';
  }
}

function invalid(path: string): never {
  throw new LandValidationError('VALIDATION_ERROR', 400, `Champ invalide : ${path}`, { path });
}

function payload(input: unknown): Record<string, unknown> & { clientId: string; legalStatus: LegalStatus } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('body');
  const data = input as Record<string, unknown>;
  const allowed = ['clientId', 'legalStatus', 'vertices', 'label', 'projectId'];
  if (Object.keys(data).some((key) => !allowed.includes(key))) invalid('body');
  if (typeof data.clientId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.clientId)) invalid('clientId');
  if (!['TITRE', 'COUTUMIER_NON_TITRE', 'EN_LITIGE'].includes(data.legalStatus as string)) invalid('legalStatus');
  if ('label' in data && (typeof data.label !== 'string' || [...data.label].length > 120)) invalid('label');
  if ('projectId' in data && typeof data.projectId !== 'string') invalid('projectId');
  try {
    // Copie stable avant tout await, aussi utilisee pour comparer le rejeu complet.
    return JSON.parse(canonicalize(data));
  } catch {
    invalid('body');
  }
}

export class ParcelCreationService {
  constructor(private readonly pool: Pool,
    private readonly clock: Clock = () => new Date(),
    private readonly nextId: () => string = () => `PRC-${randomUUID()}`) {}

  async create(input: unknown, creator: ParcelCreator): Promise<{ status: 200 | 201; parcel: CreatedParcel }> {
    if (!creator || typeof creator.id !== 'string' || !creator.id.trim() ||
        creator.role !== 'geometre' || creator.active !== true ||
        typeof creator.surveyorRegistered !== 'boolean') {
      throw new ParcelCreationError('FORBIDDEN_ROLE', 403, 'Geometre actif requis');
    }
    const actor = { ...creator };
    const data = payload(input);
    const prepared = prepareParcelGeometry(data.vertices);
    const id = this.nextId();
    const client = await this.pool.connect();
    let released = false;
    const release = () => { if (!released) { released = true; client.release(); } };
    const db = { query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
      (await client.query(sql, params)).rows as T[] };
    const independentAudit = new AuditService(new PgAuditStore(this.pool), this.clock);
    try {
      return await withParcelOverlapCheck<{ status: 200 | 201; parcel: CreatedParcel }>(
        db, { id, geometry: prepared.geometry }, actor.id,
        { log: async (action, actorId, details, target) => {
          // Le controle a deja fait ROLLBACK : rendre la connexion avant de
          // demander celle du journal, y compris avec un pool limite a un client.
          release();
          return independentAudit.log(action, actorId, details, target);
        } },
        async () => {
          const [measure] = await db.query<{ area: number; perimeter: number }>(
            `WITH metric AS (SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),32631) AS geom)
             SELECT ST_Area(geom) AS area, ST_Perimeter(geom) AS perimeter FROM metric`,
            [JSON.stringify(prepared.geometry)],
          );
          const at = this.clock().toISOString();
          const parcel: CreatedParcel = {
            id, legalStatus: data.legalStatus, certified: actor.surveyorRegistered,
            inConflict: data.legalStatus === 'EN_LITIGE', version: 1,
            areaM2: Number(measure.area), perimeterM: Number(measure.perimeter),
            geometry: prepared.geometry, geometryHash: prepared.geometryHash,
            authorId: actor.id, vertices: prepared.vertices, createdAt: at, updatedAt: at,
            ...(data.label !== undefined ? { label: data.label as string } : {}),
            ...(data.projectId !== undefined ? { projectId: data.projectId as string } : {}),
          };
          await client.query(
            `INSERT INTO parcels(id,author_id,client_id,creation_payload,creation_response,
              project_id,label,legal_status,version,geometry,geometry_hash,vertices,
              area_m2,perimeter_m,in_conflict,created_at,updated_at)
             VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,1,
              ST_SetSRID(ST_GeomFromGeoJSON($9),4326),$10,$11::jsonb,$12,$13,$14,$15,$15)`,
            [id, actor.id, data.clientId, JSON.stringify(data), JSON.stringify(parcel),
              data.projectId ?? null, data.label ?? null, data.legalStatus,
              JSON.stringify(prepared.geometry), prepared.geometryHash, JSON.stringify(prepared.vertices),
              parcel.areaM2, parcel.perimeterM, parcel.inConflict, at],
          );
          await client.query(
            `INSERT INTO parcel_versions(parcel_id,version,project_id,label,legal_status,
              geometry,geometry_hash,vertices,area_m2,perimeter_m,in_conflict,changed_by,changed_at,reason)
             SELECT id,version,project_id,label,legal_status,geometry,geometry_hash,vertices,
              area_m2,perimeter_m,in_conflict,author_id,created_at,NULL FROM parcels WHERE id=$1`, [id],
          );
          const audit = new AuditService(PgAuditStore.inTransaction(client), this.clock);
          await audit.log('PARCEL_CREATED', actor.id, { version: 1, geometryHash: prepared.geometryHash },
            { type: 'parcel', id });
          return { status: 201, parcel };
        },
        async () => {
          const [existing] = await db.query<{ creation_payload: unknown; creation_response: CreatedParcel }>(
            'SELECT creation_payload,creation_response FROM parcels WHERE author_id=$1 AND client_id=$2',
            [actor.id, data.clientId],
          );
          if (!existing) return { handled: false };
          if (canonicalize(existing.creation_payload) !== canonicalize(data)) {
            throw new ParcelCreationError('IDEMPOTENCY_CONFLICT', 409,
              'Ce clientId a deja ete utilise avec un contenu different');
          }
          return { handled: true, value: { status: 200, parcel: existing.creation_response } };
        },
      );
    } finally {
      release();
    }
  }
}
