import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AttestationService } from './attestation/attestation.service';
import { ParcelGeometryService } from './geometry/parcel-geometry.service';
import { ParcelStatusService } from './parcel-status.service';
import { ParcelService } from './parcel.service';
import { SurveyRequestService } from './survey-request/survey-request.service';

// Les routes HTTP viendront avec @Roles (Beni) et le socle base de donnees.
@Module({
  imports: [AuditModule],
  providers: [
    ParcelGeometryService,
    ParcelService,
    ParcelStatusService,
    AttestationService,
    SurveyRequestService,
  ],
  exports: [
    ParcelService,
    ParcelStatusService,
    AttestationService,
    SurveyRequestService,
  ],
})
export class LandModule {}
