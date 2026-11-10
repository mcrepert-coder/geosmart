import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { AdminService } from './admin.service';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import { AuditService } from '../audit/audit.service';
import type { CurrentActorValue } from '../audit/current-actor.decorator';
import type { SqlRunner } from '../audit/sql-runner';
import { toCurrentUser } from '../auth/accounts.service';
import { AuthAccounts1793104000000 } from '../auth/migrations/1793104000000-auth-accounts';
import { DocumentsService } from '../users/documents.service';
import { UserDocuments1793106000000 } from '../users/migrations/1793106000000-user-documents';

jest.setTimeout(60000);

const admin: CurrentActorValue = {
  id: randomUUID(),
  role: 'ADMIN',
  registeredSurveyor: false,
  accountActive: true,
};
const client: CurrentActorValue = {
  id: randomUUID(),
  role: 'CLIENT',
  registeredSurveyor: false,
  accountActive: true,
};

describe('AdminService (PostgreSQL)', () => {
  let db: PGlite;
  let service: AdminService;
  let pendingId: string;

  async function seed(status: string, role: string | null): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO accounts (id, phone, password_hash, status, role)
       VALUES ($1, $2, 'x', $3, $4)`,
      [id, `+22891${id.slice(0, 8)}`, status, role],
    );
    return id;
  }

  async function lastAudit() {
    const { rows } = await db.query<{
      action: string;
      result: string;
      details: Record<string, unknown>;
    }>('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    return rows[0];
  }

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    db = new PGlite();
    const runner: SqlRunner = {
      query: (sql, params) => db.query(sql, params),
    };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new AuthAccounts1793104000000().up(qr);
    await new UserDocuments1793106000000().up(qr);
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    service = new AdminService(
      dataSource,
      new AuditService(dataSource),
      new DocumentsService(dataSource),
    );
    await seed('ACTIF', 'ADMIN');
    pendingId = await seed('EN_ATTENTE', null);
  });

  afterAll(async () => {
    await db.close();
  });

  it.each([
    ['un client', client],
    ['un admin suspendu', { ...admin, accountActive: false }],
  ])('refuse 403 %s sur la file des comptes', async (_label, actor) => {
    await expect(service.listAccounts(actor)).rejects.toMatchObject({
      status: 403,
      response: { code: 'FORBIDDEN' },
    });
  });

  it('liste la file des comptes et filtre par statut', async () => {
    const all = await service.listAccounts(admin);
    expect(all.length).toBeGreaterThanOrEqual(2);
    const pending = await service.listAccounts(admin, 'EN_ATTENTE');
    expect(pending.every((a) => a.status === 'EN_ATTENTE')).toBe(true);
    expect(pending.some((a) => a.id === pendingId)).toBe(true);
  });

  it('refuse de valider un compte sans role (RG-06)', async () => {
    await expect(service.validate(admin, pendingId)).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('attribue le role puis valide le compte', async () => {
    const withRole = await service.assignRole(admin, pendingId, {
      role: 'AGENT',
      fullName: 'Ada Lovelace',
    });
    expect(withRole.role).toBe('AGENT');
    const validated = await service.validate(admin, pendingId);
    expect(validated.status).toBe('ACTIF');
    const audit = await lastAudit();
    expect(audit.action).toBe('ACCOUNT_VALIDATED');
    expect(audit.result).toBe('SUCCESS');
  });

  it('un geometre avec numero d Ordre devient registeredSurveyor', async () => {
    const id = await seed('EN_ATTENTE', null);
    await service.assignRole(admin, id, {
      role: 'GEOMETRE',
      ordreNumber: 'OT-456',
    });
    const { rows } = await db.query('SELECT * FROM accounts WHERE id = $1', [
      id,
    ]);
    const user = toCurrentUser(rows[0] as Parameters<typeof toCurrentUser>[0]);
    expect(user.registeredSurveyor).toBe(true);
  });

  it('rejette avec un motif obligatoire', async () => {
    const id = await seed('EN_ATTENTE', 'CLIENT');
    await expect(service.reject(admin, id, '  ')).rejects.toMatchObject({
      status: 400,
    });
    const rejected = await service.reject(admin, id, 'Pieces illisibles.');
    expect(rejected.status).toBe('REJETE');
    expect(rejected.rejectionReason).toBe('Pieces illisibles.');
    const audit = await lastAudit();
    expect(audit.action).toBe('ACCOUNT_REJECTED');
  });

  it('suspend un compte actif, qui ne peut plus ecrire', async () => {
    const id = await seed('ACTIF', 'AGENT');
    const suspended = await service.suspend(admin, id);
    expect(suspended.status).toBe('SUSPENDU');
    const { rows } = await db.query('SELECT * FROM accounts WHERE id = $1', [
      id,
    ]);
    const user = toCurrentUser(rows[0] as Parameters<typeof toCurrentUser>[0]);
    expect(user.accountActive).toBe(false);
    const audit = await lastAudit();
    expect(audit.action).toBe('ACCOUNT_SUSPENDED');
  });

  it('refuse les transitions impossibles et les comptes inconnus', async () => {
    const actif = await seed('ACTIF', 'CLIENT');
    const enAttente = await seed('EN_ATTENTE', null);
    await expect(service.validate(admin, actif)).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.suspend(admin, enAttente)).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.getAccount(admin, randomUUID())).rejects.toMatchObject(
      { status: 404, response: { code: 'NOT_FOUND' } },
    );
    await expect(
      service.assignRole(admin, actif, { role: 'SUPER_HEROS' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('expose les pieces justificatives dans le detail du compte', async () => {
    const detail = await service.getAccount(admin, pendingId);
    expect(Array.isArray(detail.documents)).toBe(true);
  });
});
