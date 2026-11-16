# Architecture de GeoSmart Field

Ce document dit comment le projet est construit. Il se lit avant d'ecrire la moindre ligne de code. Les regles metier sont dans `docs/CAHIER-DES-CHARGES.md`, les responsabilites dans `docs/RESPONSABILITES.md`.

## 1. Vue d'ensemble

```
   Recepteur GNSS (UM982)
        |  Bluetooth (NMEA)            Internet (corrections RTK, NTRIP)
        v                                   |
+---------------------+                     |
| Application mobile  | <-------------------+
| Flutter (Dart)      |
| + Kotlin natif GNSS |
| base locale SQLite  |
+---------+-----------+
          | HTTPS (JSON) : file d'envoi hors ligne, POST /sync
          v
+---------------------+        +-----------------------+
| Serveur API         | -----> | PostgreSQL + PostGIS  |
| NestJS, TypeScript  | <----- | (donnees et geometrie)|
+---------+-----------+        +-----------------------+
          ^
          | HTTPS (JSON)
+---------+-----------+
| Site web (web/)     |
| annonces, verification d'une parcelle
+---------------------+
```

Trois idees a retenir :
1. L'application de terrain n'ecrit jamais directement sur le serveur. Elle enregistre d'abord sur le telephone, puis envoie quand le reseau est la (regle RG-08).
2. Le serveur est le seul a parler a la base de donnees.
3. Chaque module a un proprietaire. Les modules se parlent par des contrats ecrits (`contracts/`), pas en lisant le code des autres.

## 2. Structure des dossiers

```
geosmart/
  api/                       serveur NestJS
    src/
      app.module.ts  main.ts            branche les modules, CORS, helmet (Marrich)
      security/                         limitation des requetes (Marrich)
      auth/  users/  admin/             comptes, pieces, administration (Beni)
      sync/                             POST /sync et chantiers /projects (Beni)
      leasing/                          visites et rappels, baux, loyers, etats des lieux (Beni)
      land/  audit/                     parcelles, chevauchement, attestation, journal (Samuel)
      listings/                         biens, badges, recherche, partage (Marrich)
      <module>/migrations/              migrations TypeORM du module, appliquees au demarrage
      **/*.spec.ts  **/*.db-spec.ts     tests a cote du code (voir section 8)
    test/                    test de demarrage de l'application (e2e)
  mobile/                    application Flutter
    lib/main.dart  lib/app/             composition, coque par role, theme (Marrich)
    lib/features/
      gnss/                             recepteur, NTRIP, missions, chantiers (Romuald)
      map/  report/                     carte des parcelles, plan PDF du leve (Romuald)
      land/                             ecrans foncier et leurs points d'entree (Samuel)
      account/  sync/  leasing/         comptes, envoi hors ligne, location (Beni)
      listings/                         catalogue des annonces (Marrich)
    test/features/                      tests Dart, memes sous-dossiers
    android/app/src/main/kotlin/com/geosmart/field/gnss/
                                        Kotlin natif : Bluetooth, NMEA, NTRIP (Romuald)
  web/                       site web Next.js
    src/app/                            annonces (Marrich), /parcelle (Samuel),
                                        /admin, /agent, /connexion "Mon compte"
    src/app/api/                        relais vers l'API avec cookies httpOnly
                                        (admin, agent, compte)
  contracts/                 un fichier OpenAPI par module
  docs/                      documents de pilotage ; docs/recette/ scripts de recette
  .github/                   CODEOWNERS, CI, modele de PR (Marrich)
```

## 3. Organisation interne d'un module du serveur

Chaque dossier de `api/src/<module>/` suit la meme forme, pour que tout le monde se retrouve dans le code des autres :

```
api/src/land/
  land.module.ts        declare le module
  land.controller.ts    recoit les requetes HTTP, verifie le role, rien d'autre
  land.service.ts       contient les regles metier (le vrai travail)
  land.repository.ts    seul fichier qui parle a la base (requetes SQL)
  dto/                  forme des donnees recues et renvoyees
  NOTES-MODULE.md       ce qu'il y a a faire dans ce module
```

Regles :
- Le controleur ne contient aucune regle metier.
- Le service n'ecrit pas de SQL.
- Un module n'importe jamais le repository d'un autre module. Il appelle son service ou son API.

## 4. Les contrats

Avant de coder une route, son proprietaire ecrit `contracts/<module>.yaml` et ouvre une PR. Le contrat donne : les routes, les roles autorises, les codes d'erreur (401, 403, 409), un exemple de reponse. Les autres peuvent alors coder contre l'exemple, sans attendre le vrai module.

| Contrat | Proprietaire | Utilise par |
|---|---|---|
| `auth.yaml` | Beni | tous (connexion, roles) |
| `sync.yaml` | Beni | Romuald (envoi des bornes) |
| `land.yaml` | Samuel | Romuald (carte), Marrich (biens) |
| `listings.yaml` | Marrich | Beni (visites sur un bien) |
| `leasing.yaml` | Beni | Marrich (site web) |
| `survey.md` | Romuald | Samuel (bornes recues) |

## 5. Donnees (PostgreSQL + PostGIS)

