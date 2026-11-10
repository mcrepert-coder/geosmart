import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../audit/current-actor.decorator';
import { AccountsService } from './accounts.service';

// Routes de contracts/auth.yaml. La validation et les erreurs sont portees
// par le service ; le controleur ne fait que lire la requete.
@Controller('auth')
export class AuthController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('registrations')
  register(@Body() body: { phone: string; password: string }) {
    return this.accounts.register(body);
  }

  @Post('phone-verifications')
  @HttpCode(200)
  verifyPhone(@Body() body: { phone: string; code: string }) {
    return this.accounts.verifyPhone(body);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { phone: string; password: string }) {
    return this.accounts.login(body);
  }

  @Post('tokens/refresh')
  @HttpCode(200)
  refresh(@Body() body: { refreshToken: string }) {
    return this.accounts.refresh(body?.refreshToken);
  }

  @Get('me')
  me(@CurrentActor() actor: CurrentActorValue) {
    return actor;
  }
}
