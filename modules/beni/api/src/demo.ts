import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { randomUUID,randomBytes } from 'node:crypto';
import { newDb } from 'pg-mem';
import { z } from 'zod';
import { Store } from './store';
import { BeniModule } from './beni.module';
import { AuthService } from './auth/auth.service';
import { ErrorFilter } from './http';
import { SyncRejection } from './sync/sync.service';
import { FeatureCollection } from './map/map.service';
// Fixture locale uniquement : ce payload n'est pas le contrat de Romuald.
const pointSchema=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),fix:z.literal('fixed'),accuracy:z.number().nonnegative(),satellites:z.number().int().positive(),recordedAt:z.iso.datetime()}).strict();
const demoSessionSchema=z.object({schemaVersion:z.literal('demo-v1'),sessionId:z.uuid(),name:z.string().min(1).max(100),status:z.literal('completed'),points:z.array(pointSchema).min(3).max(10000)}).strict();
async function main(){
 const {Pool}=newDb().adapters.createPg();const store=new Store(new Pool());await store.init();
 const secret=randomBytes(48).toString('base64url');
 const map:FeatureCollection={type:'FeatureCollection',demo:true,features:['clear','pending','disputed'].map((status,i)=>({type:'Feature',geometry:{type:'Polygon',coordinates:[[[1.20+i*.002,6.13],[1.2015+i*.002,6.13],[1.2015+i*.002,6.1315],[1.20+i*.002,6.1315],[1.20+i*.002,6.13]]]},properties:{id:'DEMO-'+(i+1),status,label:'Parcelle fictive '+(i+1)}}))};
 const app=await NestFactory.create(BeniModule.register({store,secret,map:{async list(){return map;}},survey:async(tx,user,payload)=>{
  const parsed=demoSessionSchema.safeParse(payload);
  if(!parsed.success)throw new SyncRejection('INVALID_PAYLOAD');
  const id=randomUUID();await tx.put('survey_session',id,{id,...parsed.data,ownerId:user.id,demo:true,certified:user.role==='GEOMETRE'&&user.certified});return {id};
 }}),{bodyParser:false});app.use(json({limit:'10mb'}));app.useGlobalFilters(new ErrorFilter());
 const password=randomBytes(15).toString('base64url');
 const admin=await app.get(AuthService).bootstrap('+22890000001',password,'Administrateur demo');
 await app.listen(Number(process.env.PORT??3000),'127.0.0.1');
 console.info('DEMO_URL='+await app.getUrl());
 console.info('\nDEMONSTRATION AUTONOME - donnees effacees au redemarrage.\nTelephone admin : '+admin.phone+'\nMot de passe temporaire : '+password+'\nSMS simules affiches dans ce terminal. Aucune donnee fonciere officielle.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
