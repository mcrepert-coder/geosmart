import { CanActivate, ExecutionContext, Injectable, SetMetadata, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { Role, ROLES, publicUser } from './model';
export { ROLES };
export const Roles=(...roles:Role[])=>SetMetadata('beni:roles',roles);
export const Public=()=>SetMetadata('beni:public',true);
export const Onboarding=()=>SetMetadata('beni:onboarding',true);
@Injectable()
export class BeniGuard implements CanActivate {
 constructor(private auth:AuthService,private reflector:Reflector) {}
 async canActivate(ctx:ExecutionContext) {
  const targets=[ctx.getHandler(),ctx.getClass()];
  if(this.reflector.getAllAndOverride('beni:public',targets)) return true;
  const req=ctx.switchToHttp().getRequest();req.user=publicUser(await this.auth.authenticate(req.headers.authorization,!!this.reflector.getAllAndOverride('beni:onboarding',targets)));
  const roles=this.reflector.getAllAndOverride<Role[]>('beni:roles',targets);
  if(roles?.length&&!roles.includes(req.user.role)) throw new ForbiddenException('Role non autorise');
  return true;
 }
}
