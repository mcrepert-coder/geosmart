import { Module } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { LeasingController } from './leasing.controller';
import { LeasesService } from './leases.service';
import {
  MOBILE_MONEY_PROVIDER,
  PROPERTY_LOOKUP,
  SimulatedPropertyLookup,
  UnavailableMobileMoneyProvider,
} from './property-lookup';
import { VisitsService } from './visits.service';
import { LogSmsSender, SMS_SENDER } from '../auth/sms.sender';

// Monte par le module comptes (Beni) : app.module.ts appartient a Marrich.
// SmsSender est fourni localement pour eviter une dependance circulaire
// avec AuthModule ; c'est la meme implementation sans etat.
@Module({
  controllers: [LeasingController],
  providers: [
    VisitsService,
    LeasesService,
    InspectionsService,
    { provide: PROPERTY_LOOKUP, useClass: SimulatedPropertyLookup },
    {
      provide: MOBILE_MONEY_PROVIDER,
      useClass: UnavailableMobileMoneyProvider,
    },
    { provide: SMS_SENDER, useClass: LogSmsSender },
  ],
  exports: [VisitsService, LeasesService, InspectionsService],
})
export class LeasingModule {}
