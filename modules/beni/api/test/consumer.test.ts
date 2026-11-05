import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller, Get, Module, UseGuards, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { newDb } from 'pg-mem';
// Un consommateur importe exclusivement le point d'entree public.
import { BeniModule, BeniGuard, Roles, Store, AuthService, ErrorFilter } from '../src';

@Controller('consumer')
class ConsumerController {
 @Get('health') health(){return {host:'ok'};}
 @UseGuards(BeniGuard) @Roles('ADMIN') @Get('admin') admin(@Req()req:any){return {allowed:true,role:req.user.role,accountActive:req.user.accountActive,hasPasswordHash:Object.hasOwn(req.user,'passwordHash')};}
}

test('Consommateur : import public, garde exportee et absence de modification des routes de l hote',async()=>{
 const {Pool}=newDb().adapters.createPg();const store=new Store(new Pool());await store.init();
 @Module({imports:[BeniModule.register({store,secret:'consumer-test-secret-32-characters-minimum'})],controllers:[ConsumerController]})
 class HostModule {}
 const app=await NestFactory.create(HostModule,{logger:false});app.useGlobalFilters(new ErrorFilter());await app.listen(0,'127.0.0.1');
 try{
  const url=await app.getUrl();
  assert.equal((await fetch(url+'/consumer/health')).status,200);
  assert.equal((await fetch(url+'/consumer/admin')).status,401);
  assert.equal((await fetch(url+'/admin/users')).status,401);
  const auth=app.get(AuthService);await auth.bootstrap('+22890000001','Strong-password-123','Admin');
  const session=await auth.login('+22890000001','Strong-password-123');
  assert.ok('accessToken' in session);
  const result=await fetch(url+'/consumer/admin',{headers:{Authorization:'Bearer '+session.accessToken}});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{allowed:true,role:'ADMIN',accountActive:true,hasPasswordHash:false});
 }finally{await app.close();await store.pool.end();}
});
