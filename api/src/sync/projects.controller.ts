import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../audit/current-actor.decorator';
import { Roles } from '../auth/roles';
import { ProjectsService } from './projects.service';

// Routes /projects de contracts/sync.yaml (EF-109, CA-7).
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @Roles('ADMIN', 'GEOMETRE')
  create(
    @CurrentActor() actor: CurrentActorValue,
    @Body() body: { title?: unknown },
  ) {
    return this.projects.create(actor, body);
  }

  @Get()
  @Roles('ADMIN', 'GEOMETRE', 'TOPOGRAPHE')
  list(@CurrentActor() actor: CurrentActorValue) {
    return this.projects.list(actor);
  }

  // Declaree avant :projectId pour ne pas etre lue comme un identifiant.
  @Get('topographers')
  @Roles('ADMIN', 'GEOMETRE')
  topographers(@CurrentActor() actor: CurrentActorValue) {
    return this.projects.listTopographers(actor);
  }

  @Get(':projectId')
  @Roles('ADMIN', 'GEOMETRE', 'TOPOGRAPHE')
  get(
    @CurrentActor() actor: CurrentActorValue,
    @Param('projectId') projectId: string,
  ) {
    return this.projects.get(actor, projectId);
  }

  @Put(':projectId/topographers/:accountId')
  @Roles('ADMIN', 'GEOMETRE')
  assign(
    @CurrentActor() actor: CurrentActorValue,
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.projects.assign(actor, projectId, accountId);
  }

  @Delete(':projectId/topographers/:accountId')
  @Roles('ADMIN', 'GEOMETRE')
  unassign(
    @CurrentActor() actor: CurrentActorValue,
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.projects.unassign(actor, projectId, accountId);
  }

  @Post(':projectId/close')
  @HttpCode(200)
  @Roles('ADMIN', 'GEOMETRE')
  close(
    @CurrentActor() actor: CurrentActorValue,
    @Param('projectId') projectId: string,
  ) {
    return this.projects.close(actor, projectId);
  }
}
