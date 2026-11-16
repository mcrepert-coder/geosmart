import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../auth/auth.controller';
import { AUTH_LIMITS, RateLimitGuard, rateLimitOptions } from './rate-limit';

@Controller('demo')
class DemoController {
  @Get('open')
  open() {
    return { ok: true };
  }

  @Get('strict')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  strict() {
    return { ok: true };
  }
}

describe('limitation des requetes', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot(rateLimitOptions({ THROTTLE_LIMIT: '3' })),
      ],
      controllers: [DemoController],
      providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('applique la limite generale puis repond 429 au format Error', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get('/demo/open').expect(200);
    }
    const res = await request(app.getHttpServer())
      .get('/demo/open')
      .expect(429);
    const body = res.body as {
      code: string;
      message: string;
      details: { retryAfterSeconds: number };
    };
    expect(body.code).toBe('TOO_MANY_REQUESTS');
    expect(typeof body.message).toBe('string');
    expect(body.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('applique la limite plus stricte posee par @Throttle', async () => {
    await request(app.getHttpServer()).get('/demo/strict').expect(200);
    await request(app.getHttpServer()).get('/demo/strict').expect(200);
    await request(app.getHttpServer()).get('/demo/strict').expect(429);
  });
});

describe('options de limitation', () => {
  it('prend 300 par minute par defaut et ignore une valeur invalide', () => {
    expect(rateLimitOptions({})).toEqual([
      { name: 'default', ttl: 60_000, limit: 300 },
    ]);
    expect(rateLimitOptions({ THROTTLE_LIMIT: 'abc' })).toEqual([
      { name: 'default', ttl: 60_000, limit: 300 },
    ]);
    expect(rateLimitOptions({ THROTTLE_LIMIT: '50' })).toEqual([
      { name: 'default', ttl: 60_000, limit: 50 },
    ]);
  });

  it('pose une limite stricte sur chaque route /auth qui ecrit', () => {
    const limitOf = (method: keyof AuthController) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        AuthController.prototype,
        method,
      ) as PropertyDescriptor;
      return Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        descriptor.value as object,
      ) as number;
    };
    expect(limitOf('register')).toBe(AUTH_LIMITS.registration.default.limit);
    expect(limitOf('verifyPhone')).toBe(
      AUTH_LIMITS.phoneVerification.default.limit,
    );
    expect(limitOf('login')).toBe(AUTH_LIMITS.login.default.limit);
    expect(limitOf('refresh')).toBe(AUTH_LIMITS.refresh.default.limit);
  });
});
