import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Store } from '../store';
import { User, SmsSender, publicUser, Role } from './model';
const digest = (s:string) => createHash('sha256').update(s).digest('hex');
export class AuthService {
 constructor(readonly store:Store, private secret:string, private sms:SmsSender) {
  if (secret.length < 32) throw new Error('JWT_SECRET doit contenir au moins 32 caracteres');
 }
 async register(input:{phone:string;name:string;password:string}) {
  const hash = await bcrypt.hash(input.password,12);
  const code = String(randomInt(100000,1000000));
  const result = await this.store.run(async tx => {
   if (await tx.get('phone:'+input.phone)) throw new ConflictException('Telephone deja inscrit');
   const u:User = {id:randomUUID(),phone:input.phone,name:input.name,passwordHash:hash,role:'CLIENT',certified:false,status:'pending',verified:false,failures:0,lockedUntil:0,otpFailures:0,otpHash:digest(code),otpUntil:Date.now()+600000};
   await tx.put('user',u.id,u); await tx.put('phone','phone:'+u.phone,{id:u.id});
   await tx.audit(u.id,'register',u.id); return publicUser(u);
  });
  await this.sms.send(input.phone,`GeoSmart : votre code est ${code}. Valable 10 minutes.`);
  return result;
 }
 async verify(phone:string,code:string) {
  const ok = await this.store.run(async tx => {
   const index = await tx.get('phone:'+phone); const u:User|undefined = index && await tx.get(index.id);
   if (!u || u.verified || !u.otpUntil || u.otpUntil < Date.now() || u.otpFailures>=5) return false;
   if (u.otpHash!==digest(code)) { u.otpFailures++; await tx.put('user',u.id,u); return false; }
   u.verified=true; delete u.otpHash; delete u.otpUntil;
   await tx.put('user',u.id,u); await tx.audit(u.id,'phone.verify',u.id); return true;
  });
  if (!ok) throw new BadRequestException('Code invalide ou expire');
  const userId=await this.store.run(async tx=>(await tx.get('phone:'+phone)).id);
  return {verified:true,onboardingToken:jwt.sign({},this.secret,{subject:userId,expiresIn:'1h',issuer:'geosmart-beni',audience:'geosmart'})};
 }
 async login(phone:string,password:string) {
  const result = await this.store.run(async tx => {
   const index = await tx.get('phone:'+phone); const u:User|undefined = index && await tx.get(index.id);
   if (!u || u.lockedUntil>Date.now()) return {error:'Identifiants invalides ou compte temporairement bloque'};
   if (!(await bcrypt.compare(password,u.passwordHash))) {
    u.failures++; if (u.failures>=5) {u.lockedUntil=Date.now()+900000;u.failures=0;}
    await tx.put('user',u.id,u); await tx.audit(u.id,'login.failed',u.id); return {error:'Identifiants invalides ou compte temporairement bloque'};
   }
   if (!u.verified || u.status!=='active') return {error:'Compte non actif ou telephone non verifie'};
   u.failures=0; u.lockedUntil=0; await tx.put('user',u.id,u);
   await tx.audit(u.id,'login',u.id); return this.tokens(tx,u);
  });
  if ('error' in result) throw new UnauthorizedException(result.error); return result;
 }
 private async tokens(tx:any,u:User) {
  const refreshToken=randomBytes(48).toString('base64url');
  await tx.put('refresh','refresh:'+digest(refreshToken),{userId:u.id,expires:Date.now()+30*86400000,used:false});
  return {accessToken:jwt.sign({},this.secret,{subject:u.id,expiresIn:'1h',issuer:'geosmart-beni',audience:'geosmart'}),refreshToken,user:publicUser(u)};
 }
 async refresh(token:string) {
  return this.store.run(async tx => {
   const key='refresh:'+digest(token); const record=await tx.get(key);
   if (!record || record.used || record.expires<Date.now()) throw new UnauthorizedException('Jeton expire ou deja utilise');
   const u=await tx.get<User>(record.userId);
   if (!u || u.status!=='active' || !u.verified) throw new UnauthorizedException('Compte inactif');
   record.used=true; await tx.put('refresh',key,record); return this.tokens(tx,u);
  });
 }
 async logout(token:string,userId:string) {
  await this.store.run(async tx => { const key='refresh:'+digest(token),r=await tx.get(key);if(r?.userId===userId){r.used=true;await tx.put('refresh',key,r);} });
  return {ok:true};
 }
 async authenticate(header?:string,allowPending=false):Promise<User> {
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
  let id:string;
  try {const payload=jwt.verify(header.slice(7),this.secret,{algorithms:['HS256'],issuer:'geosmart-beni',audience:'geosmart'});if(typeof payload==='string'||!payload.sub) throw Error();id=payload.sub;}
  catch { throw new UnauthorizedException('Jeton invalide'); }
  return this.store.run(async tx => {const u=await tx.get<User>(id);if(!u||!(u.status==='active'||allowPending&&u.status==='pending')||!u.verified) throw new ForbiddenException('Compte inactif');return u;});
 }
 async bootstrap(phone:string,password:string,name:string) {
  if(password.length<12 || Buffer.byteLength(password)>72) throw new Error('Mot de passe : 12 caracteres minimum, 72 octets maximum');
  const passwordHash=await bcrypt.hash(password,12);
  return this.store.run(async tx => {
   if ((await tx.list<User>('user')).some(u=>u.role==='ADMIN')) throw new ConflictException('Un administrateur existe deja');
   if(await tx.get('phone:'+phone)) throw new ConflictException('Telephone deja inscrit');
   const u:User={id:randomUUID(),phone,name,passwordHash,role:'ADMIN',certified:false,status:'active',verified:true,failures:0,lockedUntil:0,otpFailures:0};
   await tx.put('user',u.id,u);await tx.put('phone','phone:'+phone,{id:u.id});await tx.audit(u.id,'admin.bootstrap',u.id);return publicUser(u);
  });
 }
}
