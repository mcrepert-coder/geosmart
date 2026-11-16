import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  CurrentActor,
  type CurrentActorValue,
} from '../audit/current-actor.decorator';
import { Throttle } from '@nestjs/throttler';
import { AUTH_LIMITS } from '../security/rate-limit';
import { AccountsService } from './accounts.service';

// Routes de contracts/auth.yaml. La validation et les erreurs sont portees
// par le service ; le controleur ne fait que lire la requete.
@Controller('auth')
export class AuthController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('registrations')
  @Throttle(AUTH_LIMITS.registration)
  register(@Body() body: { phone: string; password: string }) {
    return this.accounts.register(body);
  }

  @Post('phone-verifications')
  @Throttle(AUTH_LIMITS.phoneVerification)
  @HttpCode(200)
  verifyPhone(@Body() body: { phone: string; code: string }) {
    return this.accounts.verifyPhone(body);
  }

  @Post('login')
  @Throttle(AUTH_LIMITS.login)
  @HttpCode(200)
  login(@Body() body: { phone: string; password: string }) {
    return this.accounts.login(body);
  }

  @Post('tokens/refresh')
  @Throttle(AUTH_LIMITS.refresh)
  @HttpCode(200)
  refresh(@Body() body: { refreshToken: string }) {
    return this.accounts.refresh(body?.refreshToken);
  }

  @Get('me')
  me(@CurrentActor() actor: CurrentActorValue) {
    return actor;
  }
}
