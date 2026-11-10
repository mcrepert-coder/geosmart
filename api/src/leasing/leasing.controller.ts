import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../audit/current-actor.decorator';
import {
  InspectionsService,
  type InspectionInput,
} from './inspections.service';
import { LeasesService } from './leases.service';
import { VisitsService } from './visits.service';

// Routes de contracts/leasing.yaml : visites (EF-305), baux et loyers
// (EF-307), etats des lieux (EF-306).
@Controller()
export class LeasingController {
  constructor(
    private readonly visits: VisitsService,
    private readonly leases: LeasesService,
    private readonly inspections: InspectionsService,
  ) {}

  @Post('visits')
  requestVisit(
    @CurrentActor() actor: CurrentActorValue,
    @Body()
    body: { propertyId: string; scheduledAt?: string; reminderAt?: string },
  ) {
    return this.visits.request(actor, body);
  }

  @Get('visits')
  listVisits(@CurrentActor() actor: CurrentActorValue) {
    return this.visits.listMine(actor);
  }

  @Get('visits/:visitId')
  getVisit(
    @CurrentActor() actor: CurrentActorValue,
    @Param('visitId') visitId: string,
  ) {
    return this.visits.getOne(actor, visitId);
  }

  @Put('visits/:visitId/status')
  updateVisitStatus(
    @CurrentActor() actor: CurrentActorValue,
    @Param('visitId') visitId: string,
    @Body()
    body: { status: string; scheduledAt?: string; reminderAt?: string },
  ) {
    return this.visits.updateStatus(actor, visitId, body);
  }

  @Post('leases')
  createLease(
    @CurrentActor() actor: CurrentActorValue,
    @Body()
    body: {
      propertyId: string;
      tenantAccountId?: string;
      tenantName?: string;
      monthlyRent: number;
      startDate: string;
      months: number;
    },
  ) {
    return this.leases.create(actor, body);
  }

  @Get('leases/:leaseId')
  getLease(
    @CurrentActor() actor: CurrentActorValue,
    @Param('leaseId') leaseId: string,
  ) {
    return this.leases.getOne(actor, leaseId);
  }

  @Post('leases/:leaseId/rents/:rentId/pay')
  markRentPaid(
    @CurrentActor() actor: CurrentActorValue,
    @Param('leaseId') leaseId: string,
    @Param('rentId') rentId: string,
  ) {
    return this.leases.markRentPaid(actor, leaseId, rentId);
  }

  @Post('leases/:leaseId/inspections')
  createInspection(
    @CurrentActor() actor: CurrentActorValue,
    @Param('leaseId') leaseId: string,
    @Body() body: InspectionInput,
  ) {
    return this.inspections.create(actor, leaseId, body);
  }

  @Get('leases/:leaseId/inspections')
  listInspections(
    @CurrentActor() actor: CurrentActorValue,
    @Param('leaseId') leaseId: string,
  ) {
    return this.inspections.listForLease(actor, leaseId);
  }
}
