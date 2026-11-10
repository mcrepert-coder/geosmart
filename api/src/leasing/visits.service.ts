import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { type CurrentActorValue } from '../audit/current-actor.decorator';
import { rowsOf } from '../audit/sql-runner';
import { SMS_SENDER, type SmsSender } from '../auth/sms.sender';
import { PROPERTY_LOOKUP, type PropertyLookup } from './property-lookup';

// EF-305 : visites avec statut et heure de rappel enregistree. L'envoi du
// rappel passe par SmsSender (journalise tant qu'aucun fournisseur reel
// n'est choisi, phase 4).
export const VISIT_STATUSES = [
  'DEMANDEE',
  'CONFIRMEE',
  'FAITE',
  'ANNULEE',
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

const TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  DEMANDEE: ['CONFIRMEE', 'ANNULEE'],
  CONFIRMEE: ['FAITE', 'ANNULEE'],
  FAITE: [],
  ANNULEE: [],
};

interface VisitRow {
  id: string;
  property_id: string;
  requester_id: string;
  status: VisitStatus;
  scheduled_at: Date | string | null;
  reminder_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface VisitView {
  id: string;
  propertyId: string;
  requesterId: string;
  status: VisitStatus;
  scheduledAt: string | null;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toView(row: VisitRow): VisitView {
  return {
    id: row.id,
    propertyId: row.property_id,
    requesterId: row.requester_id,
    status: row.status,
    scheduledAt: row.scheduled_at
      ? new Date(row.scheduled_at).toISOString()
      : null,
    reminderAt: row.reminder_at
      ? new Date(row.reminder_at).toISOString()
      : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function validation(message: string) {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message,
  });
}

function forbidden() {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    message: 'Action non autorisee pour votre role.',
  });
}

function notFound() {
  return new NotFoundException({
    code: 'NOT_FOUND',
    message: 'Ressource introuvable.',
  });
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw validation(`${field} doit etre une date ISO 8601.`);
  }
  return new Date(value).toISOString();
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(PROPERTY_LOOKUP) private readonly properties: PropertyLookup,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  // Un client demande une visite ; un agent peut aussi en organiser une.
  async request(
    actor: CurrentActorValue,
    input: {
      propertyId: string;
      scheduledAt?: string;
      reminderAt?: string;
    },
  ): Promise<VisitView> {
    if (actor.accountActive !== true) {
      throw forbidden();
    }
    if (actor.role !== 'CLIENT' && actor.role !== 'AGENT') {
      throw forbidden();
    }
    const property = await this.properties.findPublished(input?.propertyId);
    if (!property) {
      throw validation('Le bien est introuvable ou n est pas publie.');
    }
    const scheduledAt = optionalDate(input.scheduledAt, 'scheduledAt');
    const reminderAt = optionalDate(input.reminderAt, 'reminderAt');
    const id = randomUUID();
    await this.dataSource.query(
      `INSERT INTO visits (id, property_id, requester_id, status, scheduled_at, reminder_at)
       VALUES ($1, $2, $3, 'DEMANDEE', $4, $5)`,
      [id, property.id, actor.id, scheduledAt, reminderAt],
    );
    return toView((await this.findRow(id))!);
  }

  async listMine(actor: CurrentActorValue): Promise<VisitView[]> {
    const rows = rowsOf<VisitRow>(
      await this.dataSource.query(
        `SELECT * FROM visits
          WHERE ($1 = 'ADMIN' OR requester_id = $2)
          ORDER BY created_at DESC`,
        [actor.role, actor.id],
      ),
    );
    return rows.map(toView);
  }

  async getOne(actor: CurrentActorValue, visitId: string): Promise<VisitView> {
    const row = await this.findAccessible(actor, visitId);
    return toView(row);
  }

  // CONFIRMEE par un agent (ou admin) : l'heure de rappel est enregistree et
  // le rappel est envoye via SmsSender. FAITE et ANNULEE suivent le cycle.
  async updateStatus(
    actor: CurrentActorValue,
    visitId: string,
    input: { status: string; scheduledAt?: string; reminderAt?: string },
  ): Promise<VisitView> {
    if (actor.accountActive !== true) {
      throw forbidden();
    }
    const row = await this.findAccessible(actor, visitId);
    const status = input?.status as VisitStatus;
    if (
      typeof status !== 'string' ||
      !VISIT_STATUSES.includes(status) ||
      !TRANSITIONS[row.status].includes(status)
    ) {
      throw validation(
        `La transition ${row.status} vers ${String(input?.status)} n est pas permise.`,
      );
    }
    const isAgentSide = actor.role === 'AGENT' || actor.role === 'ADMIN';
    if ((status === 'CONFIRMEE' || status === 'FAITE') && !isAgentSide) {
      throw forbidden();
    }
    if (status === 'ANNULEE' && !isAgentSide && row.requester_id !== actor.id) {
      throw forbidden();
    }
    const scheduledAt = optionalDate(input.scheduledAt, 'scheduledAt');
    const reminderAt = optionalDate(input.reminderAt, 'reminderAt');
    await this.dataSource.query(
      `UPDATE visits
          SET status = $1,
              scheduled_at = COALESCE($2, scheduled_at),
              reminder_at = COALESCE($3, reminder_at),
              updated_at = now()
        WHERE id = $4`,
      [status, scheduledAt, reminderAt, visitId],
    );
    if (status === 'CONFIRMEE') {
      const updated = await this.findRow(visitId);
      const requester = rowsOf<{ phone: string }>(
        await this.dataSource.query(
          'SELECT phone FROM accounts WHERE id = $1',
          [updated!.requester_id],
        ),
      );
      if (requester[0]) {
        const quand = updated!.scheduled_at
          ? ` le ${new Date(updated!.scheduled_at).toISOString()}`
          : '';
        await this.sms.send(
          requester[0].phone,
          `Votre visite du bien ${updated!.property_id} est confirmee${quand}.`,
        );
      }
    }
    return toView((await this.findRow(visitId))!);
  }

  private async findRow(visitId: string): Promise<VisitRow | undefined> {
    const rows = rowsOf<VisitRow>(
      await this.dataSource.query('SELECT * FROM visits WHERE id = $1', [
        visitId,
      ]),
    );
    return rows[0];
  }

  // Demandeur, agent ou admin ; pour les autres la visite n'existe pas.
  private async findAccessible(
    actor: CurrentActorValue,
    visitId: string,
  ): Promise<VisitRow> {
    const row = await this.findRow(visitId);
    if (!row) {
      throw notFound();
    }
    const isAgentSide = actor.role === 'AGENT' || actor.role === 'ADMIN';
    if (row.requester_id !== actor.id && !isAgentSide) {
      throw notFound();
    }
    return row;
  }
}
