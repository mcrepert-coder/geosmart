import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { DataSource } from 'typeorm';
import { type AuditResult } from '../audit/audit-chain';
import { AuditService } from '../audit/audit.service';
import { rowsOf, type SqlRunner } from '../audit/sql-runner';
import { type Role } from './roles';
import { SMS_SENDER, type SmsSender } from './sms.sender';

export const ACCOUNT_STATUSES = [
  'TELEPHONE_NON_VERIFIE',
  'EN_ATTENTE',
  'ACTIF',
  'REJETE',
  'SUSPENDU',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface AccountRow {
  id: string;
  phone: string;
  password_hash: string;
  status: AccountStatus;
  role: Role | null;
  rejection_reason: string | null;
  full_name: string | null;
  ordre_number: string | null;
  failed_login_attempts: number;
  locked_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

// Forme publique du compte (schemas Account de contracts/auth.yaml).
export interface AccountView {
  id: string;
  phone: string;
  status: AccountStatus;
  role: Role | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// Forme de request.user attendue par les autres modules (RG-06).
export interface CurrentUser {
  id: string;
  role: string;
  registeredSurveyor: boolean;
  accountActive: boolean;
  // EF-302 : agent valide par l'administration avec une piece
  // professionnelle (carte professionnelle, agrement ou RCCM, EF-403).
  agentCertified: boolean;
  fullName?: string;
  ordreNumber?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export const BCRYPT_ROUNDS = 10;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_PASSWORD_ATTEMPTS = 5;

// Le telephone est la cle de connexion : on retire la ponctuation pour que
// "+228 90 00 00 00" et "+22890000000" soient le meme compte.
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s().-]/g, '');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function toAccountView(row: AccountRow): AccountView {
  return {
    id: row.id,
    phone: row.phone,
    status: row.status,
    role: row.role,
    rejectionReason: row.rejection_reason,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// Pieces professionnelles d'un agent (EF-403).
export const PROFESSIONAL_DOCUMENTS = ['PROFESSIONAL_CARD', 'APPROVAL', 'RCCM'];

// Vrai si le compte a depose au moins une piece professionnelle.
export async function hasProfessionalDocument(
  runner: SqlRunner,
  accountId: string,
): Promise<boolean> {
  const rows = rowsOf<{ ok: number }>(
    await runner.query(
      'SELECT 1 AS ok FROM account_documents WHERE account_id = $1 AND category = ANY($2) LIMIT 1',
      [accountId, PROFESSIONAL_DOCUMENTS],
    ),
  );
  return rows.length > 0;
}

// Le jeton ne fait pas autorite : le role et l'etat viennent de la base.
// [professionalDocument] : resultat de hasProfessionalDocument pour un agent.
export function toCurrentUser(
  row: AccountRow,
  professionalDocument = false,
): CurrentUser {
  return {
    id: row.id,
    role: row.role ?? '',
    registeredSurveyor: row.role === 'GEOMETRE' && row.ordre_number !== null,
    accountActive: row.status === 'ACTIF',
    agentCertified:
      row.role === 'AGENT' && row.status === 'ACTIF' && professionalDocument,
    fullName: row.full_name ?? undefined,
    ordreNumber: row.ordre_number ?? undefined,
  };
}

function validation(message: string, details?: Record<string, unknown>) {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message,
    details,
  });
}

// Etats autorises a ouvrir une session : actif, ou en attente de validation.
export function canSignIn(status: AccountStatus): boolean {
  return status === 'ACTIF' || status === 'EN_ATTENTE';
}

function unauthorized() {
  return new UnauthorizedException({
    code: 'UNAUTHORIZED',
    message: 'Authentification requise ou identifiants invalides.',
  });
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly audit: AuditService,
  ) {}

  // RG-10 : inscriptions, verifications et connexions sont journalisees.
  // Le numero de telephone n'est jamais ecrit dans le journal.
  private async logAccount(
    action: string,
    result: AuditResult,
    account: Pick<AccountRow, 'id' | 'role'> | undefined,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.log({
      actorId: account?.id ?? null,
      actorRole: account?.role ?? null,
      action,
      resourceType: 'account',
      resourceId: account?.id ?? null,
      result,
      details,
    });
  }

  private accessTtlSeconds(): number {
    const ttl = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 3600);
    return Number.isInteger(ttl) && ttl > 0 ? ttl : 3600;
  }

  private refreshTtlDays(): number {
    const ttl = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
    return Number.isInteger(ttl) && ttl > 0 ? ttl : 30;
  }

  async findById(id: string): Promise<AccountRow | undefined> {
    const rows = rowsOf<AccountRow>(
      await this.dataSource.query('SELECT * FROM accounts WHERE id = $1', [id]),
    );
    return rows[0];
  }

  async findByPhone(phone: string): Promise<AccountRow | undefined> {
    const rows = rowsOf<AccountRow>(
      await this.dataSource.query('SELECT * FROM accounts WHERE phone = $1', [
        phone,
      ]),
    );
    return rows[0];
  }

  // EF-401 : inscription par telephone, code SMS simule dans le journal.
  async register(input: {
    phone: string;
    password: string;
  }): Promise<AccountView> {
    if (
      typeof input?.phone !== 'string' ||
      typeof input?.password !== 'string'
    ) {
      throw validation('Le telephone et le mot de passe sont obligatoires.');
    }
    const phone = normalizePhone(input.phone);
    if (!/^\+?[0-9]{8,15}$/.test(phone)) {
      throw validation('Le numero de telephone est invalide.');
    }
    if (input.password.length < 8) {
      throw validation('Le mot de passe doit contenir au moins 8 caracteres.');
    }
    if (await this.findByPhone(phone)) {
      throw validation('Ce numero est deja utilise.');
    }
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    await this.dataSource.query(
      `INSERT INTO accounts (id, phone, password_hash, status)
       VALUES ($1, $2, $3, 'TELEPHONE_NON_VERIFIE')`,
      [id, phone, passwordHash],
    );
    await this.issueVerificationCode(phone);
    const row = await this.findById(id);
    await this.logAccount('ACCOUNT_REGISTER', 'SUCCESS', row);
    return toAccountView(row!);
  }

  private async issueVerificationCode(phone: string): Promise<void> {
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);
    await this.dataSource.query(
      `INSERT INTO phone_verification_codes (phone, code_hash, expires_at, attempts)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (phone) DO UPDATE
         SET code_hash = EXCLUDED.code_hash,
             expires_at = EXCLUDED.expires_at,
             attempts = 0,
             created_at = now()`,
      [phone, sha256(code), expiresAt.toISOString()],
    );
    await this.sms.send(phone, `Votre code de verification GeoSmart : ${code}`);
  }

  async verifyPhone(input: {
    phone: string;
    code: string;
  }): Promise<AccountView> {
    if (typeof input?.phone !== 'string' || typeof input?.code !== 'string') {
      throw validation('Le telephone et le code sont obligatoires.');
    }
    const phone = normalizePhone(input.phone);
    const account = await this.findByPhone(phone);
    if (!account || account.status !== 'TELEPHONE_NON_VERIFIE') {
      throw validation('Aucun compte a verifier pour ce numero.');
    }
    const codes = rowsOf<{
      code_hash: string;
      expires_at: Date | string;
      attempts: number;
    }>(
      await this.dataSource.query(
        'SELECT * FROM phone_verification_codes WHERE phone = $1',
        [phone],
      ),
    );
    const stored = codes[0];
    if (
      !stored ||
      new Date(stored.expires_at).getTime() < Date.now() ||
      stored.attempts >= MAX_CODE_ATTEMPTS
    ) {
      await this.logAccount('PHONE_VERIFY', 'REJECTED', account, {
        reason: 'Code expire ou trop de tentatives.',
      });
      throw validation(
        'Le code est expire ou trop de tentatives ont ete faites.',
      );
    }
    if (!sameHash(sha256(input.code.trim()), stored.code_hash)) {
      await this.dataSource.query(
        'UPDATE phone_verification_codes SET attempts = attempts + 1 WHERE phone = $1',
        [phone],
      );
      await this.logAccount('PHONE_VERIFY', 'REJECTED', account, {
        reason: 'Code invalide.',
      });
      throw validation('Le code est invalide.');
    }
    await this.dataSource.query(
      'DELETE FROM phone_verification_codes WHERE phone = $1',
      [phone],
    );
    await this.dataSource.query(
      `UPDATE accounts SET status = 'EN_ATTENTE', updated_at = now() WHERE id = $1`,
      [account.id],
    );
    await this.logAccount('PHONE_VERIFY', 'SUCCESS', account);
    return toAccountView((await this.findById(account.id))!);
  }

  // EF-407 : connexion, blocage 15 minutes apres 5 echecs.
  async login(input: {
    phone: string;
    password: string;
  }): Promise<TokenResponse> {
    if (
      typeof input?.phone !== 'string' ||
      typeof input?.password !== 'string'
    ) {
      throw validation('Le telephone et le mot de passe sont obligatoires.');
    }
    const phone = normalizePhone(input.phone);
    const account = await this.findByPhone(phone);
    if (!account) {
      await this.logAccount('LOGIN', 'REJECTED', undefined, {
        reason: 'Compte inconnu.',
      });
      throw unauthorized();
    }
    if (this.isLocked(account)) {
      await this.logAccount('LOGIN', 'DENIED', account, {
        reason: 'Connexion temporairement bloquee.',
      });
    }
    this.assertNotLocked(account);
    const passwordOk = await bcrypt.compare(
      input.password,
      account.password_hash,
    );
    if (!passwordOk) {
      await this.registerFailedAttempt(account);
      await this.logAccount('LOGIN', 'REJECTED', account, {
        reason: 'Mot de passe invalide.',
      });
      throw unauthorized();
    }
    await this.dataSource.query(
      'UPDATE accounts SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [account.id],
    );
    // Un compte en attente se connecte pour deposer ses pieces (EF-403) :
    // sans elles, l'administration ne peut pas le valider. Il n'a aucun droit
    // d'ecriture (accountActive = false, RG-06).
    if (!canSignIn(account.status)) {
      await this.logAccount('LOGIN', 'DENIED', account, {
        reason: 'Compte non actif.',
        status: account.status,
      });
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: this.notActiveMessage(account.status),
        details:
          account.status === 'REJETE' && account.rejection_reason
            ? { rejectionReason: account.rejection_reason }
            : undefined,
      });
    }
    await this.logAccount('LOGIN', 'SUCCESS', account);
    return this.issueTokens(account.id);
  }

  private notActiveMessage(status: AccountStatus): string {
    switch (status) {
      case 'TELEPHONE_NON_VERIFIE':
        return 'Le telephone n est pas encore verifie.';
      case 'EN_ATTENTE':
        return 'Le compte est en attente de validation par l administrateur.';
      case 'REJETE':
        return 'Le compte a ete rejete.';
      case 'SUSPENDU':
        return 'Le compte est suspendu.';
      default:
        return 'Le compte n est pas actif.';
    }
  }

  private isLocked(account: AccountRow): boolean {
    return (
      account.locked_until !== null &&
      new Date(account.locked_until).getTime() > Date.now()
    );
  }

  private assertNotLocked(account: AccountRow): void {
    if (this.isLocked(account)) {
      throw new HttpException(
        {
          code: 'LOGIN_TEMPORARILY_BLOCKED',
          message: 'Connexion temporairement bloquee.',
          details: {
            lockedUntil: new Date(account.locked_until!).toISOString(),
          },
        },
        423,
      );
    }
  }

  private async registerFailedAttempt(account: AccountRow): Promise<void> {
    const attempts = Number(account.failed_login_attempts) + 1;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      await this.dataSource.query(
        'UPDATE accounts SET failed_login_attempts = 0, locked_until = $1, updated_at = now() WHERE id = $2',
        [lockedUntil.toISOString(), account.id],
      );
      await this.logAccount('LOGIN_BLOCKED', 'DENIED', account, {
        reason: 'Cinq echecs de connexion.',
        lockedUntil: lockedUntil.toISOString(),
      });
      throw new HttpException(
        {
          code: 'LOGIN_TEMPORARILY_BLOCKED',
          message: 'Connexion temporairement bloquee.',
          details: { lockedUntil: lockedUntil.toISOString() },
        },
        423,
      );
    }
    await this.dataSource.query(
      'UPDATE accounts SET failed_login_attempts = $1, updated_at = now() WHERE id = $2',
      [attempts, account.id],
    );
  }

  private async issueTokens(
    accountId: string,
    runner: SqlRunner = this.dataSource,
  ): Promise<TokenResponse> {
    const expiresIn = this.accessTtlSeconds();
    const accessToken = await this.jwt.signAsync(
      { sub: accountId },
      { expiresIn },
    );
    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.refreshTtlDays() * 24 * 60 * 60_000,
    );
    await runner.query(
      `INSERT INTO refresh_tokens (token_hash, account_id, expires_at)
       VALUES ($1, $2, $3)`,
      [sha256(refreshToken), accountId, expiresAt.toISOString()],
    );
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn };
  }

  // Le jeton de renouvellement est a usage unique : il est marque utilise
  // puis remplace (rotation).
  async refresh(refreshToken: string): Promise<TokenResponse> {
    if (typeof refreshToken !== 'string' || refreshToken === '') {
      throw unauthorized();
    }
    const tokenHash = sha256(refreshToken);
    return this.dataSource.transaction(async (tx) => {
      const rows = rowsOf<{
        account_id: string;
        expires_at: Date | string;
        used_at: Date | string | null;
      }>(
        await tx.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [
          tokenHash,
        ]),
      );
      const stored = rows[0];
      if (
        !stored ||
        stored.used_at !== null ||
        new Date(stored.expires_at).getTime() < Date.now()
      ) {
        throw unauthorized();
      }
      await tx.query(
        'UPDATE refresh_tokens SET used_at = now() WHERE token_hash = $1',
        [tokenHash],
      );
      const accounts = rowsOf<AccountRow>(
        await tx.query('SELECT * FROM accounts WHERE id = $1', [
          stored.account_id,
        ]),
      );
      const account = accounts[0];
      if (!account || !canSignIn(account.status)) {
        throw unauthorized();
      }
      return this.issueTokens(account.id, tx);
    });
  }
}
