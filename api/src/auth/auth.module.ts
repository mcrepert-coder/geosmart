import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DevAuthGuard } from './dev-auth.guard';
import { RolesGuard } from './roles';

// L'ordre compte : l'utilisateur est pose avant la verification du role.
@Module({
  providers: [
    { provide: APP_GUARD, useClass: DevAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
