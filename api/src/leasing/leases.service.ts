import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { type CurrentActorValue } from '../audit/current-actor.decorator';
import { rowsOf } from '../audit/sql-runner';
import { PROPERTY_LOOKUP, type PropertyLookup } from './property-lookup';

// EF-307 : baux et loyers. Echeances mensuelles generees a la creation ;
// un loyer non paye dont la date est passee est EN_RETARD.
export type RentStatus = 'A_PAYER' | 'PAYEE' | 'EN_RETARD';

interface LeaseRow {
  id: string;
  property_id: string;
  agent_id: string;
  tenant_account_id: string | null;
  tenant_name: string | null;
  monthly_rent: number;
  start_date: string | Date;
  months: number;
  created_at: Date | string;
}

interface RentRow {
  id: string;
  lease_id: string;
  due_date: string | Date;
  amount: number;
  paid_at: Date | string | null;
}

export interface RentView {
  id: string;
  dueDate: string;
  amount: number;
  status: RentStatus;
  paidAt: string | null;
}

export interface LeaseView {
  id: string;
  propertyId: string;
  agentId: string;
  tenantAccountId: string | null;
  tenantName: string | null;
  monthlyRent: number;
  startDate: string;
  months: number;
  createdAt: string;
  rents: RentView[];
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

// Echeance mensuelle : le jour est conserve, sinon ramene au dernier jour
// du mois cible (le 31 donne le 28 ou 30 en fevrier par exemple).
export function addMonths(startDate: string, months: number): string {
  const [year, month, day] = startDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  if (date.getUTCDate() !== day) {
    date.setUTCDate(0);
  }
  return date.toISOString().slice(0, 10);
}

// PostgreSQL renvoie les colonnes date en texte, PGlite en objet Date.
export function toDateString(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function toRentView(row: RentRow): RentView {
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = toDateString(row.due_date);
  let status: RentStatus = 'A_PAYER';
  if (row.paid_at) {
    status = 'PAYEE';
  } else if (dueDate < today) {
    status = 'EN_RETARD';
  }
  return {
    id: row.id,
    dueDate,
    amount: Number(row.amount),
    status,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
  };
}

@Injectable()
export class LeasesService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(PROPERTY_LOOKUP) private readonly properties: PropertyLookup,
    private readonly audit: AuditService,
  ) {}

  // Seul un agent actif cree un bail ; un client ne cree jamais de bail.
  async create(
    actor: CurrentActorValue,
    input: {
      propertyId: string;
      tenantAccountId?: string;
      tenantName?: string;
      monthlyRent: number;
      startDate: string;
      months: number;
    },
  ): Promise<LeaseView> {
    if (actor.accountActive !== true || actor.role !== 'AGENT') {
      throw forbidden();
    }
    const property = await this.properties.findPublished(input?.propertyId);
    if (!property) {
      throw validation('Le bien est introuvable ou n est pas publie.');
    }
    if (
      !Number.isInteger(input?.monthlyRent) ||
      input.monthlyRent < 0 ||
      !Number.isInteger(input.months) ||
      input.months < 1 ||
      input.months > 120
    ) {
      throw validation(
        'monthlyRent doit etre un entier positif et months un entier entre 1 et 120.',
      );
    }
    if (
      typeof input.startDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ||
      Number.isNaN(Date.parse(`${input.startDate}T00:00:00Z`))
    ) {
      throw validation('startDate doit etre une date au format AAAA-MM-JJ.');
    }
    for (const [field, value] of [
      ['tenantName', input.tenantName],
      ['tenantAccountId', input.tenantAccountId],
    ] as const) {
      if (value !== undefined && (typeof value !== 'string' || value === '')) {
        throw validation(`${field} doit etre une chaine non vide.`);
      }
    }
    const leaseId = randomUUID();
    await this.dataSource.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO leases
           (id, property_id, agent_id, tenant_account_id, tenant_name,
            monthly_rent, start_date, months)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          leaseId,
          property.id,
          actor.id,
          input.tenantAccountId ?? null,
          input.tenantName ?? null,
          input.monthlyRent,
          input.startDate,
          input.months,
        ],
      );
      for (let month = 0; month < input.months; month++) {
        await tx.query(
          `INSERT INTO lease_rents (id, lease_id, due_date, amount)
           VALUES ($1, $2, $3, $4)`,
          [
            randomUUID(),
            leaseId,
            addMonths(input.startDate, month),
            input.monthlyRent,
          ],
        );
      }
      // RG-10 : le bail et sa ligne d'audit dans la meme transaction.
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'LEASE_CREATE',
          resourceType: 'lease',
          resourceId: leaseId,
          result: 'SUCCESS',
          details: {
            propertyId: property.id,
            monthlyRent: input.monthlyRent,
            months: input.months,
          },
        },
        tx,
      );
    });
    return this.getOne(actor, leaseId);
  }

  async getOne(actor: CurrentActorValue, leaseId: string): Promise<LeaseView> {
    const row = await this.findAccessible(actor, leaseId);
    const rents = rowsOf<RentRow>(
      await this.dataSource.query(
        'SELECT * FROM lease_rents WHERE lease_id = $1 ORDER BY due_date',
        [leaseId],
      ),
    );
    return {
      id: row.id,
      propertyId: row.property_id,
      agentId: row.agent_id,
      tenantAccountId: row.tenant_account_id,
      tenantName: row.tenant_name,
      monthlyRent: Number(row.monthly_rent),
      startDate: toDateString(row.start_date),
      months: Number(row.months),
      createdAt: new Date(row.created_at).toISOString(),
      rents: rents.map(toRentView),
    };
  }

  // Loyer marque paye hors application (phase 3 : paiement mobile).
  async markRentPaid(
    actor: CurrentActorValue,
    leaseId: string,
    rentId: string,
  ): Promise<RentView> {
    if (actor.accountActive !== true) {
      throw forbidden();
    }
    const lease = await this.findAccessible(actor, leaseId);
    if (lease.agent_id !== actor.id && actor.role !== 'ADMIN') {
      throw forbidden();
    }
    const rents = rowsOf<RentRow>(
      await this.dataSource.query(
        'SELECT * FROM lease_rents WHERE id = $1 AND lease_id = $2',
        [rentId, leaseId],
      ),
    );
    const rent = rents[0];
    if (!rent) {
      throw notFound();
    }
    if (rent.paid_at) {
      throw validation('Cette echeance est deja payee.');
    }
    await this.dataSource.transaction(async (tx) => {
      await tx.query('UPDATE lease_rents SET paid_at = now() WHERE id = $1', [
        rentId,
      ]);
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'RENT_PAID',
          resourceType: 'lease',
          resourceId: leaseId,
          result: 'SUCCESS',
          details: { rentId, amount: Number(rent.amount) },
        },
        tx,
      );
    });
    const updated = rowsOf<RentRow>(
      await this.dataSource.query('SELECT * FROM lease_rents WHERE id = $1', [
        rentId,
      ]),
    );
    return toRentView(updated[0]);
  }

  private async findAccessible(
    actor: CurrentActorValue,
    leaseId: string,
  ): Promise<LeaseRow> {
    const rows = rowsOf<LeaseRow>(
      await this.dataSource.query('SELECT * FROM leases WHERE id = $1', [
        leaseId,
      ]),
    );
    const row = rows[0];
    if (!row) {
      throw notFound();
    }
    const allowed =
      actor.role === 'ADMIN' ||
      row.agent_id === actor.id ||
      row.tenant_account_id === actor.id;
    if (!allowed) {
      throw notFound();
    }
    return row;
  }
}
