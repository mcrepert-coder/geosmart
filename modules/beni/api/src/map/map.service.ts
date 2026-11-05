import { ServiceUnavailableException } from '@nestjs/common';
export type MapFeature={type:'Feature';geometry:{type:'Polygon';coordinates:number[][][]};properties:{id:string;status:string;label:string;[key:string]:unknown}};
export type FeatureCollection={type:'FeatureCollection';features:MapFeature[];demo?:boolean};
// Lecture publique : uniquement des geometries et informations publiques.
export interface MapGateway { list():Promise<FeatureCollection> }
export class MapService {
 constructor(private gateway?:MapGateway){}
 async list(status?:string){
  if(!this.gateway)throw new ServiceUnavailableException('MAP_ADAPTER_NOT_CONFIGURED');
  const collection=await this.gateway.list();
  return {...collection,features:status?collection.features.filter(f=>f.properties.status===status):collection.features};
 }
}
