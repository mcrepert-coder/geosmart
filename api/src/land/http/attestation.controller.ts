import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../../audit/current-actor.decorator';
import { AttestationService } from '../attestation/attestation.service';

@Controller('attestations')
export class AttestationController {
  constructor(private readonly attestations: AttestationService) {}

  @Get(':number/pdf')
  async pdf(
    @CurrentActor() actor: CurrentActorValue,
    @Param('number') number: string,
  ): Promise<StreamableFile> {
    const pdf = await this.attestations.getPdf(actor, number);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${number}.pdf"`,
    });
  }

  // Public : verification d'une attestation par son empreinte.
  @Get(':number/verify')
  verify(@Param('number') number: string, @Query('hash') hash: string) {
    return this.attestations.verify(number, hash);
  }
}
