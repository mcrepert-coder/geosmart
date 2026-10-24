import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AUDIT_CLOCK, AuditService } from './audit.service';
import { AUDIT_STORE } from './audit.store';
import { PgAuditStore } from './pg-audit.store';

// Global : tous les modules injectent AuditService sans l'importer.
// Le pool est cree ici en attendant un fournisseur de base commun dans le squelette.
@Global()
@Module({
  providers: [
    {
      provide: AUDIT_STORE,
      useFactory: () =>
        new PgAuditStore(new Pool({ connectionString: process.env.DATABASE_URL })),
    },
    { provide: AUDIT_CLOCK, useValue: () => new Date() },
    AuditService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
