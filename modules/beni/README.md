# GeoSmart - Module M4 partage de Beni

Livraison du 2 novembre 2026. Reference fonctionnelle : **Cahier des charges Global - GeoSmart.docx**, module 3, identifie **M4 - Beni**.

Ce dossier contient le module a commiter sur GitHub pour les autres intervenants. Il reste independant de tout projet existant. Il fournit un paquet NestJS importable, une bibliotheque Android et un contrat OpenAPI. Les applications de demonstration permettent de tester le module, sans etre necessaires a son utilisation dans le projet commun. Aucun depot existant n'a ete modifie.

## Perimetre

- Comptes par telephone, verification par code SMS simule, connexion, jetons JWT, rotation du renouvellement et blocage temporaire apres cinq echecs.
- Roles uniques : administrateur, geometre, topographe, agent immobilier, client. Certification separee du role pour les geometres et agents. Invites : carte publique en lecture seule.
- Administration : consultation des comptes, justificatifs prives, validation avec attribution du role, rejet motive, suspension et journal des actions.
- Carte Android : polygones GeoJSON, couleurs par statut, filtres, zoom et deplacement. Cache SQLite disponible hors ligne. Pas de fond cartographique ni de service de tuiles requis.
- Synchronisation : file locale SQLite, separation par compte, identifiant client stable, reprise automatique par JobScheduler, refus avec motif, idempotence serveur transactionnelle.

Les levees GNSS, le controle des chevauchements, les attestations, les annonces et la location ne font pas partie de cette livraison M4. Des interfaces permettent de brancher les donnees terrain et la carte sans embarquer les autres modules.

## Retour d'equipe pris en compte - version 0.2.0

Le role administrateur est **ADMIN**. Le profil CurrentUser expose **registeredSurveyor**, **accountActive**, **fullName** (120 caracteres maximum) et **ordreNumber** (40 maximum). La synchronisation utilise **entityType: survey_session** pour une mission complete. Lire **COMPATIBILITE-EQUIPE.md** : le JSON exact du telephone et le passage mission -> parcelle restent a valider avec Romuald et le foncier.

Les fichiers **contracts/auth.yaml** et **contracts/sync.yaml** sont generes depuis le code, avec le schema OpenAPI global. Le contrat leasing cite dans le retour n'est pas inclus dans ce module M4.

## Utilisation par les autres intervenants

- **Backend** : depuis `api/`, executer `npm ci`, `npm test`, puis `npm pack`. Installer le fichier `.tgz` dans le backend commun et importer `@geosmart/beni-module`. Le paquet expose BeniModule, AuthService, BeniGuard, Roles et les interfaces de synchronisation et de carte. Aucun serveur ne demarre a l'import.
- **Android** : ajouter le module Gradle `mobile/beni` comme dependance de l'application commune avec `implementation(project(":beni"))`. L'application `mobile/app` est un exemple consommateur.
- **Contrat** : consulter `contracts/openapi.json` pour les routes, les droits et les formats JSON. Les adaptateurs `SurveyAdapter`, `MapGateway` et `SmsSender` sont les points de branchement des autres intervenants.
- **GitHub** : lire `A-COMMITER.md`. Les dependances, secrets, APK et AAR sont ignores par Git. La CI execute les tests et genere les paquets a telecharger comme artefacts. Aucune publication GitHub n'a ete effectuee.

Le module protege ses propres routes et n'installe pas de garde globale dans l'application hote. Les autres intervenants choisissent explicitement leurs gardes. Voir `INTEGRATION.md` pour un exemple de route protegee.

L'archive **GeoSmart-Beni.zip** contient uniquement les sources a partager et a commiter. Les artefacts locaux sont disponibles dans `livraison/` du dossier sur le Bureau, ignores par Git et exclus du ZIP source. Dans un clone GitHub, les reconstruire ou les recuperer depuis les artefacts de la CI.

## Essayer rapidement

1. Installer Node.js 22 ou plus recent, avec npm.
2. Double-cliquer **Demarrer-demo.cmd**. Au premier lancement, les dependances sont telechargees.
3. Le terminal affiche un telephone administrateur et un mot de passe temporaire aleatoire. Le garder ouvert.
4. Installer l'APK de test du dossier local `livraison/` si disponible, ou ouvrir `mobile/` dans Android Studio et lancer l'application exemple sur un emulateur Android.
5. Dans l'application, ouvrir **Adresse du serveur** : `http://10.0.2.2:3000` pour l'emulateur Android standard. Le serveur ecoute sur le PC uniquement, adresse `127.0.0.1`.
6. La carte peut etre consultee sans compte : cliquer **Actualiser et conserver hors ligne**. Les trois polygones de demonstration sont fictifs.

La demonstration utilise un PostgreSQL emule en memoire (`pg-mem`). Les donnees serveur et les comptes sont effaces a son arret. La file SQLite Android reste sur l'appareil. Apres un redemarrage de la demonstration, recreer les comptes et chantiers. Ce mode est reserve aux essais.

## Parcours de verification

