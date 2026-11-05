// Regenerer apres npm run build dans api/.
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('../api/node_modules/yaml');
const packageInfo = require('../api/package.json');
const {z} = require('../api/node_modules/zod');
const {registerSchema,loginSchema,roleSchema,phoneSchema,surveyorProfileSchema} = require('../api/dist/src/auth/model');
const {syncSchema} = require('../api/dist/src/sync/sync.service');
const ref = name => ({$ref:'#/components/schemas/'+name});
const schema = s => {const j=z.toJSONSchema(s);delete j.$schema;return j;};
const user = {type:'object',required:['id','phone','name','role','certified','registeredSurveyor','accountActive','status','verified'],properties:{id:{type:'string',format:'uuid'},phone:{type:'string'},name:{type:'string'},fullName:{type:'string',maxLength:120},ordreNumber:{type:'string',maxLength:40,description:"geometre inscrit a l'Ordre"},role:ref('Role'),certified:{type:'boolean'},registeredSurveyor:{type:'boolean'},accountActive:{type:'boolean'},status:{enum:['pending','active','rejected','suspended']},verified:{type:'boolean'}}};
const paths = {};
function route(url,method,summary,input,response,options={}) {
 const operation={summary,security:options.public?[]:[{bearerAuth:[]}],responses:{[options.status??(method==='post'?201:200)]:{description:'Succes',content:{[options.binary?'application/octet-stream':'application/json']:{schema:response??{type:'object'}}}},400:{description:'Donnees invalides'},401:{description:'Authentification absente ou invalide'},403:{description:'Compte ou role non autorise'},429:{description:'Limite par IP : 120 requetes par minute'}}};
 if(input)operation.requestBody={required:true,content:{'application/json':{schema:input}}};
 const ids=[...url.matchAll(/\{(\w+)\}/g)].map(m=>m[1]);
 if(ids.length)operation.parameters=ids.map(name=>({name,in:'path',required:true,schema:{type:'string'}}));
 if(options.parameters)operation.parameters=[...(operation.parameters??[]),...options.parameters];
 if(options.note)operation.description=options.note;
 (paths[url]??={})[method]=operation;
}
const refresh=schema(z.object({refreshToken:z.string().min(32).max(200)}).strict());
route('/health','get','Etat du serveur',null,{type:'object'},{public:true});
route('/auth/register','post','Creer un compte en attente',schema(registerSchema),ref('User'),{public:true,note:'Role initial client. Aucune auto-attribution de role. SMS simule dans le lanceur local.'});
route('/auth/verify','post','Verifier le code et obtenir une session inscription',schema(z.object({phone:phoneSchema,code:z.string().regex(/^\d{6}$/)}).strict()),{type:'object',properties:{verified:{const:true},onboardingToken:{type:'string'}}},{public:true,note:'Le jeton inscription accede seulement au profil et aux pieces tant que le compte est en attente. Duree une heure.'});
route('/auth/login','post','Connexion d un compte actif',schema(loginSchema),ref('Session'),{public:true});
route('/auth/refresh','post','Renouvellement a usage unique',refresh,ref('Session'),{public:true});
route('/auth/logout','post','Invalider le renouvellement de cette session',refresh,{type:'object',properties:{ok:{const:true}}});
route('/users/me','get','Profil courant',null,ref('User'));
const document=schema(z.object({type:z.enum(['identity','professional','rccm','approval','order']),mime:z.enum(['image/jpeg','image/png','application/pdf']),base64:z.string().max(6990508)}).strict());
route('/users/me/documents','post','Ajouter une piece privee de 5 Mo maximum',document,{type:'object',properties:{id:{type:'string'},type:{type:'string'},mime:{type:'string'}}});
route('/users/me/documents','get','Lister les metadonnees de ses pieces',null,{type:'array',items:ref('Document')});
route('/documents/{id}','get','Telecharger une piece (titulaire ou admin)',null,{type:'string',format:'binary'},{binary:true,note:'Content-Type reel : image/jpeg, image/png ou application/pdf. Reponse attachment, no-store, nosniff. 404 si absent.'});
route('/admin/users','get','Admin : lister les comptes',null,{type:'array',items:ref('User')});
route('/admin/documents','get','Admin : lister les metadonnees des justificatifs',null,{type:'array',items:ref('Document')});
route('/admin/users/{id}','patch','Admin : validation, rejet ou suspension',schema(z.object({action:z.enum(['approve','reject','suspend']),role:roleSchema.optional(),certified:z.boolean().optional(),reason:z.string().min(1).max(1000).optional(),...surveyorProfileSchema.shape}).strict()),ref('User'),{note:'approve : telephone verifie, role et piece identite requis ; piece professionnelle pour agent ; inscription et numero Ordre pour geometre certifie. fullName et ordreNumber sont controles par administration. reject/suspend : motif requis. Modification de soi-meme interdite.'});
route('/admin/logs','get','Admin : journal des actions sensibles',null,{type:'array',items:{type:'object',properties:{id:{type:'string'},actor:{type:'string'},action:{type:'string'},target:{type:'string'},at:{type:'string',format:'date-time'},previousHash:{type:'string'},hash:{type:'string'}}}});
route('/sync','post','Synchroniser des missions completes',schema(syncSchema),{type:'object',required:['results'],properties:{results:{type:'array',items:{type:'object',required:['clientId','status','retryable'],properties:{clientId:{type:'string',format:'uuid'},status:{enum:['accepted','rejected']},entityId:{type:'string'},reason:{type:'string'},retryable:{type:'boolean'}}}}}},{note:'Un element entityType=survey_session contient la mission entiere. Aucun envoi borne par borne. Le schema metier payload, la revision de mission et la conversion en parcelle sont a valider avec Romuald et le module foncier : le schema demo-v1 ne vaut pas contrat commun. POST /sync ne cree aucune parcelle. Les routes, contraintes et reponses de POST /parcels existantes restent du ressort de land.yaml. clientId unique par compte, renvoi identique idempotent, CLIENT_ID_REUSED si charge differente. SURVEY_ADAPTER_NOT_CONFIGURED est temporaire. Voir COMPATIBILITE-EQUIPE.md.'});
route('/map/parcels','get','Carte publique GeoJSON WGS84 en lecture seule',null,ref('FeatureCollection'),{public:true,parameters:[{name:'status',in:'query',required:false,schema:{type:'string',enum:['clear','pending','disputed']}}],note:'503 MAP_ADAPTER_NOT_CONFIGURED sans source. En demonstration : demo=true et trois polygones fictifs.'});
const featureSchema=z.object({type:z.literal('Feature'),geometry:z.object({type:z.literal('Polygon'),coordinates:z.array(z.array(z.array(z.number()).min(2)))}),properties:z.object({id:z.string(),status:z.string(),label:z.string()}).loose()});
const schemas={
 Role:schema(roleSchema),CurrentUser:user,User:ref('CurrentUser'),
 Session:{type:'object',required:['accessToken','refreshToken','user'],properties:{accessToken:{type:'string'},refreshToken:{type:'string'},user:ref('User')}},
 Document:{type:'object',properties:{id:{type:'string'},ownerId:{type:'string'},type:{type:'string'},mime:{type:'string'},createdAt:{type:'string',format:'date-time'}}},
 FeatureCollection:schema(z.object({type:z.literal('FeatureCollection'),features:z.array(featureSchema),demo:z.boolean().optional()})),
};
const contract={
 openapi:'3.1.0',
 info:{title:'GeoSmart - M4 Beni autonome',version:packageInfo.version,description:'Comptes, roles, carte et synchronisation. Module independant. Synchronisation de missions completes ; contrat metier de mission a confirmer.'},
 servers:[{url:'http://127.0.0.1:3000',description:'Demonstration locale'}],
 paths,
 components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}},schemas},
};
const output=path.join(__dirname,'..','contracts');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'openapi.json'),JSON.stringify(contract,null,2)+'\n');
for(const [file,filter] of [['auth.yaml',p=>p!=='/sync'&&p!=='/map/parcels'],['sync.yaml',p=>p==='/sync']]){
 const part={...contract,info:{...contract.info,title:'GeoSmart M4 - '+file.replace('.yaml','')},paths:Object.fromEntries(Object.entries(paths).filter(([p])=>filter(p)))};
 fs.writeFileSync(path.join(output,file),'# Genere depuis le code M4 par tools/generate-contract.cjs\n'+YAML.stringify(part));
}
console.info('Contrat genere : '+Object.keys(paths).length+' chemins.');
