# Utiliser le module M4 depuis un autre module

Le module est livre sous forme de code source partage pour GitHub. Les exemples locaux restent independants. Aucun changement dans un autre projet n'a ete effectue. Le point d'entree public du paquet est `@geosmart/beni-module`.

## Construire et installer le paquet

```bash
cd api
npm ci
npm test
npm pack
# Dans le backend de destination :
npm install /chemin/vers/geosmart-beni-module-0.2.0.tgz
```

Le paquet contient du JavaScript compile et les declarations TypeScript. Il ne contient ni les tests, ni le lanceur demo, ni de secret. Il n'est pas necessaire de publier sur le registre npm. Dans un monorepo, une dependance locale vers le dossier `api` est aussi possible apres compilation.

## NestJS

Importer `BeniModule.register(options)` dans les imports d'un module racine. Fournir :

```typescript
import { BeniModule, Store } from '@geosmart/beni-module';
import { Pool } from 'pg';

const store = new Store(new Pool({connectionString: process.env.DATABASE_URL}));
await store.init();
const moduleM4 = BeniModule.register({
  store,
  secret: process.env.JWT_SECRET!,
  sms: fournisseurSms,
  map: sourceGeoJsonPublique,
  survey: adaptateurTerrain,
});
```

`map.list()` renvoie une FeatureCollection GeoJSON de polygones WGS84. Ne jamais exposer de noms, telephones, pieces privees ou donnees personnelles dans cette reponse publique. Les statuts de la vue Android sont `clear`, `pending`, `disputed` ; convenir de la correspondance avec les statuts fonciers reels.

`survey(tx, user, payload, entityType)` traite uniquement `entityType: survey_session`, avec la mission complete. Le schema interne de mission doit etre confirme avec Romuald avant integration ; la fixture demo-v1 du lanceur local ne fait pas autorite. Aucun POST /parcels n est effectue par M4 et aucune conversion automatique de mission en parcelle n est decidee ici. L'adaptateur doit verifier le schema, le chantier assigne, le droit de modification et les contraintes GNSS avant toute ecriture. Pour refuser, lever `SyncRejection(code, retryable)`. Pour accepter, ecrire via **le meme objet `tx`** et renvoyer `{id}`. Ne pas effectuer d'effet externe ou d'ecriture sur une autre connexion : l'idempotence repose sur la transaction commune. Une erreur technique annule la transaction et ne produit pas de recu accepte.

Le stockage utilise des tables prefixees `beni_`, avec donnees JSONB. Ce choix isole le prototype. Un adaptateur de persistance normalise pourra etre ajoute avant l'integration finale. Le verrou de transaction `beni_mutex` garantit l'unicite mais serialise les traitements : mesurer la charge avant d'augmenter le trafic.

Les gardes du controleur protegent les routes M4 uniquement. Importer le module n'ajoute pas de garde globale dans l'hote. Pour proteger une route d'un autre intervenant, utiliser `@UseGuards(BeniGuard)` et `@Roles(...)` dans un module qui importe le module M4 configure. `@Roles` seul ne protege pas une route. `@Public()` contourne BeniGuard sur une route explicitement publique. Le role est unique et relu en base a chaque requete ; le jeton ne fournit pas de role faisant autorite.

Installer `ErrorFilter` globalement. Le serveur autonome n'active aucun CORS : le client Android n'en a pas besoin. Un futur client navigateur devra configurer explicitement les origines autorisees.

Le journal propre au module contient des empreintes chainees et les actions sensibles. Pour un journal commun, adapter `Tx.audit` a la persistance transactionnelle du journal central. Ne pas annoncer un journal infalsifiable sur cette seule base.

## Justificatifs

`GET /documents/{id}` renvoie le fichier binaire, avec controle serveur du proprietaire ou du role administrateur. Exemple PowerShell, apres connexion :

```powershell
$login = Invoke-RestMethod http://127.0.0.1:3000/auth/login -Method Post -ContentType application/json -Body (@{phone=$telephone;password=$motDePasse} | ConvertTo-Json)
Invoke-WebRequest "http://127.0.0.1:3000/documents/$documentId" -Headers @{Authorization="Bearer $($login.accessToken)"} -OutFile ./piece-verifiee.pdf
```

Le mot de passe, le jeton et la piece ne doivent pas etre ajoutes au code source. Les controles actuels portent sur la taille, le MIME et la signature initiale du format ; ils ne remplacent pas une analyse antimalware ou un decodeur complet. La validation d'un agent reste une decision humaine sur les pieces fournies. Pour certifier un agent, choisir `role=agent` et `certified=true` apres controle des pieces professionnelles. Pour un geometre certifie, l'inscription a l'Ordre est obligatoire.

