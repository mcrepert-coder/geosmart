import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../audit/current-actor.decorator';
import { Roles } from '../auth/roles';
import { DocumentsService } from '../users/documents.service';
import { AdminService } from './admin.service';

// Routes /admin/accounts de contracts/auth.yaml (EF-404).
@Controller('admin/accounts')
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  list(
    @CurrentActor() actor: CurrentActorValue,
    @Query('status') status?: string,
  ) {
    return this.admin.listAccounts(actor, status);
  }

  @Get(':accountId')
  getOne(
    @CurrentActor() actor: CurrentActorValue,
    @Param('accountId') accountId: string,
  ) {
    return this.admin.getAccount(actor, accountId);
  }

  @Get(':accountId/documents')
  listDocuments(
    @CurrentActor() actor: CurrentActorValue,
    @Param('accountId') accountId: string,
  ) {
    // Le service admin a deja verifie le role ; la liste ne fuit pas.
    return this.admin
      .getAccount(actor, accountId)
      .then(() => this.documents.listFor(accountId));
  }

  @Get(':accountId/documents/:documentId/content')
  async documentContent(
    @CurrentActor() actor: CurrentActorValue,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const document = await this.documents.getFor(actor, documentId);
    res.setHeader('Content-Type', document.metadata.contentType);
    res.setHeader('Content-Length', String(document.metadata.sizeBytes));
    res.send(document.content);
  }

  @Post(':accountId/validate')
  @HttpCode(200)
  validate(
    @CurrentActor() actor: CurrentActorValue,
    @Param('accountId') accountId: string,
  ) {
    return this.admin.validate(actor, accountId);
  }

  @Post(':accountId/reject')
  @HttpCode(200)
  reject(
    @CurrentActor() actor: CurrentActorValue,
    @Param('accountId') accountId: string,
    @Body() body: { reason: string },
  ) {
    return this.admin.reject(actor, accountId, body?.reason);
  }

  @Post(':accountId/suspend')
  @HttpCode(200)
  suspend(
    @CurrentActor() actor: CurrentActorValue,
    @Param('accountId') accountId: string,
  ) {
    return this.admin.suspend(actor, accountId);
  }

  @Put(':accountId/role')
  assignRole(
    @CurrentActor() actor: CurrentActorValue,
    @Param('accountId') accountId: string,
    @Body() body: { role: string; fullName?: string; ordreNumber?: string },
  ) {
    return this.admin.assignRole(actor, accountId, body);
  }
}
