const {spawn}=require('node:child_process');
const path=require('node:path');
async function main(){
 const child=spawn(process.execPath,['dist/src/demo.js'],{cwd:path.join(__dirname,'..','api'),env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 let text='';let stderr='';child.stderr.on('data',d=>stderr+=d);
 try {
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Delai de demarrage depasse')),20000);
   child.stdout.on('data',d=>{text+=d;if(text.includes('Mot de passe temporaire :')){clearTimeout(timer);resolve();}});
   child.once('exit',()=>{clearTimeout(timer);reject(Error('Demonstration arretee avant demarrage : '+stderr));});
  });
  const url=text.match(/DEMO_URL=(http:\/\/[^\s]+)/)[1];
  const password=text.match(/Mot de passe temporaire : ([^\s]+)/)[1];
  const health=await fetch(url+'/health');if(health.status!==200)throw Error('Health invalide');
  const map=await (await fetch(url+'/map/parcels')).json();if(!map.demo||map.features.length!==3)throw Error('Carte demo invalide');
  const login=await fetch(url+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'+22890000001',password})});
  if(login.status!==201)throw Error('Connexion admin demo invalide');
  console.info('OK : serveur autonome, carte fictive et connexion administrateur.');
 } finally {child.kill();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
