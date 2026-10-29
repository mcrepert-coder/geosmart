import {
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';

// Utilisateur connecte, tel que le module comptes (Beni) le placera dans
// request.user apres verification du jeton JWT. Le role est relu en base par
// ce module a chaque requete (RG-06) ; ici on ne fait que le transmettre.
export interface CurrentActorValue {
  id: string;
  role: string;
  registeredSurveyor: boolean;
  accountActive: boolean;
  // Facultatifs : imprimes sur l'attestation de leve quand ils sont fournis.
  fullName?: string;
  ordreNumber?: string;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

export function actorFromRequest(request: {
  user?: unknown;
}): CurrentActorValue {
  const user = request.user as Partial<CurrentActorValue> | undefined;
  if (typeof user?.id !== 'string' || typeof user.role !== 'string') {
    throw new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: 'Connexion requise.',
    });
  }
  return {
    id: user.id,
    role: user.role,
    registeredSurveyor: user.registeredSurveyor === true,
    accountActive: user.accountActive === true,
    fullName: optionalText(user.fullName),
    ordreNumber: optionalText(user.ordreNumber),
  };
}

// Sans utilisateur connecte, la route repond 401 avant tout traitement.
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    actorFromRequest(context.switchToHttp().getRequest<{ user?: unknown }>()),
);
