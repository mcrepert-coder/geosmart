import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { devUserFromHeader } from './dev-auth.guard';
import { Role, RolesGuard } from './roles';

const dev = { AUTH_DEV_MODE: 'true', NODE_ENV: 'test' };

function context(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guard(roles: Role[] | undefined) {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('utilisateur de test', () => {
  it('lit le role et un identifiant', () => {
    expect(devUserFromHeader('Bearer dev:GEOMETRE:g1', dev)).toEqual({
      id: 'g1',
      role: 'GEOMETRE',
      registeredSurveyor: true,
      accountActive: true,
    });
  });

  it('refuse un role inconnu', () => {
    expect(devUserFromHeader('Bearer dev:ROI', dev)).toBeUndefined();
  });

  it('est coupe sans AUTH_DEV_MODE ou en production', () => {
    expect(devUserFromHeader('Bearer dev:ADMIN', {})).toBeUndefined();
    expect(
      devUserFromHeader('Bearer dev:ADMIN', { ...dev, NODE_ENV: 'production' }),
    ).toBeUndefined();
  });
});

describe('RolesGuard', () => {
  const admin = { id: 'a1', role: 'ADMIN' };

  it('laisse passer une route sans @Roles', () => {
    expect(guard(undefined).canActivate(context(undefined))).toBe(true);
  });

  it('laisse passer le bon role', () => {
    expect(guard(['ADMIN']).canActivate(context(admin))).toBe(true);
  });

  it('repond 403 a un autre role', () => {
    expect(() => guard(['AGENT']).canActivate(context(admin))).toThrow(
      ForbiddenException,
    );
  });

  it('repond 401 sans utilisateur', () => {
    expect(() => guard(['ADMIN']).canActivate(context(undefined))).toThrow(
      'Connexion requise.',
    );
  });
});
