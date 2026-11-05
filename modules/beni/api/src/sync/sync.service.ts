import { createHash } from 'node:crypto';
import { Store, Tx } from '../store';
import { User } from '../auth/model';
import { z } from 'zod';
export const syncSchema=z.object({items:z.array(z.object({clientId:z.uuid(),entityType:z.literal('survey_session'),payload:z.record(z.string(),z.unknown())}).strict()).min(1).max(100)}).strict();
type Item=z.infer<typeof syncSchema>['items'][number];
export class SyncRejection extends Error {constructor(message:string,readonly retryable=false){super(message);}}
// L'adaptateur controle les assignations et les regles GNSS/metier.
// Lever SyncRejection avant toute ecriture en cas de refus metier.
// Toute autre erreur annule la transaction complete, recu compris.
export type SurveyAdapter=(tx:Tx,user:User,payload:Record<string,unknown>,entityType:Item['entityType'])=>Promise<{id:string}>;
function canonical(v:any):string{return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);}
export class SyncService {
 constructor(private store:Store,private survey?:SurveyAdapter) {}
 async sync(user:User,items:Item[]) {
  const results=[];
  for(const item of items) {
   const key='sync:'+user.id+':'+item.clientId;
   const hash=createHash('sha256').update(canonical({entityType:item.entityType,payload:item.payload})).digest('hex');
   const result=await this.store.run(async tx=>{
    const previous=await tx.get(key);
    if(previous){if(previous.hash!==hash)return {clientId:item.clientId,status:'rejected',reason:'CLIENT_ID_REUSED',retryable:false};return previous.result;}
    const reject=async(reason:string,retryable:boolean)=>{
     const result={clientId:item.clientId,status:'rejected',reason,retryable};
     if(!retryable){await tx.put('receipt',key,{hash,result});await tx.audit(user.id,'sync.rejected',item.clientId);}
     return result;
    };
    if(!['GEOMETRE','TOPOGRAPHE'].includes(user.role))return reject('ROLE_FORBIDDEN',false);
    if(!this.survey)return reject('SURVEY_ADAPTER_NOT_CONFIGURED',true);
    let entity:{id:string};
    try {entity=await this.survey(tx,user,item.payload,item.entityType);}
    catch(e){if(!(e instanceof SyncRejection))throw e;return reject(e.message,e.retryable);}
    const result={clientId:item.clientId,status:'accepted',entityId:entity.id,retryable:false};
    await tx.put('receipt',key,{hash,result});await tx.audit(user.id,'sync.accepted',entity.id);return result;
   });results.push(result);
  }
  return {results};
 }
}
