import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { type TransactionRunner, rowsOf } from '../../audit/sql-runner';
import { isParcelId } from '../parcel-id';
import type { LandActor } from '../parcel.service';

export type SurveyRequestState = 'OUVERTE' | 'PRISE' | 'TERMINEE' | 'ANNULEE';

export const SURVEY_REQUEST_STATES: SurveyRequestState[] = [
  'OUVERTE',
  'PRISE',
  'TERMINEE',
  'ANNULEE',
];

export interface SurveyRequestInput {
  locality: string;
  description: string;
  approxLocation?: { longitude: number; latitude: number };
}

export interface SurveyRequestView {
  id: string;
  state: SurveyRequestState;
  agentId: string;
  surveyorId: string | null;
  parcelId: string | null;
  locality: string;
  description: string;
  approxLocation?: { longitude: number; latitude: number };
  createdAt: string;
}

interface SurveyRequestRow {
  id: string;
  state: SurveyRequestState;
  agent_id: string;
  surveyor_id: string | null;
  parcel_id: string | null;
  locality: string;
  description: string;
  lon: number | null;
  lat: number | null;
  created_at: Date | string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_REQUEST = `
  SELECT id, state, agent_id, surveyor_id, parcel_id, locality, description,
         ST_X(approx_location) AS lon, ST_Y(approx_location) AS lat, created_at
    FROM survey_requests`;

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_ERROR', message });
}

function cleanText(value: unknown, field: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > max) {
    throw invalid(
      `Le champ ${field} est obligatoire (${max} caracteres au plus).`,
    );
  }
  return text;
}

function validateLocation(location: SurveyRequestInput['approxLocation']) {
  if (location === undefined) return null;
  const { longitude, latitude } = location ?? {};
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw invalid('Le champ approxLocation doit contenir une position WGS84.');
  }
  return { longitude, latitude };
}

