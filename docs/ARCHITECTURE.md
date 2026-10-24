# Architecture de GeoSmart Field

Ce document dit comment le projet est construit. Il se lit avant d'ecrire la moindre ligne de code. Les regles metier sont dans `docs/CAHIER-DES-CHARGES.md`, les responsabilites dans `docs/RESPONSABILITES.md`.

## 1. Vue d'ensemble

```
   Recepteur GNSS (UM982)
        |  Bluetooth (NMEA)            Internet (corrections RTK, NTRIP)
        v                                   |
+---------------------+                     |
| Application Android | <-------------------+
| Kotlin + Compose    |
| base locale (Room)  |
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
      app.module.ts          branche tous les modules (Marrich)
      auth/  users/  admin/  sync/      comptes, roles, synchronisation (Beni)
      leasing/                          visites, etats des lieux, baux, loyers (Beni)
      land/  audit/                     parcelles, chevauchement, journal (Samuel)
      listings/                         biens, badges, recherche (Marrich)
      common/                           petits outils partages (Marrich)
    migrations/              fichiers SQL, un par changement de base
    test/                    tests du serveur, un sous-dossier par module
  mobile/                    application Android
    app/src/main/java/com/geosmart/field/
      gnss/  survey/  cogo/  map/       recepteur, bornes, calculs, carte (Romuald)
      land/                             ecrans foncier (Samuel)
      account/  sync/  leasing/         comptes, envoi hors ligne, location (Beni)
      listings/                         ecrans annonces (Marrich)
  web/                       site web (annonces : Marrich, web/parcelle : Samuel)
  contracts/                 un fichier OpenAPI par module
  docs/                      documents de pilotage (Marrich)
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

| Table | Contenu | Proprietaire |
|---|---|---|
| users, documents, sessions | comptes, pieces justificatives, jetons | Beni |
| visits, leases, payments, inspections | visites, baux, loyers, etats des lieux | Beni |
| projects, survey_points | chantiers, bornes mesurees | Romuald |
| parcels, parcel_versions, attestations, audit_log | parcelles (geometrie), versions, attestations, journal | Samuel |
| properties | biens a vendre ou a louer | Marrich |

- Une table n'est ecrite que par son module. Les autres la lisent par l'API ou par une vue en lecture seule.
- Les changements de base passent par un nouveau fichier dans `api/migrations/` nomme `AAAAMMJJHHMM_<module>_<description>.sql`. On ne modifie jamais un fichier deja fusionne.
- Les coordonnees sont stockees en WGS84 (SRID 4326). Les calculs de distance et de surface se font en UTM 31N.

## 6. Comptes, roles et securite

- Un seul role par compte : administrateur, geometre, topographe, agent, client (RG-06). Le role est relu en base a chaque requete.
- Chaque route est protegee par `@Roles(...)` (Beni le publie en premier).
- Mots de passe hashes (BCrypt), jetons signes, fichiers limites a 5 Mo, aucun secret dans le depot (variables d'environnement, voir `.env.example`).
- Actions sensibles journalisees avec `audit.log(...)` (Samuel).

## 7. Application Android

- Une seule application, des ecrans differents selon le role.
- Le telephone garde tout dans Room (SQLite). Le module `sync/` (Beni) envoie les elements en attente avec un identifiant unique `clientId`, pour qu'un renvoi ne cree pas de doublon.
- Le recepteur GNSS arrive par Bluetooth sous forme de phrases NMEA (module `gnss/` de Romuald). Les corrections RTK viennent d'Internet (client NTRIP) et repartent vers le recepteur.
- Seul un point en RTK Fixed peut valider une borne (RG-01).

## 8. Ordre de construction

1. Etape 0 (Marrich, une PR) : le squelette. Un projet NestJS qui demarre, un projet Android qui compile, une base PostgreSQL + PostGIS locale (Docker), la CI verte, les dossiers vides avec leurs NOTES-MODULE.md, `.env.example`. Les autres lisent ce document pendant ce temps.
2. Etape 1 (tous) : chacun ecrit son contrat, puis le code de son module avec des donnees simulees pour ses voisins. Beni publie `@Roles` en premier, Samuel publie `audit.log`.
3. Etape 2 (Marrich et tous) : integration dans `app.module.ts`, recette, correction.

Tant que le squelette n'est pas fusionne, personne ne pousse de code dans `api/` ou `mobile/` : on attend, on lit, on prepare son contrat.

## 9. Ce qu'on ne fait jamais

- Modifier le dossier d'un autre (ouvrir une issue a son proprietaire).
- Ecrire un mot de passe, une cle ou un jeton dans un fichier suivi par Git.
- Modifier une migration deja fusionnee.
- Ecrire sur le serveur depuis le terrain sans passer par la file locale.
- Appeler le document "certificat" ou "titre foncier" : c'est une "attestation de leve", avec la mention "Ne vaut pas titre foncier".