| Table | Contenu | Module |
|---|---|---|
| accounts, phone_verification_codes, refresh_tokens | comptes, codes SMS, jetons de renouvellement | auth (Beni) |
| account_documents | pieces justificatives (privees) | users (Beni) |
| sync_items | elements recus par POST /sync (missions, bornes) | sync (Beni) |
| survey_projects, survey_project_assignments | chantiers et topographes assignes (CA-7) | sync (Beni) |
| visits, leases, lease_rents, inspections, inspection_photos | visites et rappels, baux, loyers, etats des lieux | leasing (Beni) |
| parcels, parcel_versions, parcel_counters | parcelles (geometrie PostGIS), versions, numerotation | land (Samuel) |
| attestations, survey_requests, overlap_alert_reviews | attestations de leve, demandes de leve, examen des alertes | land (Samuel) |
| audit_log | journal chaine (chaque ligne porte l'empreinte de la precedente) | audit (Samuel) |
| properties, property_photos | biens a vendre ou a louer, photos publiques | listings (Marrich) |

- Une table n'est ecrite que par son module. Les autres la lisent par l'API ou en lecture seule (par exemple, le badge "agent certifie" des annonces est recalcule en lisant `accounts`).
- Les changements de base passent par un nouveau fichier `api/src/<module>/migrations/<horodatage>-<description>.ts` (TypeORM), applique au demarrage de l'API. On ne modifie jamais un fichier deja fusionne.
- Les coordonnees sont stockees en WGS84 (SRID 4326). Les calculs de distance et de surface se font en UTM 31N.

## 6. Comptes, roles et securite

- Un seul role par compte : administrateur, geometre, topographe, agent, client (RG-06). Le role est relu en base a chaque requete.
- Chaque route est protegee par `@Roles(...)` (Beni le publie en premier).
- Mots de passe hashes (BCrypt), jetons signes, fichiers limites a 5 Mo (JPEG, PNG, PDF), aucun secret dans le depot (variables d'environnement, voir `.env.example`).
- Un compte en attente de validation peut se connecter pour deposer ses pieces, sans aucun droit d'ecriture (`accountActive = false`) ; toute ecriture verifie que le compte est actif.
- Limitation des requetes par adresse IP (300 par minute, plus strict sur `/auth`) et en-tetes de securite (helmet).
- Actions sensibles journalisees avec `audit.log(...)`, dans la meme transaction que l'action (RG-10).
- Le site ne garde aucun jeton dans le navigateur : ses relais `web/src/app/api/` posent des cookies httpOnly.

## 7. Application mobile (Flutter et Kotlin natif)

- Une seule application, des ecrans differents selon le role. L'interface et toute la logique sont en Flutter (Dart).
- Le Kotlin natif ne fait que le materiel : lien Bluetooth avec le recepteur GNSS, lecture des phrases NMEA, client NTRIP, renvoi des corrections RTCM au recepteur. Il envoie a Flutter un flux de positions avec leur qualite (Fixed, Float, Autonome, satellites, PDOP, sigma H).
- Le contrat entre le Kotlin et le Dart est ecrit dans `contracts/gnss-channel.md` (MethodChannel pour les commandes, EventChannel pour le flux). Romuald l'ecrit en premier.
- Le telephone garde tout dans une base SQLite locale. Le module `sync/` (Beni) envoie les elements en attente avec un identifiant unique `clientId`, pour qu'un renvoi ne cree pas de doublon.
- Seul un point en RTK Fixed peut valider une borne (RG-01). Cette regle est en Dart, donc testee sans telephone ni recepteur.
- Le theme (couleurs, polices, espacements) vient du document de design et vit dans `mobile/lib/app/theme/` (Marrich). Personne ne recopie les couleurs dans son ecran.

## 8. Tests et recette

- Serveur : `npm test` (tests unitaires `*.spec.ts`) et `npm run test:db` (tests `*.db-spec.ts` sur une vraie base PostgreSQL + PostGIS en memoire, PGlite). Les migrations sont rejouees dans chaque test sur base.
- Contrats : `land-contract.spec.ts` et `auth/contracts.spec.ts` echouent si une route codee differe de son contrat (chemin ou code de succes).
- Performance : `overlap-performance.db-spec.ts` verifie le controle de chevauchement en moins de 2 s sur 10 000 parcelles.
- Application : `flutter analyze` et `flutter test` (Flutter 3.50.0, version fixee dans la CI ; les ecrans importent `package:material_ui`, pas `package:flutter/material.dart`).
- Site : `npm run lint`, `npm test` (page /parcelle), `npm run build`, puis `npx tsc --noEmit`.
- CI (`.github/workflows/ci.yml`) : jobs api, mobile, web et messages de commit, sur chaque PR et sur `dev` et `main`.
- Recette de bout en bout : `docs/recette/` rejoue CA-2 a CA-7 sur une pile reelle ; resultats dans `docs/RECETTE.md`.

## 9. Ordre de construction

1. Etape 0 (Marrich, une PR) : le squelette. Un projet NestJS qui demarre, un projet Flutter (avec son dossier `android/`) qui compile, une base PostgreSQL + PostGIS locale (Docker), la CI verte, les dossiers vides avec leurs NOTES-MODULE.md, `.env.example`. Les autres lisent ce document pendant ce temps.
2. Etape 1 (tous) : chacun ecrit son contrat, puis le code de son module avec des donnees simulees pour ses voisins. Beni publie `@Roles` en premier, Samuel publie `audit.log`.
3. Etape 2 (Marrich et tous) : integration dans `app.module.ts`, recette, correction.

Tant que le squelette n'est pas fusionne, personne ne pousse de code dans `api/` ou `mobile/` : on attend, on lit, on prepare son contrat.

## 10. Ce qu'on ne fait jamais

- Modifier le dossier d'un autre (ouvrir une issue a son proprietaire).
- Ecrire un mot de passe, une cle ou un jeton dans un fichier suivi par Git.
- Modifier une migration deja fusionnee.
- Ecrire sur le serveur depuis le terrain sans passer par la file locale.
- Appeler le document "certificat" ou "titre foncier" : c'est une "attestation de leve", avec la mention "Ne vaut pas titre foncier".
