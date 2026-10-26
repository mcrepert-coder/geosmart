import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { AuditService, Clock } from '../audit/audit.service';
import { PgAuditStore } from '../audit/pg-audit.store';

// Demandes de leve (EF-207) : un agent demande, un geometre prend.
// Le contexte actor vient du module auth apres verification en base, jamais du corps HTTP.
export interface SurveyRequestActor { id: string; role: string; active: boolean }

export type SurveyRequestStatus = 'OUVERTE' | 'PRISE' | 'TERMINEE' | 'ANNULEE';
const STATUSES: SurveyRequestStatus[] = ['OUVERTE', 'PRISE', 'TERMINEE', 'ANNULEE'];

export interface SurveyRequest {
  id: string;
  status: SurveyRequestStatus;
  agentId: string;
  surveyorId: string | null;
  parcelId: string | null;
  description: string;
  location: { lon: number; lat: number };
  contactPhone?: string;
  createdAt: string;
  takenAt?: string;
}

export class SurveyRequestError extends Error {
  constructor(
    readonly code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN_ROLE' | 'NOT_FOUND'
      | 'REQUEST_ALREADY_TAKEN',
    readonly status: 400 | 401 | 403 | 404 | 409,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'SurveyRequestError';
  }
}

function invalid(path: string): never {
  throw new SurveyRequestError('VALIDATION_ERROR', 400, `Champ invalide : ${path}`, { path });
}

function requireActor(actor: SurveyRequestActor | undefined, roles: string[], message: string): SurveyRequestActor {
  if (!actor) throw new SurveyRequestError('UNAUTHORIZED', 401, 'Authentification requise');
  if (typeof actor.id !== 'string' || !actor.id.trim() || actor.active !== true ||
      !roles.includes(actor.role)) {
    throw new SurveyRequestError('FORBIDDEN_ROLE', 403, message);
  }
  return { id: actor.id, role: actor.role, active: true };
}

function createPayload(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('body');
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['description', 'location', 'contactPhone'].includes(key))) invalid('body');
  if (typeof data.description !== 'string' || !data.description.trim() ||
      [...data.description].length > 1000) invalid('description');
  const location = data.location as Record<string, unknown> | undefined;
  if (!location || typeof location !== 'object' || Array.isArray(location) ||
      Object.keys(location).some((key) => !['lon', 'lat'].includes(key))) invalid('location');
  const { lon, lat } = location;
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) invalid('location.lon');
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) invalid('location.lat');
  if (data.contactPhone !== undefined &&
      (typeof data.contactPhone !== 'string' || !/^\+?[0-9]{8,15}$/.test(data.contactPhone))) {
    invalid('contactPhone');
  }
  return {
    description: data.description,
    lon, lat,
    contactPhone: data.contactPhone as string | undefined,
  };
}

interface Row {
  id: string; status: SurveyRequestStatus; agent_id: string; surveyor_id: string | null;
  parcel_id: string | null; description: string; lon: number; lat: number;
  contact_phone: string | null; created_at: Date | string; taken_at: Date | string | null;
}

const COLUMNS = `id, status, agent_id, surveyor_id, parcel_id, description,
  ST_X(location) AS lon, ST_Y(location) AS lat, contact_phone, created_at, taken_at`;

// Le telephone de contact n'est visible que de l'agent auteur, de l'administrateur
// et du geometre qui a pris la demande ; pas des geometres qui parcourent les demandes ouvertes.
function toRequest(row: Row, reader: SurveyRequestActor): SurveyRequest {
  const phoneVisible = reader.role === 'admin' || row.agent_id === reader.id ||
    (row.surveyor_id !== null && row.surveyor_id === reader.id);
  return {
    id: row.id,
    status: row.status,
    agentId: row.agent_id,
    surveyorId: row.surveyor_id,
    parcelId: row.parcel_id,
    description: row.description,
    location: { lon: Number(row.lon), lat: Number(row.lat) },
    ...(phoneVisible && row.contact_phone !== null ? { contactPhone: row.contact_phone } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.taken_at !== null ? { takenAt: new Date(row.taken_at).toISOString() } : {}),
  };
}

