import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../audit/current-actor.decorator';
import {
  DocumentsService,
  maxDocumentBytes,
  type UploadedFile as DocumentFile,
} from './documents.service';

// Routes /accounts/me/documents de contracts/auth.yaml (EF-403).
// La limite multer est large ; la limite metier de 5 Mo est verifiee par le
// service pour repondre 413 au format du contrat.
@Controller('accounts/me/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentActor() actor: CurrentActorValue) {
    return this.documents.listFor(actor.id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * maxDocumentBytes() } }),
  )
  upload(
    @CurrentActor() actor: CurrentActorValue,
    @Body('category') category: string,
    @UploadedFile() file?: DocumentFile,
  ) {
    return this.documents.upload(actor, category, file);
  }

  @Get(':documentId/content')
  async content(
    @CurrentActor() actor: CurrentActorValue,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const document = await this.documents.getFor(actor, documentId);
    res.setHeader('Content-Type', document.metadata.contentType);
    res.setHeader('Content-Length', String(document.metadata.sizeBytes));
    res.send(document.content);
  }
}
