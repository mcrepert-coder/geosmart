import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { actorFromRequest } from '../audit/current-actor.decorator';

// Un seul role par compte (RG-06).
export const ROLES = [
  'ADMIN',
  'GEOMETRE',
  'TOPOGRAPHE',
  'AGENT',
  'CLIENT',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLES_KEY = 'roles';

// @Roles('ADMIN') sur une route : les autres roles recoivent 403.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) {
      return true;
    }
    const actor = actorFromRequest(
      context.switchToHttp().getRequest<{ user?: unknown }>(),
    );
    if (!roles.includes(actor.role as Role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Role non autorise pour cette action.',
      });
    }
    return true;
  }
}
