import { z } from 'zod';
export const ROLES = ['ADMIN','GEOMETRE','TOPOGRAPHE','AGENT_IMMOBILIER','CLIENT'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;
export type User = {id:string; phone:string; name:string; fullName?:string; ordreNumber?:string; passwordHash:string; role:Role; certified:boolean; status:'pending'|'active'|'rejected'|'suspended'; verified:boolean; failures:number; lockedUntil:number; otpHash?:string; otpUntil?:number; otpFailures:number; reason?:string};
export const surveyorProfileSchema = z.object({fullName:z.string().trim().min(1).max(120).optional(),ordreNumber:z.string().trim().min(1).max(40).optional()});
export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Numero international requis, exemple +22890000000');
export const registerSchema = z.object({phone:phoneSchema,name:z.string().trim().min(2).max(120),password:z.string().min(12).max(72)}).strict();
export const loginSchema = z.object({phone:phoneSchema,password:z.string().max(72)}).strict();
export function publicUser(u:User) { return {id:u.id,phone:u.phone,name:u.name,fullName:u.fullName??u.name,...(u.ordreNumber?{ordreNumber:u.ordreNumber}:{}),role:u.role,certified:u.certified,registeredSurveyor:u.role==='GEOMETRE'&&u.certified,accountActive:u.status==='active'&&u.verified,status:u.status,verified:u.verified}; }
export type CurrentUser = ReturnType<typeof publicUser>;
export interface SmsSender { send(phone:string, text:string):Promise<void> }
export class ConsoleSms implements SmsSender {
 async send(phone:string,text:string) { console.info('[SMS SIMULE - usage local uniquement]',phone,text); }
}
