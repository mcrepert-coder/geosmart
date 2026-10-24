import 'reflect-metadata';
import type { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ParcelCreationService, ParcelCreator } from '../../src/land/parcel-creation.service';
import { ParcelUpdateService } from '../../src/land/parcel-update.service';
import { ParcelQueryService } from '../../src/land/parcel-query.service';
import { PgAuditStore } from '../../src/audit/pg-audit.store';
import { verifyChain } from '../../src/audit/audit-chain';
import { landTestDbAvailable, LandTestDb, migrate, openLandTestDb } from './support/land-test-db';

const describeDb = landTestDbAvailable() ? describe : describe.skip;
const actor: ParcelCreator = { id:'geo', role:'geometre', active:true, surveyorRegistered:true };
let site = 0;
function input() {
  const x = 1.2 + (++site) * 0.002;
  return { clientId:randomUUID(), legalStatus:'COUTUMIER_NON_TITRE', label:'Initial',
    vertices:[[x,6.1],[x+0.0003,6.1],[x+0.0003,6.1003],[x,6.1003]].map(([lon,lat],i)=>({
      number:`B${i}`,lon,lat,source:{instrument:'UM982',fixMode:'RTK_FIXED',pdop:1.4,satellites:21,
        measuredAt:'2026-10-24T09:00:00Z'} })) };
}

