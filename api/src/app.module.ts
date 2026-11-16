import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { LandModule } from './land/land.module';
import { ListingsModule } from './listings/listings.module';
import { RateLimitGuard, rateLimitOptions } from './security/rate-limit';

@Module({
  imports: [
    ThrottlerModule.forRoot(rateLimitOptions()),
    TypeOrmModule.forRootAsync({
      useFactory: (): TypeOrmModuleOptions => {
        const url = process.env.DATABASE_URL;
        if (!url) {
          throw new Error('DATABASE_URL must be set to start the API.');
        }

        return {
          type: 'postgres',
          url,
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
