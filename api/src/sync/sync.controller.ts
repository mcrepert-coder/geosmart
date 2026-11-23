import { HttpCode, Body, Controller, Post } from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../audit/current-actor.decorator';
import { SyncService, type SyncItemInput } from './sync.service';

// Route POST /sync de contracts/sync.yaml. Un element par requete, accuse
// de reception par element.
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  @HttpCode(200)
  syncItem(
    @CurrentActor() actor: CurrentActorValue,
    @Body() body: SyncItemInput,
  ) {
    return this.sync.processItem(actor, body);
  }
}