describeDb('modification et historique foncier', () => {
  let db: LandTestDb, pool: Pool;
  let create: ParcelCreationService, update: ParcelUpdateService, query: ParcelQueryService;
  let busy = false;
  const clock = () => new Date('2026-10-24T12:00:00Z');
  beforeAll(async () => {
    db = (await openLandTestDb())!; await migrate(db);
    await db.exec(readFileSync(join(__dirname,'../../migrations/202610241200_audit_log.sql'),'utf8'));
    const run = async(sql:string,params?:unknown[])=>({rows:await db.query(sql,params)});
    pool = {query:run,connect:async()=>{
      if(busy) throw new Error('Pool deja emprunte'); busy=true;
      return {query:run,release:()=>{if(!busy)throw new Error('Double release');busy=false;}};
    }} as unknown as Pool;
    create=new ParcelCreationService(pool,clock); update=new ParcelUpdateService(pool,clock);
    query=new ParcelQueryService(pool,{registeredAuthors:async(ids)=>new Set(ids)},clock);
  },120_000);
  afterAll(async()=>{await db?.close();});
  afterEach(()=>{expect(busy).toBe(false);});

  it('cree une version et un audit sans toucher aux donnees de rejeu',async()=>{
    const request=input(), original=await create.create(request,actor);
    const changed=await update.update(original.parcel.id,{expectedVersion:1,reason:'Contestation',legalStatus:'EN_LITIGE'},actor);
    expect(changed).toMatchObject({version:2,legalStatus:'EN_LITIGE',inConflict:true,authorId:actor.id});
    expect(changed.geometryHash).toBe(original.parcel.geometryHash);
    const versions=await query.versions(changed.id,actor);
    expect(versions.map(v=>v.version)).toEqual([2,1]);
    expect(versions[0]).toMatchObject({changedBy:actor.id,reason:'Contestation'});
    expect(versions[1].legalStatus).toBe(request.legalStatus);
    expect(await create.create(request,actor)).toEqual({status:200,parcel:original.parcel});
    const events=(await new PgAuditStore(pool).list()).filter(e=>e.entityId===changed.id);
    expect(events.map(e=>e.action)).toEqual(['PARCEL_CREATED','PARCEL_UPDATED']);
  });

  it('modifie la limite et recalcule surface, perimetre et empreinte',async()=>{
    const request=input(),original=await create.create(request,actor);
    const vertices=request.vertices.map((v,i)=>({...v,lon:v.lon+(i===1||i===2?0.0001:0)}));
    const changed=await update.update(original.parcel.id,{expectedVersion:1,reason:'Nouvelle mesure',vertices},actor);
    expect(changed.areaM2).toBeGreaterThan(original.parcel.areaM2);
    expect(changed.perimeterM).toBeGreaterThan(original.parcel.perimeterM);
    expect(changed.geometryHash).not.toBe(original.parcel.geometryHash);
    expect((await query.versions(changed.id,actor))[1].geometry).toEqual(original.parcel.geometry);
  });

  it('refuse une version obsolete sans creer de version supplementaire',async()=>{
    const original=await create.create(input(),actor);
    await update.update(original.parcel.id,{expectedVersion:1,reason:'Libelle',label:'Nouveau'},actor);
    await expect(update.update(original.parcel.id,{expectedVersion:1,reason:'Ancien',label:'Ecrasement'},actor))
      .rejects.toMatchObject({status:409,code:'VERSION_CONFLICT',details:{currentVersion:2}});
    expect(await query.versions(original.parcel.id,actor)).toHaveLength(2);
  });

  it.each(['agent','client','topographe','admin'])('refuse le role %s (CA-4)',async(role)=>{
    const original=await create.create(input(),actor);
    await expect(update.update(original.parcel.id,{expectedVersion:1,reason:'Tentative',label:'Interdit'},
      {...actor,role})).rejects.toMatchObject({status:403,code:'FORBIDDEN_ROLE'});
    expect(await query.versions(original.parcel.id,actor)).toHaveLength(1);
  });

  it('refuse un autre geometre et un compte inactif',async()=>{
    const original=await create.create(input(),actor), patch={expectedVersion:1,reason:'Tentative',label:'Interdit'};
    await expect(update.update(original.parcel.id,patch,{...actor,id:'autre'}))
      .rejects.toMatchObject({status:403,code:'NOT_AUTHOR'});
    await expect(update.update(original.parcel.id,patch,{...actor,active:false})).rejects.toMatchObject({status:403});
  });

  it('refuse les changements vides et les champs interdits',async()=>{
    const original=await create.create(input(),actor);
    await expect(update.update(original.parcel.id,{expectedVersion:1,reason:'Aucun',label:'Initial'},actor))
      .rejects.toMatchObject({status:400,code:'NO_CHANGE'});
    await expect(update.update(original.parcel.id,{expectedVersion:1,reason:'Aucun'},actor)).rejects.toMatchObject({status:400});
    await expect(update.update(original.parcel.id,{expectedVersion:1,reason:'Auteur',authorId:'autre',label:'Nouveau'},actor))
      .rejects.toMatchObject({status:400});
  });

  it('refuse des bornes Float et un contour auto-intersecte',async()=>{
    const request=input(),original=await create.create(request,actor);
    const vertices=structuredClone(request.vertices);vertices[0].source.fixMode='RTK_FLOAT';
    await expect(update.update(original.parcel.id,{expectedVersion:1,reason:'Mesure',vertices},actor))
      .rejects.toMatchObject({status:422});
    const crossing=[request.vertices[0],request.vertices[2],request.vertices[1],request.vertices[3]];
    await expect(update.update(original.parcel.id,{expectedVersion:1,reason:'Mesure',vertices:crossing},actor))
      .rejects.toMatchObject({status:400});
    expect(await query.versions(original.parcel.id,actor)).toHaveLength(1);
  });

  it('annule une modification chevauchante mais conserve son alerte',async()=>{
    const first=await create.create(input(),actor), secondRequest=input();
    const second=await create.create(secondRequest,actor);
    await expect(update.update(first.parcel.id,{expectedVersion:1,reason:'Deplacement',vertices:secondRequest.vertices},actor))
      .rejects.toMatchObject({status:409,code:'PARCEL_OVERLAP',details:{conflictingParcelIds:[second.parcel.id]}});
    expect(await query.versions(first.parcel.id,actor)).toHaveLength(1);
    const events=await new PgAuditStore(pool).list();
    expect(events[events.length-1]).toMatchObject({action:'PARCEL_OVERLAP_REJECTED',entityId:first.parcel.id});
    expect(verifyChain(events).valid).toBe(true);
  });

  it('annule etat courant et nouvelle version si le journal echoue',async()=>{
    const original=await create.create(input(),actor);
    await db.exec(`CREATE FUNCTION test_reject_update() RETURNS trigger AS $$
      BEGIN IF NEW.action='PARCEL_UPDATED' THEN RAISE EXCEPTION 'audit refuse'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_update BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION test_reject_update();`);
    await expect(update.update(original.parcel.id,{expectedVersion:1,reason:'Libelle',label:'Annule'},actor))
      .rejects.toThrow('audit refuse');
    expect(await query.versions(original.parcel.id,actor)).toHaveLength(1);
    const [row]=await db.query('SELECT version,label FROM parcels WHERE id=$1',[original.parcel.id]);
    expect(row).toEqual({version:1,label:'Initial'});
  });

  it('protege l historique et distingue les parcelles inconnues',async()=>{
    await expect(query.versions('unknown',actor)).rejects.toMatchObject({status:404});
    await expect(update.update('unknown',{expectedVersion:1,reason:'Test',label:'X'},actor)).rejects.toMatchObject({status:404});
    await expect(query.versions('unknown')).rejects.toMatchObject({status:401});
    await expect(query.versions('unknown',{...actor,role:'client'})).rejects.toMatchObject({status:403});
    await expect(query.versions('unknown',{...actor,role:'admin'})).rejects.toMatchObject({status:404});
  });
});
