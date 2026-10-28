import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import {
  CurrentActor,
  type CurrentActorValue,
} from './current-actor.decorator';

// RG-10 : le journal n'est lisible que par l'administrateur.
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(
    @CurrentActor() actor: CurrentActorValue,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('from') from?: string,
    @Query('limit') limit?: string,
  ) {
    await this.requireAdmin(actor, 'AUDIT_LIST');
    return this.audit.list({ resourceType, resourceId, from, limit });
  }

  @Get('verify')
  async verify(@CurrentActor() actor: CurrentActorValue) {
    await this.requireAdmin(actor, 'AUDIT_VERIFY');
    return this.audit.verify();
  }

  private async requireAdmin(actor: CurrentActorValue, operation: string) {
    if (actor.role === 'ADMIN') return;
    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'ACCESS_DENIED',
      resourceType: 'audit',
      result: 'DENIED',
      details: { operation },
    });
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Action non autorisee pour votre role.',
    });
  }
}
