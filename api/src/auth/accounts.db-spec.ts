import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import type { SqlRunner } from '../audit/sql-runner';
import {
  AccountsService,
  normalizePhone,
  toCurrentUser,
} from './accounts.service';
import { AuthAccounts1793104000000 } from './migrations/1793104000000-auth-accounts';
import type { SmsSender } from './sms.sender';

jest.setTimeout(60000);

class FakeSms implements SmsSender {
  readonly sent: { phone: string; message: string }[] = [];

  send(phone: string, message: string): Promise<void> {
    this.sent.push({ phone, message });
    return Promise.resolve();
  }

  lastCode(phone: string): string {
    const messages = this.sent.filter((s) => s.phone === phone);
    const match = /(\d{6})$/.exec(messages[messages.length - 1].message);
    return match![1];
  }
}

describe('AccountsService (PostgreSQL)', () => {
  let db: PGlite;
  let service: AccountsService;
  let jwt: JwtService;
  let sms: FakeSms;
  const phone = '+228 90 11 22 33';
  const password = 'motdepasse-solide';

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    db = new PGlite();
    const runner: SqlRunner = {
      query: (sql, params) => db.query(sql, params),
    };
    await new AuditLog1793102400000().up(runner as unknown as QueryRunner);
    await new AuthAccounts1793104000000().up(runner as unknown as QueryRunner);
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    jwt = new JwtService({ secret: 'secret-de-test' });
    sms = new FakeSms();
    service = new AccountsService(
      dataSource,
      jwt,
      sms,
      new AuditService(dataSource),
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('cree un compte a verifier et envoie le code SMS (EF-401)', async () => {
    const account = await service.register({ phone, password });
    expect(account.status).toBe('TELEPHONE_NON_VERIFIE');
    expect(account.role).toBeNull();
    expect(account.phone).toBe(normalizePhone(phone));
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0].message).toMatch(/code de verification/);
  });

  it('refuse un numero deja utilise', async () => {
    await expect(service.register({ phone, password })).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('refuse un mot de passe court et un telephone invalide', async () => {
    await expect(
      service.register({ phone: '+228909999', password: 'court' }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(
      service.register({ phone: 'allo', password }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('verifie le telephone et passe le compte en attente', async () => {
    const code = sms.lastCode(normalizePhone(phone));
    const account = await service.verifyPhone({ phone, code });
    expect(account.status).toBe('EN_ATTENTE');
  });

  it('refuse un mauvais code SMS', async () => {
    await expect(
      service.verifyPhone({ phone, code: '000000' }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it('refuse la connexion dun compte en attente de validation', async () => {
    await expect(service.login({ phone, password })).rejects.toMatchObject({
      response: { code: 'ACCOUNT_NOT_ACTIVE' },
      status: 403,
    });
  });

  it('bloque la connexion 15 minutes apres cinq echecs (EF-407)', async () => {
    for (let i = 0; i < 4; i++) {
      await expect(
        service.login({ phone, password: 'mauvais-mot-de-passe' }),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      service.login({ phone, password: 'mauvais-mot-de-passe' }),
    ).rejects.toMatchObject({
      status: 423,
      response: { code: 'LOGIN_TEMPORARILY_BLOCKED' },
    });
    // Meme le bon mot de passe est refuse pendant le blocage.
    const blocked = (await service
      .login({ phone, password })
      .catch((error: unknown) => error)) as {
      status: number;
      response: { details: { lockedUntil: string } };
    };
    expect(blocked.status).toBe(423);
    expect(typeof blocked.response.details.lockedUntil).toBe('string');
  });

  describe('compte actif', () => {
    let accountId: string;

    beforeAll(async () => {
      await db.query(
        `UPDATE accounts
            SET status = 'ACTIF', role = 'AGENT',
                failed_login_attempts = 0, locked_until = NULL
          WHERE phone = $1`,
        [normalizePhone(phone)],
      );
      const row = await service.findByPhone(normalizePhone(phone));
      accountId = row!.id;
    });

    it('ouvre une session avec des jetons (EF-407)', async () => {
      const tokens = await service.login({ phone, password });
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(3600);
      const payload = jwt.verify<{ sub: string }>(tokens.accessToken);
      expect(payload.sub).toBe(accountId);
    });

    it('relit le role en base a chaque requete (RG-06)', async () => {
      const before = toCurrentUser((await service.findById(accountId))!);
      expect(before.role).toBe('AGENT');
      expect(before.accountActive).toBe(true);
      expect(before.registeredSurveyor).toBe(false);
      await db.query(
        `UPDATE accounts SET role = 'GEOMETRE', ordre_number = 'OT-123' WHERE id = $1`,
        [accountId],
      );
      const after = toCurrentUser((await service.findById(accountId))!);
      expect(after.role).toBe('GEOMETRE');
      expect(after.registeredSurveyor).toBe(true);
      expect(after.ordreNumber).toBe('OT-123');
    });

    it('renouvelle les jetons une seule fois par jeton de renouvellement', async () => {
      const tokens = await service.login({ phone, password });
      const renewed = await service.refresh(tokens.refreshToken);
      expect(renewed.refreshToken).not.toBe(tokens.refreshToken);
      await expect(service.refresh(tokens.refreshToken)).rejects.toMatchObject({
        status: 401,
      });
      await expect(service.refresh('inconnu')).rejects.toMatchObject({
        status: 401,
      });
    });

    it('refuse le renouvellement dun compte suspendu', async () => {
      const tokens = await service.login({ phone, password });
      await db.query(`UPDATE accounts SET status = 'SUSPENDU' WHERE id = $1`, [
        accountId,
      ]);
      await expect(service.refresh(tokens.refreshToken)).rejects.toMatchObject({
        status: 401,
      });
      await db.query(`UPDATE accounts SET status = 'ACTIF' WHERE id = $1`, [
        accountId,
      ]);
    });
  });

  it('cree un identifiant unique par compte', async () => {
    const other = await service.register({
      phone: '+228 91 22 33 44',
      password,
    });
    expect(other.id).not.toBe(randomUUID());
    expect(typeof other.id).toBe('string');
  });
  // RG-10 : place en dernier, il relit tout ce que les tests precedents ont
  // journalise.
  it('journalise inscriptions, verifications et connexions sans le telephone', async () => {
    await expect(
      service.login({ phone: '+22899999999', password: 'inconnu-123' }),
    ).rejects.toMatchObject({ status: 401 });
    // Vrai mauvais code : un compte encore a verifier.
    await service.register({ phone: '+22890445566', password });
    await expect(
      service.verifyPhone({ phone: '+22890445566', code: '000000' }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });

    const { rows } = await db.query<{
      action: string;
      result: string;
      resource_type: string;
      details: Record<string, unknown> | null;
    }>('SELECT action, result, resource_type, details FROM audit_log');
    const seen = new Set(rows.map((r) => `${r.action}:${r.result}`));
    for (const expected of [
      'ACCOUNT_REGISTER:SUCCESS',
      'PHONE_VERIFY:SUCCESS',
      'PHONE_VERIFY:REJECTED',
      'LOGIN:SUCCESS',
      'LOGIN:REJECTED',
      'LOGIN:DENIED',
      'LOGIN_BLOCKED:DENIED',
    ]) {
      expect(seen).toContain(expected);
    }
    expect(rows.every((r) => r.resource_type === 'account')).toBe(true);
    const digits = normalizePhone(phone).replace(/\D/g, '');
    expect(JSON.stringify(rows)).not.toContain(digits);
    expect(JSON.stringify(rows)).not.toContain('99999999');
    expect(JSON.stringify(rows)).not.toContain('90445566');
  });
});
