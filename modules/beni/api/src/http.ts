import { Body, Controller, Get, Post, Patch, Param, Query, Req, Res, Catch, ArgumentsHost, ExceptionFilter, HttpException, Injectable, CanActivate, ExecutionContext, UseGuards, HttpException as HttpError } from '@nestjs/common';
import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthService } from './auth/auth.service';
import { Public, Roles, Onboarding, BeniGuard } from './auth/roles';
import { registerSchema,loginSchema,phoneSchema,roleSchema,publicUser,surveyorProfileSchema } from './auth/model';
import { AdminService } from './admin/admin.service';
import { SyncService,syncSchema } from './sync/sync.service';
import { MapService } from './map/map.service';
@Catch()
export class ErrorFilter implements ExceptionFilter {
 catch(e:unknown,host:ArgumentsHost) {
  const response=host.switchToHttp().getResponse<Response>();
  if(e instanceof ZodError){response.status(400).json({message:'Donnees invalides',issues:e.issues});return;}
  if(e instanceof HttpException){response.status(e.getStatus()).json({message:e.message});return;}
  console.error(e);response.status(500).json({message:'Erreur interne'});
 }
}
@Injectable()
export class RateGuard implements CanActivate {
 private buckets=new Map<string,{count:number;until:number}>();
 canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest(),now=Date.now();
  for(const [key,b] of this.buckets)if(b.until<now)this.buckets.delete(key);
  const key=req.ip??'unknown',b=this.buckets.get(key)??{count:0,until:now+60000};b.count++;this.buckets.set(key,b);
  if(b.count>120)throw new HttpError('Trop de requetes, reessayez dans une minute',429);return true;
 }
}
@Controller()
@UseGuards(RateGuard,BeniGuard)
export class BeniController {
 constructor(private auth:AuthService,private admin:AdminService,private syncService:SyncService,private map:MapService){}
 @Public() @Get('health') health(){return {status:'ok',module:'beni'};}
 @Public() @Post('auth/register') register(@Body() body:unknown){const p=registerSchema.parse(body);if(Buffer.byteLength(p.password)>72)throw new HttpException('Mot de passe superieur a 72 octets',400);return this.auth.register(p);}
 @Public() @Post('auth/verify') verify(@Body() body:unknown){const p=z.object({phone:phoneSchema,code:z.string().regex(/^\d{6}$/)}).strict().parse(body);return this.auth.verify(p.phone,p.code);}
 @Public() @Post('auth/login') login(@Body() body:unknown){const p=loginSchema.parse(body);return this.auth.login(p.phone,p.password);}
 @Public() @Post('auth/refresh') refresh(@Body() body:unknown){return this.auth.refresh(z.object({refreshToken:z.string().min(32).max(200)}).strict().parse(body).refreshToken);}
 @Post('auth/logout') logout(@Req() req:any,@Body() body:unknown){return this.auth.logout(z.object({refreshToken:z.string().min(32).max(200)}).strict().parse(body).refreshToken,req.user.id);}
 @Onboarding() @Get('users/me') me(@Req() req:any){return publicUser(req.user);}
 @Onboarding() @Get('users/me/documents') documents(@Req() req:any){return this.admin.documents(req.user);}
 @Onboarding() @Post('users/me/documents') upload(@Req() req:any,@Body() body:unknown){return this.admin.upload(req.user,z.object({type:z.enum(['identity','professional','rccm','approval','order']),mime:z.enum(['image/jpeg','image/png','application/pdf']),base64:z.string().max(6990508)}).strict().parse(body));}
 @Onboarding() @Get('documents/:id') async document(@Req() req:any,@Param('id') id:string,@Res() res:Response){const d=await this.admin.document(req.user,id);res.setHeader('Content-Type',d.mime);res.setHeader('Content-Disposition','attachment; filename="document"');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.send(Buffer.from(d.base64,'base64'));}
 @Roles('ADMIN') @Get('admin/users') users(){return this.admin.users();}
 @Roles('ADMIN') @Get('admin/documents') allDocuments(@Req() req:any){return this.admin.documents(req.user);}
 @Roles('ADMIN') @Patch('admin/users/:id') decide(@Req() req:any,@Param('id') id:string,@Body() body:unknown){return this.admin.decide(req.user,id,z.object({action:z.enum(['approve','reject','suspend']),role:roleSchema.optional(),certified:z.boolean().optional(),reason:z.string().trim().min(1).max(1000).optional(),...surveyorProfileSchema.shape}).strict().parse(body));}
 @Roles('ADMIN') @Get('admin/logs') logs(@Req() req:any){return this.admin.logs(req.user);}
 @Post('sync') sync(@Req() req:any,@Body() body:unknown){return this.syncService.sync(req.user,syncSchema.parse(body).items);}
 @Public() @Get('map/parcels') parcels(@Query('status') status?:string){return this.map.list(status);}
}
