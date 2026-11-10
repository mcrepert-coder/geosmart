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

// Element de la file locale (contracts/sync.yaml, RG-08).
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
    if (item.entityType !== 'survey_point') {
      throw rejected(clientId, 'Seul entityType survey_point est accepte.');
    }
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
        resourceType: 'survey_point',
        result: 'DENIED',
        details: { clientId, reason },
      });
      throw forbidden(clientId, reason);
    }
    this.validatePayload(clientId, item.payload);

    // RG-01 : pas de RTK Fixed, pas de borne officielle.
    if (item.payload.fixQuality !== 'FIXED') {
      const reason =
        'fixQuality doit etre FIXED pour une limite fonciere officielle.';
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'SYNC_ITEM',
        resourceType: 'survey_point',
        result: 'REJECTED',
        details: { clientId, reason },
      });
      throw rejected(clientId, reason);
    }

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
            item.entityType,
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
            resourceType: 'survey_point',
            resourceId: id,
            result: 'SUCCESS',
            details: {
              clientId,
              projectId: item.payload.projectId,
              pointNumber: item.payload.pointNumber,
            },
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
    if (payload === null || typeof payload !== 'object') {
      throw rejected(clientId, 'payload est obligatoire.');
    }
    for (const field of PAYLOAD_REQUIRED) {
      if (payload[field] === undefined || payload[field] === null) {
        throw rejected(clientId, `Le champ ${field} est obligatoire.`);
      }
    }
    const unknown = Object.keys(payload).filter(
      (key) => !PAYLOAD_ALLOWED.includes(key),
    );
    if (unknown.length > 0) {
      throw rejected(clientId, `Champs non admis : ${unknown.join(', ')}.`);
    }
    if (
      typeof payload.projectId !== 'string' ||
      !UUID_RE.test(payload.projectId)
    ) {
      throw rejected(clientId, 'projectId doit etre un UUID.');
    }
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
    if (
      typeof payload.recordedAt !== 'string' ||
      Number.isNaN(Date.parse(payload.recordedAt))
    ) {
      throw rejected(clientId, 'recordedAt doit etre une date ISO 8601.');
    }
    if (
      payload.pointName !== undefined &&
      typeof payload.pointName !== 'string'
    ) {
      throw rejected(clientId, 'pointName doit etre une chaine.');
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
