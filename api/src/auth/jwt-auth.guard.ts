import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { rowsOf } from '../audit/sql-runner';
import {
  type AccountRow,
  hasProfessionalDocument,
  toCurrentUser,
} from './accounts.service';

// Garde globale : verifie le jeton d'acces puis relit le compte en base a
// chaque requete (RG-06). Le jeton ne fournit ni role ni etat faisant
// autorite. Sans en-tete, la requete passe : les routes publiques n'ont pas
// besoin de jeton, les autres repondent 401 via @CurrentActor.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ') || header.startsWith('Bearer dev:')) {
      return true;
    }
    let payload: { sub?: unknown };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: unknown }>(
        header.slice('Bearer '.length),
      );
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentification requise ou identifiants invalides.',
      });
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentification requise ou identifiants invalides.',
      });
    }
    let rows: AccountRow[];
    try {
      rows = rowsOf<AccountRow>(
        await this.dataSource.query('SELECT * FROM accounts WHERE id = $1', [
          payload.sub,
        ]),
      );
    } catch {
      rows = [];
    }
    const account = rows[0];
    if (!account) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentification requise ou identifiants invalides.',
      });
    }
    // Badge "agent certifie" (EF-302) : seul un agent actif est verifie.
    const professionalDocument =
      account.role === 'AGENT' && account.status === 'ACTIF'
        ? await hasProfessionalDocument(this.dataSource, account.id).catch(
            () => false,
          )
        : false;
    request.user = toCurrentUser(account, professionalDocument);
    return true;
  }
}
