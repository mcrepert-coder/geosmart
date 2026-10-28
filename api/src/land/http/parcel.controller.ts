import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../../audit/current-actor.decorator';
import { AttestationService } from '../attestation/attestation.service';
import {
  type LegalStatusInput,
  ParcelStatusService,
} from '../parcel-status.service';
import {
  type ParcelCreateInput,
  ParcelService,
  type ParcelUpdateInput,
} from '../parcel.service';

// Routes de contracts/land.yaml. Les roles sont verifies et journalises par
// les services ; le controleur ne fait que lire la requete.
@Controller('parcels')
export class ParcelController {
  constructor(
    private readonly parcels: ParcelService,
    private readonly status: ParcelStatusService,
    private readonly attestations: AttestationService,
  ) {}

  @Get()
  list(
    @CurrentActor() _actor: CurrentActorValue,
    @Query('bbox') bbox: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.parcels.findInBbox(bbox, status, limit);
  }

  @Post()
  create(
    @CurrentActor() actor: CurrentActorValue,
    @Body() body: ParcelCreateInput,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.parcels.create(actor, body, idempotencyKey);
  }

  @Get(':parcelId')
  findOne(
    @CurrentActor() actor: CurrentActorValue,
    @Param('parcelId') parcelId: string,
  ) {
    return this.parcels.findOne(actor, parcelId);
  }

  @Patch(':parcelId')
  update(
    @CurrentActor() actor: CurrentActorValue,
    @Param('parcelId') parcelId: string,
    @Body() body: ParcelUpdateInput,
  ) {
    return this.parcels.update(actor, parcelId, body);
  }

  @Get(':parcelId/versions')
  versions(
    @CurrentActor() actor: CurrentActorValue,
    @Param('parcelId') parcelId: string,
  ) {
    return this.parcels.listVersions(actor, parcelId);
  }

  // Public (EF-206) : pas de @CurrentActor, donc pas de connexion requise.
  @Get(':parcelId/status')
  publicStatus(@Param('parcelId') parcelId: string) {
    return this.status.getPublicStatus(parcelId);
  }

  @Put(':parcelId/status')
  setStatus(
    @CurrentActor() actor: CurrentActorValue,
    @Param('parcelId') parcelId: string,
    @Body() body: LegalStatusInput,
  ) {
    return this.status.setLegalStatus(actor, parcelId, body);
  }

  @Post(':parcelId/attestations')
  @HttpCode(201)
  issueAttestation(
    @CurrentActor() actor: CurrentActorValue,
    @Param('parcelId') parcelId: string,
  ) {
    return this.attestations.issue(actor, parcelId);
  }
}
