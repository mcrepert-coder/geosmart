import { createHash, randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { AuditService, Clock } from '../audit/audit.service';
import { PgAuditStore } from '../audit/pg-audit.store';
import type { ParcelCreator } from './parcel-creation.service';
import type { ParcelReader } from './parcel-query.service';
import { prepareParcelGeometry } from './parcel-geometry';
import { LandValidationError } from './validate-vertices';
import { ATTESTATION_NOTICE } from './attestation-pdf';
import type { AttestationDocument, AttestationPdfRenderer } from './attestation-pdf';

export interface OpenParcelConflicts {
  // Adaptateur obligatoire pour le cycle de vie des alertes encore a integrer.
  // Toute lecture SQL doit utiliser ce client, pas emprunter un second client.
  hasOpenConflict(parcelId: string, version: number, client: PoolClient): Promise<boolean>;
}

export type Attestation = Omit<AttestationDocument,'vertices'> & { pdfUrl: string };
export interface AttestationIssuer extends ParcelCreator { name: string }

export class AttestationError extends Error {
  constructor(readonly code: string, readonly status: 400 | 401 | 403 | 404,
    message: string) { super(message); this.name='AttestationError'; }
}

interface AttestationRow {
  number: string; parcel_id: string; parcel_version: number;
  surveyor_id: string; surveyor_name: string; issued_at: Date;
  area_m2: number; perimeter_m: number; geometry_hash: string;
}

function response(row: AttestationRow): Attestation {
  return { number:row.number, parcelId:row.parcel_id, parcelVersion:row.parcel_version,
    surveyorId:row.surveyor_id, surveyorName:row.surveyor_name, issuedAt:row.issued_at.toISOString(),
    areaM2:row.area_m2, perimeterM:row.perimeter_m, geometryHash:row.geometry_hash,
    notice:ATTESTATION_NOTICE, pdfUrl:`/attestations/${encodeURIComponent(row.number)}/pdf` };
}

function authorize(reader?: ParcelReader): void {
  if (!reader) throw new AttestationError('UNAUTHORIZED',401,'Authentification requise');
  if (typeof reader.id!=='string' || !reader.id.trim() || reader.active!==true ||
      !['admin','geometre','topographe','agent','client'].includes(reader.role)) {
    throw new AttestationError('FORBIDDEN_ROLE',403,'Compte actif requis');
  }
}

export class AttestationService {
  constructor(private readonly pool: Pool, private readonly renderer: AttestationPdfRenderer,
    private readonly conflicts: OpenParcelConflicts,
    private readonly clock: Clock=()=>new Date(),
    private readonly nextNumber:()=>string=()=>`ATL-${randomUUID()}`) {}

  async issue(id: string, issuer: AttestationIssuer): Promise<Attestation> {
    authorize(issuer);
    if (issuer.role!=='geometre') throw new AttestationError('FORBIDDEN_ROLE',403,'Geometre auteur requis');
    if (issuer.surveyorRegistered!==true) throw new AttestationError('SURVEYOR_NOT_REGISTERED',403,'Geometre non inscrit a l Ordre');
    if (typeof issuer.name!=='string' || !issuer.name.trim()) throw new AttestationError('VALIDATION_ERROR',400,'Nom professionnel manquant');
    if (typeof id!=='string' || !id.trim()) throw new AttestationError('VALIDATION_ERROR',400,'Identifiant invalide');
    const actor={...issuer};
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query('LOCK TABLE parcels IN SHARE ROW EXCLUSIVE MODE');
      const {rows}=await client.query<{author_id:string;legal_status:string;in_conflict:boolean;
        version:number;vertices:unknown;area_m2:number;perimeter_m:number;geometry_hash:string}>(
        `SELECT p.author_id,p.legal_status,p.in_conflict,p.version,v.vertices,
          v.area_m2,v.perimeter_m,v.geometry_hash FROM parcels p
          JOIN parcel_versions v ON v.parcel_id=p.id AND v.version=p.version WHERE p.id=$1`,[id]);
      const row=rows[0];
      if(!row)throw new AttestationError('NOT_FOUND',404,'Parcelle introuvable');
      if(row.author_id!==actor.id)throw new AttestationError('NOT_AUTHOR',403,'Geometre auteur requis');
      if(row.in_conflict || row.legal_status==='EN_LITIGE' ||
          await this.conflicts.hasOpenConflict(id,row.version,client)) {
        throw new AttestationError('PARCEL_IN_CONFLICT',403,'Parcelle en litige ou en conflit');
      }
      let prepared;
      try { prepared=prepareParcelGeometry(row.vertices); }
      catch(error) {
        if(error instanceof LandValidationError && error.code==='VERTEX_NOT_RTK_FIXED') {
          throw new AttestationError('VERTEX_NOT_RTK_FIXED',403,'Toutes les bornes doivent etre RTK Fixed');
        }
        throw error;
      }
      if(prepared.geometryHash!==row.geometry_hash)throw new Error('Empreinte de version incoherente');
      const document:AttestationDocument={ number:this.nextNumber(),parcelId:id,parcelVersion:row.version,
        areaM2:row.area_m2,perimeterM:row.perimeter_m,geometryHash:row.geometry_hash,
        surveyorId:actor.id,surveyorName:actor.name,issuedAt:this.clock().toISOString(),
        notice:ATTESTATION_NOTICE,vertices:prepared.vertices };
      const pdf=await this.renderer.render(document);
      if(pdf.length===0 || pdf.length>5000000 || pdf.subarray(0,5).toString('ascii')!=='%PDF-') {
        throw new Error('PDF genere invalide ou trop volumineux');
      }
      const key=`pdf:${document.number}`;
      const pdfHash=createHash('sha256').update(pdf).digest('hex');
      await client.query(`INSERT INTO attestations(number,parcel_id,parcel_version,surveyor_id,
        surveyor_name,issued_at,notice,pdf_storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [document.number,id,row.version,actor.id,actor.name,document.issuedAt,ATTESTATION_NOTICE,key]);
      await client.query(`INSERT INTO land_attestation_pdfs(storage_key,attestation_number,
        content,content_hash,created_at) VALUES($1,$2,$3,$4,$5)`,
        [key,document.number,pdf,pdfHash,document.issuedAt]);
      const audit=new AuditService(PgAuditStore.inTransaction(client),this.clock);
      await audit.log('ATTESTATION_ISSUED',actor.id,{number:document.number,parcelVersion:row.version,
        geometryHash:row.geometry_hash,pdfHash},{type:'parcel',id});
      await client.query('COMMIT');
      const {vertices:_vertices,...metadata}=document;
      return {...metadata,pdfUrl:`/attestations/${encodeURIComponent(document.number)}/pdf`};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async list(id:string,reader?:ParcelReader):Promise<Attestation[]> {
    authorize(reader);
    const {rows:parcels}=await this.pool.query('SELECT id FROM parcels WHERE id=$1',[id]);
    if(!parcels.length)throw new AttestationError('NOT_FOUND',404,'Parcelle introuvable');
    const {rows}=await this.pool.query<AttestationRow>(`SELECT a.*,v.area_m2,v.perimeter_m,v.geometry_hash
      FROM attestations a JOIN parcel_versions v ON v.parcel_id=a.parcel_id AND v.version=a.parcel_version
      WHERE a.parcel_id=$1 ORDER BY a.issued_at DESC,a.number`,[id]);
    return rows.map(response);
  }

  async pdf(number:string,reader?:ParcelReader):Promise<Buffer> {
    authorize(reader);
    const {rows}=await this.pool.query<{content:Buffer;content_hash:string}>(
      `SELECT f.content,f.content_hash FROM land_attestation_pdfs f
        JOIN attestations a ON a.number=f.attestation_number AND a.pdf_storage_key=f.storage_key
        WHERE a.number=$1`,[number]);
    if(!rows.length)throw new AttestationError('NOT_FOUND',404,'Attestation introuvable');
    const content=Buffer.from(rows[0].content);
    if(createHash('sha256').update(content).digest('hex')!==rows[0].content_hash)throw new Error('PDF altere');
    return content;
  }
}
