import { DynamicModule, Module } from '@nestjs/common';
import { Store } from './store';
import { AuthService } from './auth/auth.service';
import { ConsoleSms, SmsSender } from './auth/model';
import { BeniGuard } from './auth/roles';
import { AdminService } from './admin/admin.service';
import { SyncService, SurveyAdapter } from './sync/sync.service';
import { MapService, MapGateway } from './map/map.service';
import { BeniController, RateGuard } from './http';
export type BeniOptions={store:Store;secret:string;sms?:SmsSender;map?:MapGateway;survey?:SurveyAdapter};
@Module({})
export class BeniModule {
 static register(o:BeniOptions):DynamicModule {
  const sms=o.sms??new ConsoleSms();
  return {module:BeniModule,controllers:[BeniController],providers:[
   {provide:Store,useValue:o.store},
   {provide:AuthService,useValue:new AuthService(o.store,o.secret,sms)},
   {provide:AdminService,useValue:new AdminService(o.store)},
   {provide:SyncService,useValue:new SyncService(o.store,o.survey)},
   {provide:MapService,useValue:new MapService(o.map)},
   RateGuard, BeniGuard
  ],exports:[AuthService,Store,BeniGuard,RateGuard,AdminService,SyncService,MapService]};
 }
}
