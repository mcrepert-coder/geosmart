import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AdminModule } from '../admin/admin.module';
import { AuditModule } from '../audit/audit.module';
import { LeasingModule } from '../leasing/leasing.module';
import { SyncModule } from '../sync/sync.module';
import { UsersModule } from '../users/users.module';
import { AccountsService } from './accounts.service';
import { AuthController } from './auth.controller';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles';
import { LogSmsSender, SMS_SENDER } from './sms.sender';

// L'ordre compte : le jeton est verifie et le compte relu en base (RG-06),
// puis l'utilisateur de test de developpement, puis la verification du role.
// Les autres modules de Beni (sync, puis admin et leasing) sont montes ici :
// app.module.ts appartient a Marrich.
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
      }),
    }),
    AuditModule,
    SyncModule,
    UsersModule,
    AdminModule,
    LeasingModule,
  ],
  controllers: [AuthController],
  providers: [
    AccountsService,
    { provide: SMS_SENDER, useClass: LogSmsSender },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: DevAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AccountsService],
})
export class AuthModule {}
