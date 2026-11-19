import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { LandModule } from './land/land.module';
import { ListingsModule } from './listings/listings.module';
import { RateLimitGuard, rateLimitOptions } from './security/rate-limit';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    ThrottlerModule.forRoot(rateLimitOptions()),
    TypeOrmModule.forRootAsync({
      useFactory: (): TypeOrmModuleOptions => {
        const url = process.env.DATABASE_URL;
        if (!url) {
          throw new Error('DATABASE_URL must be set to start the API.');
        }

        const caPath = process.env.AIVEN_CA_CERT_PATH;
        const ssl = caPath
          ? { ca: readFileSync(caPath), rejectUnauthorized: true }
          : undefined;

        return {
          type: 'postgres',
          url,
          ssl,
          migrations: [__dirname + '/**/migrations/*{.js,.ts}'],
          migrationsRun: true,
          synchronize: false,
        };
      },
    }),
    AuthModule,
    AuditModule,
    LandModule,
    ListingsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
