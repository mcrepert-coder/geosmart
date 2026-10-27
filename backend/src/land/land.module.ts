import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ParcelGeometryService } from './geometry/parcel-geometry.service';
import { ParcelService } from './parcel.service';

// Les routes HTTP viendront avec @Roles (Beni) et le socle base de donnees.
@Module({
  imports: [AuditModule],
  providers: [ParcelGeometryService, ParcelService],
  exports: [ParcelService],
})
export class LandModule {}
