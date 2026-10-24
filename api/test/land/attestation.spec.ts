import 'reflect-metadata';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { AttestationService, AttestationIssuer } from '../../src/land/attestation.service';
import { PdfKitAttestationRenderer, AttestationDocument } from '../../src/land/attestation-pdf';
import { ParcelCreationService } from '../../src/land/parcel-creation.service';
import { ParcelUpdateService } from '../../src/land/parcel-update.service';
import { PgAuditStore } from '../../src/audit/pg-audit.store';
import { verifyChain } from '../../src/audit/audit-chain';
import { inTransaction, landTestDbAvailable, LandTestDb, migrate, openLandTestDb } from './support/land-test-db';
import { insertParcelWithVersion, parcelRow } from './support/land-fixtures';

function font(): Buffer {
  const path = [process.env.LAND_TEST_PDF_FONT_PATH,'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(p=>p && existsSync(p));
  if(!path)throw new Error('Definir LAND_TEST_PDF_FONT_PATH vers une police TTF de test');
  return readFileSync(path);
}

// Lecture independante du PDF dans un processus Node ESM, sans mocks du parseur.
function extract(pdf:Buffer):{text:string;pages:number} {
  const parser=require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const script=`import {pathToFileURL} from 'node:url';
    const {getDocument}=await import(pathToFileURL(process.argv[1]).href);
    const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
    const task=getDocument({data:new Uint8Array(Buffer.concat(chunks)),disableFontFace:true});
    const doc=await task.promise;const text=[];
    for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);
      const content=await page.getTextContent();text.push(content.items.map(x=>x.str??'').join(' '));}
    console.log(JSON.stringify({text:text.join(' '),pages:doc.numPages}));await task.destroy();`;
  const output=execFileSync(process.execPath,['--input-type=module','-e',script,parser],
    {input:pdf,encoding:'utf8',maxBuffer:10000000,timeout:30000});
  return JSON.parse(output.trim().split('\n').pop()!);
}

let site=0;
function input() {
  const x=1.3+(++site)*0.002;
  return {clientId:randomUUID(),legalStatus:'COUTUMIER_NON_TITRE',
    vertices:[[x,6.1],[x+0.0003,6.1],[x+0.0003,6.1003],[x,6.1003]].map(([lon,lat],i)=>({
      number:`B${i}`,lon,lat,source:{instrument:'UM982',fixMode:'RTK_FIXED',pdop:1.4,satellites:21,
        measuredAt:'2026-10-24T09:00:00Z'} }))};
}
const issuer:AttestationIssuer={id:'geo',role:'geometre',active:true,surveyorRegistered:true,name:'Samuel Mass\u00e9m\u00e9'};
const clock=()=>new Date('2026-10-24T12:00:00Z');
const describeDb=landTestDbAvailable()?describe:describe.skip;

describeDb('attestations de leve',()=>{
  let db:LandTestDb,pool:Pool,service:AttestationService,create:ParcelCreationService;
  let renderer:PdfKitAttestationRenderer;
  const conflicts={hasOpenConflict:jest.fn(async()=>false)};
  let busy=false;
  beforeAll(async()=>{
    db=(await openLandTestDb())!;await migrate(db);
    await inTransaction(db,async()=>{
      await db.exec(readFileSync(join(__dirname,'../../migrations/202610241200_audit_log.sql'),'utf8'));
      await db.exec(readFileSync(join(__dirname,'../../migrations/202610241400_land_attestation_pdfs.sql'),'utf8'));
    });
    const run=async(sql:string,params?:unknown[])=>({rows:await db.query(sql,params)});
    pool={query:run,connect:async()=>{if(busy)throw new Error('Client deja emprunte');busy=true;
      return {query:run,release:()=>{if(!busy)throw new Error('Double release');busy=false;}};
    }} as unknown as Pool;
    renderer=new PdfKitAttestationRenderer(font());
    service=new AttestationService(pool,renderer,conflicts,clock);
    create=new ParcelCreationService(pool,clock);
  },120000);
  beforeEach(()=>{conflicts.hasOpenConflict.mockResolvedValue(false);});
  afterEach(()=>{expect(busy).toBe(false);});
  afterAll(async()=>{await db?.close();});

  it('emet un vrai PDF avec tous les champs et un audit chaine',async()=>{
    const original=(await create.create(input(),issuer)).parcel;
    const attestation=await service.issue(original.id,issuer);
    expect(attestation).toMatchObject({parcelId:original.id,parcelVersion:1,surveyorName:issuer.name,
      geometryHash:original.geometryHash,notice:'Ne vaut pas titre foncier'});
    const pdf=await service.pdf(attestation.number,{...issuer,role:'client'});
    expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
    const parsed=extract(pdf);
    for(const value of ['Attestation de leve','Ne vaut pas titre foncier',attestation.number,
      original.id,issuer.name,original.geometryHash,'B0',String(original.areaM2),String(original.perimeterM)]) {
      expect(parsed.text.replace(/\s/g,'')).toContain(value.replace(/\s/g,''));
    }
    expect(parsed.text.toLowerCase()).not.toContain('qr code');
    expect(await service.list(original.id,issuer)).toEqual([attestation]);
    const entries=await new PgAuditStore(pool).list();
    expect(entries[entries.length-1]).toMatchObject({action:'ATTESTATION_ISSUED',entityId:original.id});
    expect(verifyChain(entries).valid).toBe(true);
  });

  it('conserve le meme PDF et les mesures historiques apres modification',async()=>{
    const request=input(),original=(await create.create(request,issuer)).parcel;
    const attestation=await service.issue(original.id,issuer),before=await service.pdf(attestation.number,issuer);
    const update=new ParcelUpdateService(pool,clock);
    await update.update(original.id,{expectedVersion:1,reason:'Nouveau leve',vertices:request.vertices.map((v,i)=>({
      ...v,lon:v.lon+(i===1||i===2?0.0001:0)}))},issuer);
    expect(await service.pdf(attestation.number,issuer)).toEqual(before);
    expect((await service.list(original.id,issuer))[0]).toMatchObject({parcelVersion:1,areaM2:original.areaM2});
  });

  it('refuse un geometre non inscrit et un autre auteur',async()=>{
    const original=(await create.create(input(),issuer)).parcel;
    await expect(service.issue(original.id,{...issuer,surveyorRegistered:false}))
      .rejects.toMatchObject({status:403,code:'SURVEYOR_NOT_REGISTERED'});
    await expect(service.issue(original.id,{...issuer,id:'autre'}))
      .rejects.toMatchObject({status:403,code:'NOT_AUTHOR'});
    expect(await service.list(original.id,issuer)).toEqual([]);
  });

  it.each(['client','agent','topographe','admin'])('refuse une emission par %s',async(role)=>{
    await expect(service.issue('unknown',{...issuer,role})).rejects.toMatchObject({status:403,code:'FORBIDDEN_ROLE'});
  });

  it('refuse EN_LITIGE, le drapeau de conflit et une alerte ouverte',async()=>{
    const disputed=(await create.create({...input(),legalStatus:'EN_LITIGE'},issuer)).parcel;
    await expect(service.issue(disputed.id,issuer)).rejects.toMatchObject({status:403,code:'PARCEL_IN_CONFLICT'});
    const original=(await create.create(input(),issuer)).parcel;
    await db.query('UPDATE parcels SET in_conflict=true WHERE id=$1',[original.id]);
    await expect(service.issue(original.id,issuer)).rejects.toMatchObject({status:403,code:'PARCEL_IN_CONFLICT'});
    const open=(await create.create(input(),issuer)).parcel;
    conflicts.hasOpenConflict.mockResolvedValue(true);
    await expect(service.issue(open.id,issuer)).rejects.toMatchObject({status:403,code:'PARCEL_IN_CONFLICT'});
  });

  it('refuse une borne Float avec 403, sans produire de PDF',async()=>{
    const row=parcelRow({id:'float',author_id:issuer.id});
    const vertices=structuredClone(row.vertices) as {source:{fixMode:string}}[];
    vertices[0].source.fixMode='RTK_FLOAT';
    await inTransaction(db,()=>insertParcelWithVersion(db,{...row,vertices}).then(()=>undefined));
    await expect(service.issue(row.id,issuer)).rejects.toMatchObject({status:403,code:'VERTEX_NOT_RTK_FIXED'});
    expect(await service.list(row.id,issuer)).toEqual([]);
  });

  it('annule tout si le rendu du PDF echoue',async()=>{
    const original=(await create.create(input(),issuer)).parcel;
    const broken=new AttestationService(pool,{render:async()=>{throw new Error('Police indisponible');}},conflicts,clock);
    await expect(broken.issue(original.id,issuer)).rejects.toThrow('Police indisponible');
    expect(await service.list(original.id,issuer)).toEqual([]);
  });

  it.each([0,5000001])('refuse un PDF de taille invalide (%s octets)',async(size)=>{
    const original=(await create.create(input(),issuer)).parcel;
    const invalid=new AttestationService(pool,{render:async()=>Buffer.alloc(size)},conflicts,clock);
    await expect(invalid.issue(original.id,issuer)).rejects.toThrow('PDF genere invalide');
    expect(await service.list(original.id,issuer)).toEqual([]);
  });

  it('annule PDF, attestation et audit si le journal SQL echoue',async()=>{
    await db.exec(`CREATE FUNCTION test_reject_attestation() RETURNS trigger AS $$
      BEGIN IF NEW.action='ATTESTATION_ISSUED' AND NEW.details->>'number'='audit-failure'
        THEN RAISE EXCEPTION 'audit refuse'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_attestation BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION test_reject_attestation();`);
    const original=(await create.create(input(),issuer)).parcel;
    const broken=new AttestationService(pool,renderer,conflicts,clock,()=> 'audit-failure');
    await expect(broken.issue(original.id,issuer)).rejects.toThrow('audit refuse');
    expect(await db.query("SELECT storage_key FROM land_attestation_pdfs WHERE attestation_number='audit-failure'")).toEqual([]);
    expect(await service.list(original.id,issuer)).toEqual([]);
  });

  it('protege le telechargement et refuse les identifiants inconnus',async()=>{
    await expect(service.pdf('unknown')).rejects.toMatchObject({status:401});
    await expect(service.pdf('unknown',{...issuer,active:false})).rejects.toMatchObject({status:403});
    await expect(service.pdf('unknown',issuer)).rejects.toMatchObject({status:404});
    await expect(service.list('unknown',issuer)).rejects.toMatchObject({status:404});
    await expect(service.issue('unknown',issuer)).rejects.toMatchObject({status:404});
  });

  it('refuse modification, suppression et TRUNCATE des PDF',async()=>{
    const original=(await create.create(input(),issuer)).parcel;
    const attestation=await service.issue(original.id,issuer);
    for(const sql of ["UPDATE land_attestation_pdfs SET content=content",'DELETE FROM land_attestation_pdfs',
      'TRUNCATE land_attestation_pdfs']) {
      await expect(db.exec(sql)).rejects.toMatchObject({code:'P0001'});
    }
    expect((await service.pdf(attestation.number,issuer)).length).toBeGreaterThan(0);
  });
});

describe('rendu PDF multipage',()=>{
  it('conserve les bornes, les accents et la mention sur plusieurs pages',async()=>{
    const renderer=new PdfKitAttestationRenderer(font());
    const source={instrument:'UM982',fixMode:'RTK_FIXED' as const,pdop:1.4,satellites:21,measuredAt:'2026-10-24T09:00:00Z'};
    const document:AttestationDocument={number:'ATL-TEST',parcelId:'PRC-TEST',parcelVersion:7,
      areaM2:1200,perimeterM:150,geometryHash:'a'.repeat(64),surveyorId:'geo',surveyorName:issuer.name,
      issuedAt:clock().toISOString(),notice:'Ne vaut pas titre foncier',
      vertices:Array.from({length:200},(_,i)=>({number:`B${i}`,lon:1+i*0.000001,lat:6.1,source}))};
    const parsed=extract(await renderer.render(document));
    expect(parsed.pages).toBeGreaterThan(1);
    expect(parsed.text).toContain('B199');
    expect(parsed.text).toContain(issuer.name);
    expect(parsed.text.match(/Ne vaut pas titre foncier/g)!.length).toBeGreaterThanOrEqual(parsed.pages);
  });
});
