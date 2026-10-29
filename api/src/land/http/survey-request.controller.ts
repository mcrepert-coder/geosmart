import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../../audit/current-actor.decorator';
import {
  type SurveyRequestInput,
  type SurveyRequestState,
  SurveyRequestService,
} from '../survey-request/survey-request.service';

@Controller('survey-requests')
export class SurveyRequestController {
  constructor(private readonly requests: SurveyRequestService) {}

  @Get()
  list(
    @CurrentActor() actor: CurrentActorValue,
    @Query('state') state?: SurveyRequestState,
  ) {
    return this.requests.list(actor, state);
  }

  @Post()
  create(
    @CurrentActor() actor: CurrentActorValue,
    @Body() body: SurveyRequestInput,
  ) {
    return this.requests.create(actor, body);
  }

  @Post(':requestId/take')
  @HttpCode(200)
  take(
    @CurrentActor() actor: CurrentActorValue,
    @Param('requestId') requestId: string,
  ) {
    return this.requests.take(actor, requestId);
  }

  @Post(':requestId/complete')
  @HttpCode(200)
  complete(
    @CurrentActor() actor: CurrentActorValue,
    @Param('requestId') requestId: string,
    @Body() body: { parcelId?: string } = {},
  ) {
    return this.requests.complete(actor, requestId, body?.parcelId);
  }

  @Post(':requestId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentActor() actor: CurrentActorValue,
    @Param('requestId') requestId: string,
  ) {
    return this.requests.cancel(actor, requestId);
  }
}
