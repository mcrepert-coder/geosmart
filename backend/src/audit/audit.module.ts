import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Necessite TypeOrmModule.forRoot(...) dans AppModule avec AuditEntryEntity
// parmi les entites (socle base de donnees, Marrich).
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
