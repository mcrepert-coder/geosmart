import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Store } from '../store';
import { Role, User, publicUser } from '../auth/model';
export class AdminService {
 constructor(private store:Store) {}
 async users() {return this.store.run(async tx=>(await tx.list<User>('user')).map(publicUser));}
 async decide(actor:User,id:string,input:{action:'approve'|'reject'|'suspend';role?:Role;certified?:boolean;reason?:string;fullName?:string;ordreNumber?:string}) {
  if(actor.role!=='ADMIN') throw new ForbiddenException();
  return this.store.run(async tx=>{
   const u=await tx.get<User>(id);if(!u)throw new NotFoundException();
   if(u.id===actor.id)throw new BadRequestException('Modification de son propre compte interdite');
   if(input.action==='approve') {
    if(!u.verified)throw new BadRequestException('Telephone non verifie');
    if(!input.role)throw new BadRequestException('Role unique requis');
    const docs=(await tx.list<any>('document')).filter(d=>d.ownerId===id);
    if(!docs.some(d=>d.type==='identity'))throw new BadRequestException('Piece identite requise');
    if(input.role==='AGENT_IMMOBILIER'&&!docs.some(d=>['professional','rccm','approval'].includes(d.type)))throw new BadRequestException('Justificatif professionnel requis');
    if(input.certified&&input.role==='GEOMETRE'&&!docs.some(d=>d.type==='order'))throw new BadRequestException('Inscription a l Ordre requise');
    if(input.certified&&input.role==='GEOMETRE'&&!(input.ordreNumber??u.ordreNumber))throw new BadRequestException('Numero inscription Ordre requis pour certifier le geometre');
    if(input.ordreNumber&&input.role!=='GEOMETRE')throw new BadRequestException('Numero Ordre reserve au geometre');
    if(input.certified&&!['GEOMETRE','AGENT_IMMOBILIER'].includes(input.role))throw new BadRequestException('Certification incompatible');
    if(input.fullName){u.fullName=input.fullName;u.name=input.fullName;}
    if(input.ordreNumber)u.ordreNumber=input.ordreNumber;
    u.role=input.role;u.certified=input.certified??false;u.status='active';delete u.reason;
   } else {if(!input.reason?.trim())throw new BadRequestException('Motif requis');u.status=input.action==='reject'?'rejected':'suspended';u.reason=input.reason;}
   await tx.put('user',id,u);await tx.audit(actor.id,'admin.'+input.action,id);return publicUser(u);
  });
 }
 async upload(user:User,input:{type:string;mime:string;base64:string}) {
  const bytes=Buffer.from(input.base64,'base64');
  if(!bytes.length||bytes.length>5*1024*1024||bytes.toString('base64')!==input.base64)throw new BadRequestException('Fichier invalide ou superieur a 5 Mo');
  const valid=input.mime==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):input.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):input.mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':false;
  if(!valid)throw new BadRequestException('Signature du fichier incompatible');
  return this.store.run(async tx=>{const d={id:randomUUID(),ownerId:user.id,...input,createdAt:new Date().toISOString()};await tx.put('document',d.id,d);await tx.audit(user.id,'document.upload',d.id);return {id:d.id,type:d.type,mime:d.mime};});
 }
 async documents(user:User) {return this.store.run(async tx=>(await tx.list<any>('document')).filter(d=>user.role==='ADMIN'||d.ownerId===user.id).map(({base64,...d})=>d));}
 async document(user:User,id:string) {return this.store.run(async tx=>{const d=await tx.get(id);if(!d)throw new NotFoundException();if(user.role!=='ADMIN'&&d.ownerId!==user.id)throw new ForbiddenException();await tx.audit(user.id,'document.read',id);return d;});}
 async logs(user:User) {if(user.role!=='ADMIN')throw new ForbiddenException();return this.store.run(tx=>tx.list('audit'));}
}
