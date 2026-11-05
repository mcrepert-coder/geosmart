import { Pool } from 'pg';
import { Store } from './store';
import { AuthService } from './auth/auth.service';
import { ConsoleSms,phoneSchema } from './auth/model';
async function main(){
 const {DATABASE_URL,JWT_SECRET,ADMIN_PHONE,ADMIN_PASSWORD}=process.env;
 if(!DATABASE_URL||!JWT_SECRET||!ADMIN_PHONE||!ADMIN_PASSWORD)throw new Error('DATABASE_URL, JWT_SECRET, ADMIN_PHONE, ADMIN_PASSWORD requis');
 const store=new Store(new Pool({connectionString:DATABASE_URL}));
 try{await store.init();console.info(await new AuthService(store,JWT_SECRET,new ConsoleSms()).bootstrap(phoneSchema.parse(ADMIN_PHONE),ADMIN_PASSWORD,'Administrateur'));}
 finally{await store.pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
