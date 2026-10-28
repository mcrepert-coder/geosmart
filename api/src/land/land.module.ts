import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AttestationService } from './attestation/attestation.service';
import { ParcelGeometryService } from './geometry/parcel-geometry.service';
import { AttestationController } from './http/attestation.controller';
import { ParcelController } from './http/parcel.controller';
import { SurveyRequestController } from './http/survey-request.controller';
import { ParcelStatusService } from './parcel-status.service';
import { ParcelService } from './parcel.service';
import { SurveyRequestService } from './survey-request/survey-request.service';

// Necessite TypeOrmModule.forRoot(...) dans AppModule (Marrich) et le module
// comptes (Beni) qui remplit request.user a partir du jeton JWT.
@Module({
  imports: [AuditModule],
  controllers: [
    ParcelController,
    AttestationController,
    SurveyRequestController,
  ],
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
