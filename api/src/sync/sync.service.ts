import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { type CurrentActorValue } from '../audit/current-actor.decorator';
import { AuditService } from '../audit/audit.service';
import { rowsOf } from '../audit/sql-runner';
import { sha256 } from '../auth/accounts.service';
import { isAssignedTopographer } from './projects.service';

// Element de la file locale (contracts/sync.yaml, RG-08) : une borne seule
// (survey_point) ou une mission complete (survey_session).
export interface SyncItemInput {
  clientId: string;
  entityType: string;
  action: string;
  payload: Record<string, unknown>;
}

// Accuse de reception par element. Le corps de reponse est une proposition
// (decision x-team-decisions success-response du contrat sync).
export interface SyncReceipt {
  clientId: string;
  result: 'ACCEPTED' | 'DUPLICATE';
  id: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIX_QUALITIES = ['FIXED', 'FLOAT', 'AUTONOME', 'INVALIDE'];

const PAYLOAD_REQUIRED = [
  'projectId',
  'pointNumber',
  'latitude',
  'longitude',
  'altitude',
  'fixQuality',
  'satellitesCount',
  'pdop',
  'instrument',
  'recordedAt',
];

const PAYLOAD_ALLOWED = [
  ...PAYLOAD_REQUIRED,
  'pointName',
  'accuracy',
  'hdop',
  'vdop',
];

// Mission complete (contracts/survey.md, section 3) : une entree de la file
// locale par mission terminee, jamais par borne.
export const MIN_SESSION_POINTS = 3;

const SESSION_REQUIRED = [
  'projectId',
  'status',
  'perimeterMeters',
  'areaSquareMeters',
  'createdAt',
  'completedAt',
  'points',
];

const SESSION_ALLOWED = [...SESSION_REQUIRED, 'surveyorId', 'title'];

// Une borne de mission porte son propre clientId et n'a pas de projectId :
// celui de la mission s'applique (survey_point.dart, toPayload).
const SESSION_POINT_REQUIRED = [
  'clientId',
  ...PAYLOAD_REQUIRED.filter((field) => field !== 'projectId'),
];

const SESSION_POINT_ALLOWED = [
  ...SESSION_POINT_REQUIRED,
  'pointName',
  'accuracy',
  'hdop',
  'vdop',
  'isValidated',
];

const ENTITY_TYPES = ['survey_point', 'survey_session'];
type EntityType = 'survey_point' | 'survey_session';

// Hachage stable : deux envois du meme element donnent la meme empreinte,
// quel que soit l'ordre des cles.
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function rejected(clientId: string | undefined, reason: string) {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message:
      'Le point ne peut pas etre enregistre comme limite fonciere officielle.',
    details: { clientId, reason },
  });
}

function forbidden(clientId: string | undefined, reason: string) {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    message: reason,
    details: { clientId, reason },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Le telephone envoie null pour un champ facultatif absent.
function withoutNulls(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== null),
  );
}