function toView(row: SurveyRequestRow): SurveyRequestView {
  return {
    id: row.id,
    state: row.state,
    agentId: row.agent_id,
    surveyorId: row.surveyor_id,
    parcelId: row.parcel_id,
    locality: row.locality,
    description: row.description,
    ...(row.lon !== null && row.lat !== null
      ? {
          approxLocation: {
            longitude: Number(row.lon),
            latitude: Number(row.lat),
          },
        }
      : {}),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

@Injectable()
export class SurveyRequestService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  private get db(): TransactionRunner {
    return this.dataSource;
  }

  // Reserve aux agents dont le compte est actif (valide par l'administrateur).
  async create(
    actor: LandActor,
    input: SurveyRequestInput,
  ): Promise<SurveyRequestView> {
    if (actor.role !== 'AGENT' || actor.accountActive !== true) {
      throw await this.deny(actor, 'SURVEY_REQUEST_CREATE');
    }
    const locality = cleanText(input?.locality, 'locality', 120);
    const description = cleanText(input?.description, 'description', 1000);
    const location = validateLocation(input.approxLocation);

    return this.db.transaction(async (tx) => {
      const [row] = rowsOf<SurveyRequestRow>(
        await tx.query(
          `WITH inserted AS (
             INSERT INTO survey_requests (agent_id, locality, description, approx_location)
             VALUES ($1, $2, $3,
               CASE WHEN $4::float8 IS NULL THEN NULL
                    ELSE ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326) END)
             RETURNING *)
           SELECT id, state, agent_id, surveyor_id, parcel_id, locality, description,
                  ST_X(approx_location) AS lon, ST_Y(approx_location) AS lat, created_at
             FROM inserted`,
          [
            actor.id,
            locality,
            description,
            location?.longitude ?? null,
            location?.latitude ?? null,
          ],
        ),
      );
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'SURVEY_REQUEST_CREATED',
          resourceType: 'survey_request',
          resourceId: row.id,
          result: 'SUCCESS',
          details: { locality },
        },
        tx,
      );
      return toView(row);
    });
  }

  // AGENT : ses demandes. GEOMETRE : les demandes ouvertes et les siennes.
  // ADMIN : toutes. Les autres roles sont refuses.
  async list(
    actor: LandActor,
    state?: SurveyRequestState,
  ): Promise<SurveyRequestView[]> {
    if (!['AGENT', 'GEOMETRE', 'ADMIN'].includes(actor.role)) {
      throw await this.deny(actor, 'SURVEY_REQUEST_LIST');
    }
    if (state !== undefined && !SURVEY_REQUEST_STATES.includes(state)) {
      throw invalid(
        `Le filtre state doit etre l'un de : ${SURVEY_REQUEST_STATES.join(', ')}.`,
      );
    }
    const scope =
      actor.role === 'AGENT'
        ? 'agent_id = $1'
        : actor.role === 'GEOMETRE'
          ? "(state = 'OUVERTE' OR surveyor_id = $1)"
          : '$1::uuid IS NOT NULL';
    const rows = rowsOf<SurveyRequestRow>(
      await this.dataSource.query(
        `${SELECT_REQUEST}
          WHERE ${scope} AND ($2::text IS NULL OR state = $2)
          ORDER BY created_at DESC, id`,
        [actor.id, state ?? null],
      ),
    );
    return rows.map(toView);
  }

  // Une demande ouverte ne peut etre prise qu'une fois, meme si deux
  // geometres cliquent en meme temps.
  async take(actor: LandActor, requestId: string): Promise<SurveyRequestView> {
    if (actor.role !== 'GEOMETRE') {
      throw await this.deny(actor, 'SURVEY_REQUEST_TAKE', requestId);
    }
    if (!UUID.test(requestId ?? '')) throw this.notFound();

    return this.db.transaction(async (tx) => {
      const [taken] = rowsOf<{ id: string }>(
        await tx.query(
          `UPDATE survey_requests
              SET state = 'PRISE', surveyor_id = $2, taken_at = now()
            WHERE id = $1 AND state = 'OUVERTE'
        RETURNING id`,
          [requestId, actor.id],
        ),
      );
      if (!taken) {
        const [exists] = rowsOf<{ id: string }>(
          await tx.query('SELECT id FROM survey_requests WHERE id = $1', [
            requestId,
          ]),
        );
        if (!exists) throw this.notFound();
        throw new ConflictException({
          code: 'REQUEST_ALREADY_TAKEN',
          message: 'Cette demande a deja ete prise.',
        });
      }
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'SURVEY_REQUEST_TAKEN',
          resourceType: 'survey_request',
          resourceId: requestId,
          result: 'SUCCESS',
        },
        tx,
      );
      const [row] = rowsOf<SurveyRequestRow>(
        await tx.query(`${SELECT_REQUEST} WHERE id = $1`, [requestId]),
      );
      return toView(row);
    });
  }

  // Decision 5 de LGR (#24) : le geometre qui a pris la demande la passe a
  // TERMINEE, en indiquant si possible la parcelle levee.
  async complete(
    actor: LandActor,
    requestId: string,
    parcelId?: string,
  ): Promise<SurveyRequestView> {
    if (actor.role !== 'GEOMETRE') {
      throw await this.deny(actor, 'SURVEY_REQUEST_COMPLETE', requestId);
    }
    if (parcelId !== undefined && !isParcelId(parcelId)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Le champ parcelId doit etre un identifiant TG-XXX-00000.',
      });
    }
    return this.transition(actor, requestId, {
      operation: 'SURVEY_REQUEST_COMPLETE',
      allowed: (r) => r.surveyor_id === actor.id,
      from: 'PRISE',
      to: 'TERMINEE',
      conflictMessage: 'Seule une demande prise peut etre terminee.',
      action: 'SURVEY_REQUEST_COMPLETED',
      parcelId,
    });
  }

  // Decision 5 de LGR (#24) : l'agent annule sa demande tant qu'elle est
  // ouverte ; une fois prise, il doit voir avec le geometre.
  async cancel(
    actor: LandActor,
    requestId: string,
  ): Promise<SurveyRequestView> {
    if (actor.role !== 'AGENT') {
      throw await this.deny(actor, 'SURVEY_REQUEST_CANCEL', requestId);
    }
    return this.transition(actor, requestId, {
      operation: 'SURVEY_REQUEST_CANCEL',
      allowed: (r) => r.agent_id === actor.id,
      from: 'OUVERTE',
      to: 'ANNULEE',
      conflictMessage:
        'Une demande deja prise ne peut plus etre annulee : contactez le geometre.',
      action: 'SURVEY_REQUEST_CANCELLED',
    });
  }

  private async transition(
    actor: LandActor,
    requestId: string,
    rule: {
      operation: string;
      allowed: (row: {
        agent_id: string;
        surveyor_id: string | null;
      }) => boolean;
      from: SurveyRequestState;
      to: SurveyRequestState;
      conflictMessage: string;
      action: string;
      parcelId?: string;
    },
  ): Promise<SurveyRequestView> {
    if (!UUID.test(requestId ?? '')) throw this.notFound();
    const outcome = await this.db.transaction<
      { denied: true } | { view: SurveyRequestView }
    >(async (tx) => {
      const [current] = rowsOf<{
        state: SurveyRequestState;
        agent_id: string;
        surveyor_id: string | null;
      }>(
        await tx.query(
          'SELECT state, agent_id, surveyor_id FROM survey_requests WHERE id = $1 FOR UPDATE',
          [requestId],
        ),
      );
      if (!current) throw this.notFound();
      if (!rule.allowed(current)) return { denied: true };
      if (current.state !== rule.from) {
        throw new ConflictException({
          code: 'REQUEST_STATE_CONFLICT',
          message: rule.conflictMessage,
          details: { state: current.state },
        });
      }
      if (rule.parcelId) {
        const [parcel] = rowsOf<{ id: string }>(
          await tx.query('SELECT id FROM parcels WHERE id = $1', [
            rule.parcelId,
          ]),
        );
        if (!parcel) {
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Parcelle inconnue.',
          });
        }
      }
      await tx.query(
        `UPDATE survey_requests
            SET state = $2, closed_at = now(), parcel_id = COALESCE($3, parcel_id)
          WHERE id = $1`,
        [requestId, rule.to, rule.parcelId ?? null],
      );
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: rule.action,
          resourceType: 'survey_request',
          resourceId: requestId,
          result: 'SUCCESS',
          details: rule.parcelId ? { parcelId: rule.parcelId } : {},
        },
        tx,
      );
      const [row] = rowsOf<SurveyRequestRow>(
        await tx.query(`${SELECT_REQUEST} WHERE id = $1`, [requestId]),
      );
      return { view: toView(row) };
    });
    if ('denied' in outcome) {
      throw await this.deny(actor, rule.operation, requestId);
    }
    return outcome.view;
  }

  private async deny(
    actor: LandActor,
    operation: string,
    resourceId?: string,
  ): Promise<ForbiddenException> {
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ACCESS_DENIED',
      resourceType: 'survey_request',
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
      message: 'Demande de leve introuvable.',
    });
  }
}
