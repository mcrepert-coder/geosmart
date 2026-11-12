import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

// Monte par le module comptes (Beni) pour exposer POST /sync sans toucher
// a app.module.ts (propriete de Marrich).
@Module({
  imports: [AuditModule],
  controllers: [SyncController, ProjectsController],
  providers: [SyncService, ProjectsService],
  exports: [SyncService, ProjectsService],
})
export class SyncModule {}
