import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

// Necessite TypeOrmModule.forRoot(...) dans AppModule (socle base de
// donnees, Marrich) pour fournir le DataSource.
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