1. Creer un compte dans l'application. Le mot de passe comporte au moins 12 caracteres et au plus 72 octets UTF-8.
2. Relever le code SMS dans le terminal du serveur et verifier le telephone. Le code expire en 10 minutes et accepte au plus cinq tentatives.
3. Ajouter une piece d'identite (JPEG, PNG ou PDF, 5 Mo maximum). Ajouter un justificatif professionnel pour un agent, ou une inscription a l'Ordre pour certifier un geometre.
4. Se deconnecter puis se connecter comme administrateur. Dans Administration, lister les comptes et justificatifs, verifier les pieces via l'API privee, puis valider le compte et son role.
5. Se reconnecter avec le compte valide. La navigation correspond au role. Le serveur verifie toujours les droits, meme si une ancienne navigation est encore affichee sur le telephone.
6. Avec un geometre ou topographe, ouvrir **Mission complete hors ligne**. Le formulaire fournit une fixture demo-v1 ; ce format de test ne remplace pas le contrat de Romuald.
7. Couper le reseau, enregistrer la mission complete, puis fermer et rouvrir l'application. Une entree SQLite conserve tous les sommets ensemble.
8. Retablir le reseau et synchroniser. Un renvoi identique de la meme mission ne cree pas de doublon. Un refus conserve son motif.

La fixture est une mission fictive et ne mesure aucune precision GNSS. Le module n'effectue aucun POST /parcels. Le format reel de mission et son lien avec la parcelle doivent etre convenus avec Romuald et le foncier, selon **COMPATIBILITE-EQUIPE.md**.

## Serveur avec PostgreSQL persistant

Depuis ce dossier, avec Docker installe et demarre :

```powershell
Copy-Item api/.env.example api/.env
# Renseigner de vraies valeurs locales dans api/.env.
# DATABASE_URL doit reprendre le mot de passe PostgreSQL, encode pour une URL.
docker compose --env-file api/.env up -d
cd api
npm ci
npm run build
node --env-file=.env dist/src/bootstrap-admin.js
node --env-file=.env dist/src/main.js
```

Ce serveur utilise PostgreSQL, avec initialisation automatique du schema du module. Le conteneur inclut PostGIS pour l'integration future ; M4 ne fait aucun calcul foncier. Les ports et le volume Docker sont propres a cette livraison. Les adaptateurs carte et terrain sont volontairement non configures dans ce mode : l'API indique leur absence au lieu d'accepter fictivement des donnees.

## Structure

| Chemin | Contenu |
|---|---|
| `api/src/index.ts` | Point d entree public du paquet partage |
| `api/src/auth/` | Authentification, types, decorateur `@Roles`, garde exportee |
| `api/src/admin/` | Comptes, decisions, justificatifs, journal |
| `api/src/sync/` | Transport idempotent et interface terrain |
| `api/src/map/` | Interface de lecture GeoJSON publique |
| `api/src/beni.module.ts` | Module NestJS configurable independant |
| `api/src/demo.ts` | Lanceur autonome avec donnees fictives |
| `api/test/` | Tests HTTP et metier |
| `mobile/beni/` | Bibliotheque Android reutilisable et stockage SQLite |
| `mobile/app/` | Application exemple consommant la bibliotheque |
| `.github/workflows/module-beni.yml` | Tests et construction des artefacts sur GitHub |
| `contracts/openapi.json` | Contrat des routes et modeles d'echange |
| `INTEGRATION.md` | Utilisation du module partage et interfaces entre intervenants |
| `A-COMMITER.md` | Contenu source a commiter et commandes Git |
| `VERIFICATIONS.md` | Resultats observes et limites |

## Limites de cette version

- Les SMS sont simules et inscrits dans le terminal local. Aucun SMS reel n'est envoye.
- La verification du statut sur la carte depend d'une source metier externe. La demonstration affiche uniquement des parcelles fictives.
- Le stockage de justificatifs en base et le journal chaine sont un socle de prototype. Le journal n'est pas une preuve d'inalterabilite contre un administrateur de la base.
- La session est chiffree avec Android Keystore. La file SQLite et la carte restent dans le stockage prive de l'application, sans chiffrement supplementaire.
- Les ecrans administratifs sont utilitaires. La consultation binaire des pieces se fait par la route privee de l'API (voir le contrat et INTEGRATION.md).
- Apres expiration de la session d'inscription d'une heure, un compte encore en attente necessite un nouveau parcours de verification via le support technique. Une reprise autonome d'inscription et une recuperation de mot de passe restent a ajouter.
- L'API est un prototype a integrer et faire recetter. Le lanceur refuse `NODE_ENV=production` tant que les fournisseurs reels, le stockage et les controles d'exploitation ne sont pas configures.

## References techniques

- [Autorisation NestJS](https://docs.nestjs.com/security/authorization)
- [Plugin Android Gradle 9.0 et Kotlin integre](https://developer.android.com/build/releases/agp-9-0-0-release-notes)
- [Planification des travaux reseau Android](https://developer.android.com/reference/android/app/job/JobInfo.Builder)