export class SurveyRequestService {
  constructor(private readonly pool: Pool,
    private readonly clock: Clock = () => new Date(),
    private readonly nextId: () => string = () => `DML-${randomUUID()}`) {}

  async create(input: unknown, actor?: SurveyRequestActor): Promise<SurveyRequest> {
    const agent = requireActor(actor, ['agent'], 'Agent actif requis');
    const data = createPayload(input);
    const id = this.nextId();
    return this.inTransaction(async (client, audit) => {
      const at = this.clock().toISOString();
      const { rows } = await client.query<Row>(
        `INSERT INTO survey_requests (id, agent_id, description, location, contact_phone, created_at)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7)
         RETURNING ${COLUMNS}`,
        [id, agent.id, data.description, data.lon, data.lat, data.contactPhone ?? null, at],
      );
      await audit.log('SURVEY_REQUEST_CREATED', agent.id, {}, { type: 'survey_request', id });
      return toRequest(rows[0], agent);
    });
  }

  async list(input: unknown = {}, actor?: SurveyRequestActor): Promise<SurveyRequest[]> {
    const reader = requireActor(actor, ['agent', 'geometre', 'admin'], 'Role insuffisant pour consulter les demandes');
    if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('filters');
    const filters = input as Record<string, unknown>;
    if (Object.keys(filters).some((key) => key !== 'status')) invalid('filters');
    if (filters.status !== undefined && !STATUSES.includes(filters.status as SurveyRequestStatus)) invalid('status');
    const scope = reader.role === 'admin' ? 'true'
      : reader.role === 'agent' ? 'agent_id = $2'
        : `(status = 'OUVERTE' OR surveyor_id = $2)`;
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM survey_requests
       WHERE ($1::text IS NULL OR status = $1) AND ${scope}
       ORDER BY created_at, id`,
      reader.role === 'admin' ? [filters.status ?? null] : [filters.status ?? null, reader.id],
    );
    return rows.map((row) => toRequest(row, reader));
  }

  // Prise atomique : la mise a jour conditionnelle garantit un seul geometre,
  // meme si plusieurs prises arrivent en meme temps. Reprendre sa propre demande
  // renvoie l'etat courant sans nouvel audit, pour qu'une reprise reseau soit sans effet.
  async take(id: unknown, actor?: SurveyRequestActor): Promise<SurveyRequest> {
    const surveyor = requireActor(actor, ['geometre'], 'Geometre actif requis');
    if (typeof id !== 'string' || !id.trim()) invalid('id');
    return this.inTransaction(async (client, audit) => {
      const at = this.clock().toISOString();
      const { rows } = await client.query<Row>(
        `UPDATE survey_requests SET status = 'PRISE', surveyor_id = $2, taken_at = $3
         WHERE id = $1 AND status = 'OUVERTE'
         RETURNING ${COLUMNS}`,
        [id, surveyor.id, at],
      );
      if (rows.length) {
        await audit.log('SURVEY_REQUEST_TAKEN', surveyor.id, {}, { type: 'survey_request', id });
        return toRequest(rows[0], surveyor);
      }
      const { rows: existing } = await client.query<Row>(
        `SELECT ${COLUMNS} FROM survey_requests WHERE id = $1`, [id]);
      if (!existing.length) throw new SurveyRequestError('NOT_FOUND', 404, 'Demande de leve introuvable');
      if (existing[0].status === 'PRISE' && existing[0].surveyor_id === surveyor.id) {
        return toRequest(existing[0], surveyor);
      }
      throw new SurveyRequestError('REQUEST_ALREADY_TAKEN', 409,
        'Demande deja prise ou fermee', { status: existing[0].status });
    });
  }

  // La demande et sa ligne de journal sont validees ou annulees ensemble.
  private async inTransaction<T>(work: (client: PoolClient, audit: AuditService) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = await work(client, new AuditService(PgAuditStore.inTransaction(client), this.clock));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
