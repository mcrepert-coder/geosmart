# Module foncier et journal d'audit

Proprietaire : Samuel (MASSEME Samuel). Contrat : [`contracts/land.yaml`](../../../contracts/land.yaml).

Ce module enregistre les parcelles levees, refuse les chevauchements, garde l'historique des versions, renseigne le statut juridique avec sa source, emet l'attestation de leve en PDF et gere les demandes de leve des agents. Le journal d'audit (`backend/src/audit/`) trace chaque action sensible avec une chaine d'empreintes SHA-256.

GeoSmart ne delivre pas de titre foncier : chaque attestation et chaque page publique porte la mention "Ne vaut pas titre foncier" (RG-09).

## Dossiers

| Dossier | Contenu |
|---|---|
| `backend/src/audit/` | Journal chaine (`audit.log(...)`, `verify()`), routes `/audit`, decorateur `@CurrentActor`, `sql-runner.ts` |
| `backend/src/land/` | Parcelles, versions, statut, bornage, alertes de chevauchement |
| `backend/src/land/geometry/` | Validation du polygone et controle de chevauchement (PostGIS) |
| `backend/src/land/attestation/` | PDF de l'attestation de leve et verification publique |
| `backend/src/land/survey-request/` | Demandes de leve des agents |
| `backend/src/land/http/` | Controleurs NestJS (routes du contrat) |
| `backend/src/*/migrations/` | Migrations TypeORM |
| `web/src/app/parcelle/` | Pages publiques : verifier une parcelle, verifier une attestation |
| `mobile/lib/features/land/` | Ecrans mobiles : creer la parcelle, bornage, attestation, verifier, fiche, demandes de leve |

## Routes

Le role est verifie et journalise par les services, jamais par l'interface seule. Sans utilisateur connecte, les routes protegees repondent 401.

