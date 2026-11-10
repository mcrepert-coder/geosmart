import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

// Monte par le module comptes (Beni) pour exposer POST /sync sans toucher
// a app.module.ts (propriete de Marrich).
@Module({
  imports: [AuditModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
