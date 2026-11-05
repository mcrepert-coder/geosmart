import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapService,FeatureCollection } from '../src/map/map.service';
test('Carte : filtre public et absence explicite de source',async()=>{
 await assert.rejects(()=>new MapService().list(),{status:503});
 const collection:FeatureCollection={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[1,6],[2,6],[2,7],[1,6]]]},properties:{id:'demo',label:'Parcelle fictive',status:'pending'}}]};
 const service=new MapService({async list(){return collection;}});assert.equal((await service.list('pending')).features.length,1);assert.equal((await service.list('clear')).features.length,0);
});