| Methode et chemin | Roles | Exigence |
|---|---|---|
| `GET /parcels?bbox=` | tous les connectes | carte, sans donnee personnelle |
| `POST /parcels` (en-tete `Idempotency-Key`) | GEOMETRE | EF-201, EF-202 |
| `GET /parcels/:id` | tous les connectes (geometre et voisins visibles par ADMIN et l'auteur) | |
| `PATCH /parcels/:id` | GEOMETRE auteur | EF-205, CA-4 |
| `GET /parcels/:id/versions` | ADMIN, GEOMETRE | EF-205 |
| `GET /parcels/:id/status` | public | EF-206 |
| `PUT /parcels/:id/status` | ADMIN (hypothese, voir plus bas) | EF-203 |
| `POST /parcels/:id/attestations` | GEOMETRE auteur et inscrit | EF-204, RG-03 |
| `GET /attestations/:n/pdf` | ADMIN, geometre auteur | |
| `GET /attestations/:n/verify?hash=` | public | EF-204 |
| `GET /survey-requests`, `POST /survey-requests` | AGENT actif (creation), AGENT, GEOMETRE, ADMIN (lecture) | EF-207 |
| `POST /survey-requests/:id/take` | GEOMETRE | EF-207 |
| `GET /overlap-alerts` | ADMIN | RG-02, ecran W3 |
| `GET /audit`, `GET /audit/verify` | ADMIN | RG-10 |

## Regles importantes

- **Identifiant** : `TG-<commune>-<numero>` (ex. `TG-AGO-00457`), compteur par commune. Liste des communes provisoire dans `parcel-id.ts` (`AGO`, `LOM`).
- **Geometrie** : GeoJSON en WGS84 (EPSG:4326), ordre `[longitude, latitude]`. Surface et perimetre calcules en UTM 31N (EPSG:32631). L'application mobile fait le meme calcul (`mobile/lib/features/land/domain/geometry/utm.dart`), verifie contre PostGIS au millimetre.
- **Chevauchement** : refus 409 si l'interieur de deux parcelles se recoupe ; une limite ou un sommet commun est accepte. Tolerance reglable par `LAND_OVERLAP_TOLERANCE_M2` (0 par defaut). Le refus est journalise avec la geometrie proposee, pour l'ecran W3.
- **Certification** : une parcelle est certifiee seulement si le geometre est inscrit a l'Ordre et si toutes les bornes sont en RTK Fixed (RG-03).
- **Doublons** : la cle `Idempotency-Key` (clientId de la file d'envoi) empeche de creer deux fois la meme parcelle (RG-08).
- **Statut juridique** : jamais invente. Tout statut autre que `INCONNU` exige une source et une date ; `TITRE` exige un numero de titre, `EN_LITIGE` une description.
- **Journal** : chaque ligne contient l'empreinte de la precedente. `GET /audit/verify` detecte une ligne modifiee, supprimee ou inseree ; la chaine ne protege pas contre une reecriture complete par un administrateur de la base.

## Tests

Dans `backend/` :

```
npm test              # tests unitaires (Jest)
npm run test:db       # tests sur PostgreSQL + PostGIS avec PGlite, sans Docker
npx tsc --noEmit
npx eslint "src/{land,audit}/**/*.ts"
```

`test:db` lance les fichiers `*.db-spec.ts`. Sur une machine lente, ajouter `--runInBand` pour les lancer un par un.

Dans `web/` : `node --test src/app/parcelle/_lib/parcelle.test.mjs`.

Dans `mobile/` : `flutter test test/features/land` et `flutter analyze lib/features/land`.

Apercu des ecrans mobiles avec des donnees d'exemple : `flutter run -t lib/features/land/preview_main.dart` (ou `flutter build web --release -t lib/features/land/preview_main.dart`).

## Brancher le module (issue #22)

1. Dans `backend/src/app.module.ts` :

   ```ts
   TypeOrmModule.forRoot({
     type: 'postgres',
     url: process.env.DATABASE_URL,
     migrations: [__dirname + '/**/migrations/*.js'],
     migrationsRun: false,
   }),
   AuditModule,
   LandModule,
   ```

   Les services n'utilisent que `DataSource.query()` et `DataSource.transaction()` : aucune entite n'a besoin d'etre declaree.

2. Lancer les migrations dans cet ordre (ordre des horodatages) :
   `1793102400000-audit-log`, `1793102500000-land-parcels`, `1793102600000-land-attestations`, `1793102700000-land-survey-requests`. La base doit avoir l'extension PostGIS (image `postgis/postgis:16-3.4` du `compose.yaml`).

3. Variables d'environnement : `DATABASE_URL`, et facultatif `LAND_OVERLAP_TOLERANCE_M2=0`.

4. Utilisateur connecte (issue #23) : le module comptes place dans `request.user` l'objet `{ id, role, registeredSurveyor, accountActive }`, relu en base a chaque requete (RG-06). `@CurrentActor` le transmet aux services.

5. Autres modules : pour journaliser une action, injecter `AuditService` et appeler
   `audit.log({ actorId, actorRole, action, resourceType, resourceId, result, details }, tx)`.
   Passer `tx` (le runner de la transaction en cours) pour que la ligne soit annulee avec l'action. Les champs `password`, `token`, `secret` et `authorization` sont retires des details.

## Decisions en attente (issue #24)

| Sujet | Hypothese appliquee |
|---|---|
| QR code sur l'attestation | pas de QR code (EF-204, maquettes) ; verification par numero et empreinte |
| Tolerance de chevauchement | 0 m2, limite commune acceptee |
| Qui renseigne le statut juridique | ADMIN seul (`STATUS_EDITOR_ROLES`) |
| Photos du bornage | non enregistrees ; voisins et date seulement |
| Demandes de leve TERMINEE et ANNULEE | etats prevus, transitions non codees |
| Nom du geometre sur l'attestation | identifiant du compte, en attendant le module comptes |
| Liste officielle des communes | liste provisoire `AGO`, `LOM` |
