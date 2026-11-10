import {
  Body,
  Controller,
  createParamDecorator,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  ExecutionContext,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { actorFromRequest } from '../audit/current-actor.decorator';
import type {
  ListingActor,
  ListingInput,
  ListingSearch,
  ListingUpdateInput,
} from './listings.types';
import { ListingsService } from './listings.service';

interface AuthenticatedRequest {
  user?: unknown;
}

export const ListingCurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ListingActor => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = actorFromRequest(request);
    const user = request.user as { agentCertified?: unknown } | undefined;
    return {
      ...actor,
      agentCertified: user?.agentCertified === true,
    };
  },
);

@Controller('properties')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  search(@Query() query: ListingSearch) {
    return this.listings.search(query);
  }

  @Post()
  create(
    @ListingCurrentActor() actor: ListingActor,
    @Body() body: ListingInput,
  ) {
    return this.listings.create(actor, body);
  }

  @Get('mine')
  mine(
    @ListingCurrentActor() actor: ListingActor,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.listings.mine(actor, { status, page, pageSize });
  }

  @Get(':propertyId/share')
  share(@Param('propertyId') propertyId: string) {
    return this.listings.share(propertyId);
  }

  @Post(':propertyId/photos')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadPhoto(
    @ListingCurrentActor() actor: ListingActor,
    @Param('propertyId') propertyId: string,
    @UploadedFile()
    file:
      | { size: number; buffer: Buffer; mimetype: string; originalname: string }
      | undefined,
  ) {
    return this.listings.uploadPhoto(actor, propertyId, file);
  }

  @Get(':propertyId/photos/:photoId/content')
  async photo(
    @Param('propertyId') propertyId: string,
    @Param('photoId') photoId: string,
    @Res() response: Response,
  ) {
    const photo = await this.listings.photoContent(propertyId, photoId);
    response.setHeader('Content-Type', photo.contentType);
    response.setHeader('Content-Length', photo.data.length);
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(photo.data);
  }

  @Delete(':propertyId/photos/:photoId')
  @HttpCode(204)
  async deletePhoto(
    @ListingCurrentActor() actor: ListingActor,
    @Param('propertyId') propertyId: string,
    @Param('photoId') photoId: string,
  ) {
    await this.listings.deletePhoto(actor, propertyId, photoId);
  }

  @Get(':propertyId')
  get(@Param('propertyId') propertyId: string) {
    return this.listings.getPublic(propertyId);
  }

  @Patch(':propertyId')
  update(
    @ListingCurrentActor() actor: ListingActor,
    @Param('propertyId') propertyId: string,
    @Body() body: ListingUpdateInput,
  ) {
    return this.listings.update(actor, propertyId, body);
  }
}