## Android

Ajouter la bibliotheque source `mobile/beni` comme sous-module Gradle, puis declarer `implementation(project(":beni"))` dans l'application hote. Les packages publics sont `com.geosmart.field.account`, `com.geosmart.field.sync`, `com.geosmart.field.map`. La bibliotheque ne contient ni Activity de lancement ni applicationId. `mobile/app` montre comment la consommer ; sa MainActivity est un exemple de navigation. Aucun fichier Gradle d'un projet existant n'a ete touche. L'artefact AAR release peut aussi etre genere avec `:beni:assembleRelease` ; l'integration source Gradle est recommandee pour conserver la resolution des dependances Kotlin.

Le manifeste doit conserver les permissions reseau et RECEIVE_BOOT_COMPLETED, ainsi que le service `SyncJob` protege par BIND_JOB_SERVICE. Les ecritures terrain doivent appeler `OfflineQueue.enqueue(...)` avant tout appel serveur. Un element rejete conserve son motif ; pour corriger la charge utile, creer un nouvel element avec un nouvel identifiant. Ne jamais reutiliser un clientId avec des donnees differentes.

Un compte actif peut continuer ses saisies locales sans reseau avec sa session chiffree. La premiere connexion, l'inscription et les decisions d'administration necessitent le serveur. Les droits hors ligne de l'interface ne remplacent pas le controle serveur lors de la synchronisation.

La deconnexion invalide le jeton de renouvellement utilise ; un jeton d'acces deja emis reste valide au plus une heure, sauf suspension du compte. Ajouter une version de session ou une liste de revocation si une deconnexion immediate de tous les appareils est exigee.

## Avant exploitation

Brancher les sources metier reelles, un fournisseur SMS et un stockage prive adapte ; configurer HTTPS, quotas, sauvegardes, conservation des pieces et supervision. Les tests actuels utilisent PostgreSQL emule et ne valident ni la charge ni la concurrence de plusieurs serveurs PostgreSQL reels. Faire une recette sur un serveur PostgreSQL et un appareil Android reels avant livraison finale.

## Exemple pour le module foncier

Le module qui contient ce controleur doit importer le meme BeniModule configure et partage par l'hote. Ne pas enregistrer une nouvelle instance avec une autre base dans chaque module.

```typescript
import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { BeniGuard, Roles } from '@geosmart/beni-module';
import type { CurrentUser } from '@geosmart/beni-module';

@Controller('parcels')
export class ParcelsController {
  @Post()
  @UseGuards(BeniGuard)
  @Roles('GEOMETRE')
  create(@Req() request: {user: CurrentUser}) {
    // La creation fonciere doit encore verifier la certification si necessaire,
    // le RTK Fixed, la geometrie, les chevauchements et l'affectation du chantier.
    return {actorId: request.user.id, certified: request.user.certified};
  }
}
```

Le retour ci-dessus est un exemple d'utilisation du contexte utilisateur, pas une implementation de creation de parcelle. La production d'une attestation officielle doit refuser un geometre dont `certified` est faux.

## Repartition des interfaces entre intervenants

| Besoin | Interface partagee | Responsabilite du consommateur |
|---|---|---|
| Proteger une route | BeniGuard + Roles | Declarer les roles autorises et les regles metier complementaires |
| Recevoir les missions completes hors ligne | SurveyAdapter | Verifier le payload, le chantier assigne et le GNSS ; ecrire dans la meme transaction |
| Afficher les parcelles | MapGateway | Fournir du GeoJSON public WGS84 et la correspondance des statuts |
| Envoyer un code reel | SmsSender | Brancher le fournisseur SMS et traiter ses erreurs |
| Sauvegarder une mission Android | OfflineQueue.enqueue | Appeler enqueue("survey_session", missionComplete) avant tout envoi et conserver le clientId au renvoi |
| Utiliser la carte Android | ParcelMap | Fournir une FeatureCollection ; la bibliotheque gere la vue, pas la validation fonciere |

Reserver l'identifiant JobScheduler 4001 dans l'application commune, ou l'adapter si un autre module l'utilise deja. Le nom SQLite `beni_queue.db` et l'alias Keystore `beni.session` sont propres au module.

## Compatibilite des contrats

Lire COMPATIBILITE-EQUIPE.md avant integration. ADMIN remplace les anciens libelles. Le module expose CurrentUser avec fullName et ordreNumber pour le consommateur foncier. La certification du geometre impose un numero Ordre verifie par administration. Le champ entityType est survey_session ; aucun envoi borne par borne n est accepte. Le contenu exact des missions et le flux existant POST /parcels sont a comparer avec les contrats reels de Romuald et du foncier.
