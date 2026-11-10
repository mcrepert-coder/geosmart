import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { type CurrentActorValue } from '../audit/current-actor.decorator';
import { rowsOf } from '../audit/sql-runner';
import {
  type AccountRow,
  type AccountView,
  toAccountView,
} from '../auth/accounts.service';
import { ROLES, type Role } from '../auth/roles';
import {
  DocumentsService,
  type DocumentMetadata,
} from '../users/documents.service';

// EF-404 : espace administrateur. Validation, rejet avec motif, suspension,
// attribution du role unique (RG-06). Chaque decision est journalisee.
export interface AdminAccountView extends AccountView {
  documents: DocumentMetadata[];
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

function validation(message: string) {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message,
  });
}

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
  ) {}

  private assertAdmin(actor: CurrentActorValue): void {
    if (actor.role !== 'ADMIN' || actor.accountActive !== true) {
      throw forbidden();
    }
  }

  private async findAccount(accountId: string): Promise<AccountRow> {
    const rows = rowsOf<AccountRow>(
      await this.dataSource.query('SELECT * FROM accounts WHERE id = $1', [
        accountId,
      ]),
    );
    if (!rows[0]) {
      throw notFound();
    }
    return rows[0];
  }

  async listAccounts(
    actor: CurrentActorValue,
    status?: string,
  ): Promise<AccountView[]> {
    this.assertAdmin(actor);
    const rows = rowsOf<AccountRow>(
      await this.dataSource.query(
        `SELECT * FROM accounts
          WHERE ($1::text IS NULL OR status = $1)
          ORDER BY created_at`,
        [status ?? null],
      ),
    );
    return rows.map(toAccountView);
  }

  async getAccount(
    actor: CurrentActorValue,
    accountId: string,
  ): Promise<AdminAccountView> {
    this.assertAdmin(actor);
    const row = await this.findAccount(accountId);
    return {
      ...toAccountView(row),
      documents: await this.documents.listFor(row.id),
    };
  }

  // Validation avec role unique : le role doit deja etre attribue (RG-06).
  async validate(
    actor: CurrentActorValue,
    accountId: string,
  ): Promise<AccountView> {
    this.assertAdmin(actor);
    const row = await this.findAccount(accountId);
    if (row.status !== 'EN_ATTENTE' && row.status !== 'SUSPENDU') {
      throw validation(
        'Seul un compte en attente ou suspendu peut etre valide.',
      );
    }
    if (row.role === null) {
      throw validation('Attribuez un role au compte avant de le valider.');
    }
    return this.decide(actor, row, 'ACTIF', 'ACCOUNT_VALIDATED', null);
  }

  async reject(
    actor: CurrentActorValue,
    accountId: string,
    reason: string,
  ): Promise<AccountView> {
    this.assertAdmin(actor);
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw validation('Le motif de rejet est obligatoire.');
    }
    const row = await this.findAccount(accountId);
    if (row.status !== 'EN_ATTENTE') {
      throw validation('Seul un compte en attente peut etre rejete.');
    }
    return this.decide(actor, row, 'REJETE', 'ACCOUNT_REJECTED', reason.trim());
  }

  async suspend(
    actor: CurrentActorValue,
    accountId: string,
  ): Promise<AccountView> {
    this.assertAdmin(actor);
    const row = await this.findAccount(accountId);
    if (row.status !== 'ACTIF') {
      throw validation('Seul un compte actif peut etre suspendu.');
    }
    return this.decide(actor, row, 'SUSPENDU', 'ACCOUNT_SUSPENDED', null);
  }

  async assignRole(
    actor: CurrentActorValue,
    accountId: string,
    input: { role: string; fullName?: string; ordreNumber?: string },
  ): Promise<AccountView> {
    this.assertAdmin(actor);
    if (
      typeof input?.role !== 'string' ||
      !ROLES.includes(input.role as Role)
    ) {
      throw validation(`Le role doit valoir ${ROLES.join(', ')}.`);
    }
    for (const [field, value] of [
      ['fullName', input.fullName],
      ['ordreNumber', input.ordreNumber],
    ] as const) {
      if (value !== undefined && (typeof value !== 'string' || value === '')) {
        throw validation(`${field} doit etre une chaine non vide.`);
      }
    }
    const row = await this.findAccount(accountId);
    await this.dataSource.query(
      `UPDATE accounts
          SET role = $1,
              full_name = COALESCE($2, full_name),
              ordre_number = COALESCE($3, ordre_number),
              updated_at = now()
        WHERE id = $4`,
      [
        input.role,
        input.fullName ?? null,
        input.ordreNumber ?? null,
        accountId,
      ],
    );
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ACCOUNT_ROLE_ASSIGNED',
      resourceType: 'account',
      resourceId: accountId,
      result: 'SUCCESS',
      details: { role: input.role, previousRole: row.role },
    });
    return toAccountView(await this.findAccount(accountId));
  }

  private async decide(
    actor: CurrentActorValue,
    row: AccountRow,
    status: 'ACTIF' | 'REJETE' | 'SUSPENDU',
    action: string,
    rejectionReason: string | null,
  ): Promise<AccountView> {
    await this.dataSource.query(
      `UPDATE accounts
          SET status = $1, rejection_reason = $2, updated_at = now()
        WHERE id = $3`,
      [status, rejectionReason, row.id],
    );
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action,
      resourceType: 'account',
      resourceId: row.id,
      result: 'SUCCESS',
      details: { from: row.status, to: status, reason: rejectionReason },
    });
    return toAccountView(await this.findAccount(row.id));
  }
}
