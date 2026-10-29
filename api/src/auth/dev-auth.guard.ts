import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ROLES, Role } from './roles';

// Utilisateur de test, en attendant la vraie connexion par jeton (Beni).
// Actif seulement si AUTH_DEV_MODE=true et hors production.
// En-tete : Authorization: Bearer dev:<ROLE>[:<id>]
export function devUserFromHeader(
  header: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.AUTH_DEV_MODE !== 'true' || env.NODE_ENV === 'production') {
    return undefined;
  }
  const match = /^Bearer dev:([A-Z]+)(?::([\w-]+))?$/.exec(header ?? '');
  if (!match || !ROLES.includes(match[1] as Role)) {
    return undefined;
  }
  return {
    id: match[2] ?? `dev-${match[1].toLowerCase()}`,
    role: match[1],
    registeredSurveyor: match[1] === 'GEOMETRE',
    accountActive: true,
  };
}

@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    if (request.user === undefined) {
      request.user = devUserFromHeader(request.headers.authorization);
    }
    return true;
  }
}
