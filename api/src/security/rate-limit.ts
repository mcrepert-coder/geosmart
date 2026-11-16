import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';

// Limitation des requetes par adresse IP (audit du 11/11, point sur
// l'absence de throttler). La limite generale est large ; les routes
// /auth ont des limites plus strictes posees par @Throttle dans le
// controleur, car POST /auth/registrations envoie un SMS.

const MINUTE_MS = 60_000;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Limite generale par minute et par adresse IP. THROTTLE_LIMIT permet de
// l'ajuster sans changer le code (par exemple derriere un proxy).
export function rateLimitOptions(
  env: NodeJS.ProcessEnv = process.env,
): ThrottlerModuleOptions {
  return [
    {
      name: 'default',
      ttl: MINUTE_MS,
      limit: positiveInt(env.THROTTLE_LIMIT, 300),
    },
  ];
}

// Limites des routes /auth, par minute et par adresse IP.
export const AUTH_LIMITS = {
  registration: { default: { limit: 5, ttl: MINUTE_MS } },
  phoneVerification: { default: { limit: 10, ttl: MINUTE_MS } },
  login: { default: { limit: 10, ttl: MINUTE_MS } },
  refresh: { default: { limit: 30, ttl: MINUTE_MS } },
};

// Meme forme d'erreur que le reste de l'API (schema Error des contrats).
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      {
        code: 'TOO_MANY_REQUESTS',
        message: 'Trop de requetes. Reessayez dans un instant.',
        details: { retryAfterSeconds: Math.ceil(detail.timeToBlockExpire) },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
