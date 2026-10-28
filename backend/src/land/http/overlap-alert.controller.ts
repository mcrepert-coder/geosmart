import { Controller, Get, Query } from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../../audit/current-actor.decorator';
import { OverlapAlertService } from '../overlap-alert.service';

// Ecran W3 de l'espace administrateur : alertes de chevauchement.
@Controller('overlap-alerts')
export class OverlapAlertController {
  constructor(private readonly alerts: OverlapAlertService) {}

  @Get()
  list(
    @CurrentActor() actor: CurrentActorValue,
    @Query('limit') limit?: string,
  ) {
    return this.alerts.list(actor, limit ?? 50);
  }
}
