import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { Pool } from 'pg';
import { BeniModule } from './beni.module';
import { Store } from './store';
import { ErrorFilter } from './http';
async function main(){
 if(!process.env.DATABASE_URL||!process.env.JWT_SECRET)throw new Error('DATABASE_URL et JWT_SECRET requis');
 if(process.env.NODE_ENV==='production')throw new Error('Configurer un fournisseur SMS reel et les adaptateurs metier avant la production');
 const store=new Store(new Pool({connectionString:process.env.DATABASE_URL}));await store.init();
 const app=await NestFactory.create(BeniModule.register({store,secret:process.env.JWT_SECRET}),{bodyParser:false});
 app.use(json({limit:'75mb'}));app.useGlobalFilters(new ErrorFilter());
 app.enableShutdownHooks();await app.listen(Number(process.env.PORT??3000),'127.0.0.1');
 console.info('GeoSmart Beni - demonstration locale, SMS simules.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