@Injectable()
export class SyncService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // EF-405, RG-08, CA-3 : aucun doublon au renvoi du meme clientId.
  async processItem(
    actor: CurrentActorValue,
    item: SyncItemInput,
  ): Promise<SyncReceipt> {
    const clientId =
      typeof item?.clientId === 'string' ? item.clientId : undefined;
    if (!clientId || !UUID_RE.test(clientId)) {
      throw rejected(clientId, 'clientId doit etre un UUID.');
    }
    if (!ENTITY_TYPES.includes(item.entityType)) {
      throw rejected(
        clientId,
        'entityType doit valoir survey_point ou survey_session.',
      );
    }
    const entityType = item.entityType as EntityType;
    if (item.action !== 'CREATE') {
      throw rejected(clientId, 'Seule action CREATE est acceptee.');
    }
    if (actor.accountActive !== true || actor.role !== 'TOPOGRAPHE') {
      const reason =
        'Seul un topographe au compte actif peut synchroniser des points.';
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SYNC_ITEM',
        resourceType: entityType,
        result: 'DENIED',
        details: { clientId, reason },
      });
      throw forbidden(clientId, reason);
    }

    // RG-01 : pas de RTK Fixed, pas de borne officielle. Pour une mission,
    // une seule borne non FIXED rejette la mission entiere.
    let notFixed: string | null;
    let summary: Record<string, unknown>;
    if (entityType === 'survey_point') {
      this.validatePayload(clientId, item.payload);
      notFixed =
        item.payload.fixQuality !== 'FIXED'
          ? 'fixQuality doit etre FIXED pour une limite fonciere officielle.'
          : null;
      summary = {
        projectId: item.payload.projectId,
        pointNumber: item.payload.pointNumber,
      };
    } else {
      const points = this.validateSession(clientId, item.payload);
      const bad = points.find((point) => point.fixQuality !== 'FIXED');
      notFixed = bad
        ? `La borne ${String(bad.pointNumber)} n'est pas FIXED : la mission ne peut pas servir de limite fonciere officielle.`
        : null;
      summary = {
        projectId: item.payload.projectId,
        pointsCount: points.length,
      };
    }
    // CA-7 : seulement sur un chantier ouvert assigne au topographe.
    const projectId = item.payload.projectId as string;
    if (!(await isAssignedTopographer(this.dataSource, projectId, actor.id))) {
      const reason =
        'Le projectId ne correspond pas a un chantier ouvert assigne au topographe.';
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SYNC_ITEM',
        resourceType: entityType,
        result: 'DENIED',
        details: { clientId, projectId, reason },
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: "Le topographe n'est pas assigne a ce chantier.",
        details: { clientId, reason },
      });
    }

    if (notFixed) {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SYNC_ITEM',
        resourceType: entityType,
        result: 'REJECTED',
        details: { clientId, reason: notFixed },
      });
      throw rejected(clientId, notFixed);
    }

    // La mission et ses bornes sont rangees dans une seule ligne, dans une
    // seule transaction : rien n'est insere partiellement (survey.md).
    const payloadHash = sha256(stableStringify(item.payload));
    const id = randomUUID();
    try {
      return await this.dataSource.transaction(async (tx) => {
        const existing = rowsOf<{ id: string; payload_hash: string }>(
          await tx.query(
            'SELECT id, payload_hash FROM sync_items WHERE account_id = $1 AND client_id = $2',
            [actor.id, clientId],
          ),
        );
        if (existing[0]) {
          if (existing[0].payload_hash !== payloadHash) {
            throw new HttpException(
              {
                code: 'IDEMPOTENCY_CONFLICT',
                message: 'Ce clientId est deja associe a un element different.',
                details: {
                  clientId,
                  reason:
                    'Le contenu ne correspond pas a celui du premier envoi.',
                },
              },
              409,
            );
          }
          return {
            clientId,
            result: 'DUPLICATE' as const,
            id: existing[0].id,
          };
        }
        await tx.query(
          `INSERT INTO sync_items
             (id, client_id, account_id, entity_type, action, payload, payload_hash)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [
            id,
            clientId,
            actor.id,
            entityType,
            item.action,
            stableStringify(item.payload),
            payloadHash,
          ],
        );
        await this.audit.log(
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'SYNC_ITEM',
            resourceType: entityType,
            resourceId: id,
            result: 'SUCCESS',
            details: { clientId, ...summary },
          },
          tx,
        );
        return { clientId, result: 'ACCEPTED' as const, id };
      });
    } catch (error) {
      // Deux envois simultanes du meme element : le second relit la ligne
      // deja acceptee au lieu de creer un doublon.
      if (this.isUniqueViolation(error)) {
        const rows = rowsOf<{ id: string; payload_hash: string }>(
          await this.dataSource.query(
            'SELECT id, payload_hash FROM sync_items WHERE account_id = $1 AND client_id = $2',
            [actor.id, clientId],
          ),
        );
        if (rows[0]?.payload_hash === payloadHash) {
          return { clientId, result: 'DUPLICATE', id: rows[0].id };
        }
        throw new HttpException(
          {
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Ce clientId est deja associe a un element different.',
            details: {
              clientId,
              reason: 'Le contenu ne correspond pas a celui du premier envoi.',
            },
          },
          409,
        );
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    const code = (error as { code?: string; driverError?: { code?: string } })
      ?.driverError?.code;
    return code === '23505' || (error as { code?: string })?.code === '23505';
  }

  private validatePayload(
    clientId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!isRecord(payload)) {
      throw rejected(clientId, 'payload est obligatoire.');
    }
    this.checkFields(clientId, payload, PAYLOAD_REQUIRED, PAYLOAD_ALLOWED);
    this.validateProjectId(clientId, payload);
    this.validatePointFields(clientId, payload);
  }

  // Regles serveur de contracts/survey.md (section 3) pour une mission.
  // Renvoie les bornes validees, sans les champs null, pour le controle RG-01.
  private validateSession(
    clientId: string,
    payload: Record<string, unknown>,
  ): Record<string, unknown>[] {
    if (!isRecord(payload)) {
      throw rejected(clientId, 'payload est obligatoire.');
    }
    const session = withoutNulls(payload);
    this.checkFields(clientId, session, SESSION_REQUIRED, SESSION_ALLOWED);
    this.validateProjectId(clientId, session);
    if (session.status !== 'COMPLETED') {
      throw rejected(clientId, 'La mission doit etre au statut COMPLETED.');
    }
    this.validateNumber(clientId, session, 'perimeterMeters', 0);
    this.validateNumber(clientId, session, 'areaSquareMeters', 0);
    this.validateDate(clientId, session, 'createdAt');
    this.validateDate(clientId, session, 'completedAt');
    for (const field of ['surveyorId', 'title']) {
      if (session[field] !== undefined && typeof session[field] !== 'string') {
        throw rejected(clientId, `${field} doit etre une chaine.`);
      }
    }
    const rawPoints = session.points;
    if (!Array.isArray(rawPoints) || rawPoints.length < MIN_SESSION_POINTS) {
      throw rejected(
        clientId,
        `La mission doit contenir au moins ${MIN_SESSION_POINTS} bornes.`,
      );
    }
    const points: Record<string, unknown>[] = [];
    const clientIds = new Set<string>();
    const numbers = new Set<number>();
    for (const raw of rawPoints as unknown[]) {
      if (!isRecord(raw)) {
        throw rejected(clientId, 'Chaque borne doit etre un objet.');
      }
      const point = withoutNulls(raw);
      this.checkFields(
        clientId,
        point,
        SESSION_POINT_REQUIRED,
        SESSION_POINT_ALLOWED,
      );
      if (typeof point.clientId !== 'string' || !UUID_RE.test(point.clientId)) {
        throw rejected(
          clientId,
          'Le clientId de chaque borne doit etre un UUID.',
        );
      }
      if (clientIds.has(point.clientId)) {
        throw rejected(clientId, 'Deux bornes ont le meme clientId.');
      }
      clientIds.add(point.clientId);
      this.validatePointFields(clientId, point);
      const pointNumber = point.pointNumber as number;
      if (numbers.has(pointNumber)) {
        throw rejected(clientId, 'Deux bornes ont le meme pointNumber.');
      }
      numbers.add(pointNumber);
      if (
        point.isValidated !== undefined &&
        typeof point.isValidated !== 'boolean'
      ) {
        throw rejected(clientId, 'isValidated doit etre un booleen.');
      }
      points.push(point);
    }
    return points;
  }

  private checkFields(
    clientId: string,
    payload: Record<string, unknown>,
    required: string[],
    allowed: string[],
  ): void {
    for (const field of required) {
      if (payload[field] === undefined || payload[field] === null) {
        throw rejected(clientId, `Le champ ${field} est obligatoire.`);
      }
    }
    const unknown = Object.keys(payload).filter(
      (key) => !allowed.includes(key),
    );
    if (unknown.length > 0) {
      throw rejected(clientId, `Champs non admis : ${unknown.join(', ')}.`);
    }
  }

  private validateProjectId(
    clientId: string,
    payload: Record<string, unknown>,
  ): void {
    if (
      typeof payload.projectId !== 'string' ||
      !UUID_RE.test(payload.projectId)
    ) {
      throw rejected(clientId, 'projectId doit etre un UUID.');
    }
  }

  // Champs de mesure communs a une borne seule et a une borne de mission.
  private validatePointFields(
    clientId: string,
    payload: Record<string, unknown>,
  ): void {
    if (
      !Number.isInteger(payload.pointNumber) ||
      (payload.pointNumber as number) < 1
    ) {
      throw rejected(clientId, 'pointNumber doit etre un entier positif.');
    }
    this.validateNumber(clientId, payload, 'latitude', -90, 90);
    this.validateNumber(clientId, payload, 'longitude', -180, 180);
    this.validateNumber(clientId, payload, 'altitude');
    this.validateNumber(clientId, payload, 'pdop', 0);
    for (const optional of ['accuracy', 'hdop', 'vdop']) {
      if (payload[optional] !== undefined) {
        this.validateNumber(clientId, payload, optional, 0);
      }
    }
    if (
      typeof payload.fixQuality !== 'string' ||
      !FIX_QUALITIES.includes(payload.fixQuality)
    ) {
      throw rejected(
        clientId,
        `fixQuality doit valoir ${FIX_QUALITIES.join(', ')}.`,
      );
    }
    if (
      !Number.isInteger(payload.satellitesCount) ||
      (payload.satellitesCount as number) < 0
    ) {
      throw rejected(clientId, 'satellitesCount doit etre un entier positif.');
    }
    if (typeof payload.instrument !== 'string' || payload.instrument === '') {
      throw rejected(clientId, 'instrument est obligatoire.');
    }
    this.validateDate(clientId, payload, 'recordedAt');
    if (
      payload.pointName !== undefined &&
      typeof payload.pointName !== 'string'
    ) {
      throw rejected(clientId, 'pointName doit etre une chaine.');
    }
  }

  private validateDate(
    clientId: string,
    payload: Record<string, unknown>,
    field: string,
  ): void {
    const value = payload[field];
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      throw rejected(clientId, `${field} doit etre une date ISO 8601.`);
    }
  }

  private validateNumber(
    clientId: string,
    payload: Record<string, unknown>,
    field: string,
    min?: number,
    max?: number,
  ): void {
    const value = payload[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw rejected(clientId, `${field} doit etre un nombre.`);
    }
    if (
      (min !== undefined && value < min) ||
      (max !== undefined && value > max)
    ) {
      throw rejected(clientId, `${field} sort des limites admises.`);
    }
  }
}
