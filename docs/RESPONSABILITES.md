# Qui fait quoi (et dans quels dossiers)

Regle unique : chacun ne modifie que les dossiers de sa ligne. Le fichier `.github/CODEOWNERS` fait respecter cette regle sur GitHub : une PR qui touche le dossier d'un autre demande son accord.

Equipe : 4 etudiants, un encadrant pedagogique (M. Gédéon AMOUSSOU) et LGR (ASSOGBA Koffi Ezechiel).

Charge repartie : Marrich a le moins de code (il integre et il fusionne), les trois autres ont chacun un bloc metier complet.

## Comptes GitHub

| Nom | Compte GitHub |
|---|---|
| SODOU Essodina Romuald | Moruald001 |
| MASSEME Samuel | NegusMasseme |
| AGLAMEY-SEGBEAYA Kanleto Beni | y6502192-spec |
| KOUSSOUGBO Kokou Marrich | Gold1705 |
| ASSOGBA Koffi Ezechiel (LGR) | mcrepert-coder |

## Romuald (SODOU Essodina Romuald) - GNSS, terrain, carte

Dossiers que je possede :
- `mobile/.../field/gnss/`, `.../survey/`, `.../cogo/`, `.../map/` et leurs tests
- `contracts/survey.md`

Mes livrables :
1. Lecture Bluetooth SPP + analyse NMEA (EF-101 a EF-103), simulateur RTKLIB pour tester sans materiel.
2. Client NTRIP avec reconnexion (EF-104), changement de source a chaud (EF-105).
3. Enregistrement local de chaque borne avec precision, satellites, PDOP (EF-106, RG-01, RG-04).
4. Calculs distance / perimetre / surface en UTM 31N, plan PDF local (EF-107, EF-108).
5. Chantiers et assignation d'un topographe cote terrain (EF-109, CA-7).
6. Carte des parcelles coloree par statut, avec filtres (EF-406).
7. CA-1 : protocole de mesure et compte rendu des 10 passages (des que le materiel est la).

J'expose : l'interface Kotlin `SurveyPoint` / `SurveySession`. Je consomme : `POST /sync` de Beni pour envoyer mes bornes, `GET /parcels` de Samuel pour la carte.

## Samuel (MASSEME Samuel) - foncier et journal

Dossiers que je possede :
- `api/src/land/`, `api/src/audit/` et leurs tests
- `contracts/land.yaml`
- `mobile/.../field/land/` et ses tests
- `web/parcelle/` (page publique de verification d'une parcelle)

Mes livrables :
1. Tables `parcels`, `parcel_versions`, `attestations`, `audit_log` (migrations `..._land_...`, `..._audit_...`).
2. Validation geometrique et chevauchement PostGIS, refus 409, alerte (EF-201, EF-202, RG-02).
3. Statuts juridiques, bornage contradictoire (EF-203, EF-208).
4. Versions et journal chaine par empreintes (EF-205, RG-10).
5. Attestation de leve en PDF avec la mention obligatoire, sans QR code (EF-204, RG-03, RG-09).
6. Consultation du statut avant achat (API + page web publique) et demandes de leve des agents (EF-206, EF-207).
7. Tests CA-2 et CA-4.

J'expose : `GET /parcels`, `POST /parcels`, `GET /parcels/:id/status`, la fonction `audit.log(...)` pour les autres modules. Je consomme : `@Roles` de Beni.

## Beni (AGLAMEY-SEGBEAYA Kanleto Beni) - comptes, administration, synchronisation, location

Dossiers que je possede :
- `api/src/auth/`, `api/src/users/`, `api/src/admin/`, `api/src/sync/`, `api/src/leasing/` et `api/test/` correspondants
- `contracts/auth.yaml`, `contracts/sync.yaml`, `contracts/leasing.yaml`
- `mobile/.../field/account/`, `.../sync/`, `.../leasing/` et leurs tests

Mes livrables :
1. Inscription, code SMS simule, connexion, jetons, blocage apres 5 echecs (EF-401, EF-407).
2. Roles et decorateur `@Roles(...)` ; role relu en base a chaque requete (RG-06). A livrer en premier.
3. Pieces justificatives et acces prive aux pieces d'identite (EF-403).
4. Espace administrateur : validation, rejet, suspension (EF-404).
5. Synchronisation hors ligne : file locale, `clientId`, reprise, refus avec motif (EF-405, RG-08, CA-3).
6. Navigation par role dans l'application (EF-402).
7. Location : visites avec rappel, etats des lieux signes, baux et loyers (EF-305 a EF-307). Le paiement mobile reste une interface vide (EF-309, phase 3).

J'expose : `@Roles`, `POST /sync`. Je consomme : `audit.log(...)` de Samuel, `GET /properties/:id` de Marrich pour rattacher une visite a un bien.

## Marrich (KOUSSOUGBO Kokou Marrich, delegue) - annonces, site web des annonces, integration

Dossiers que je possede :
- `api/src/listings/`, `api/test/listings/`
- `contracts/listings.yaml`
- `mobile/.../field/listings/` et ses tests
- `web/` (sauf `web/parcelle/`)
- `docs/`, `.github/`, `api/src/app.module.ts`, `api/package.json`, `mobile/build.gradle.kts`, `mobile/settings.gradle.kts`

Mes livrables :
1. Squelette du depot, CI, CODEOWNERS (jalon J0).
2. Biens rattaches a une parcelle, publication reservee aux agents actifs (EF-301, RG-05, CA-5).
3. Badges "parcelle certifiee" / "agent certifie" et recherche avec filtres (EF-302, EF-303, CA-6).
4. Site web des annonces (EF-304) et partage WhatsApp / TikTok (EF-308).
5. Integration : brancher les modules dans `app.module.ts`, fusionner les PR relues.
6. Recette : `docs/RECETTE.md`, un test par critere CA-2 a CA-7 (il rejoue, il n'ecrit pas les tests des autres).

Je ne tranche pas seul les decisions de fond : elles vont a LGR.

## LGR (ASSOGBA Koffi Ezechiel) - decision et validation

- Verifie sur GitHub le travail de chacun (PR, tests verts, jalons).
- Valide la fusion finale dans `main` et les decisions d'orientation.
- N'ecrit pas de code.

## Table des fichiers partages et du seul droit d'ecriture

| Fichier | Seul ecrivain | Les autres |
|---|---|---|
| `api/src/app.module.ts` | Marrich | demandent par issue d'ajouter leur module |
| `api/package.json` | Marrich | demandent par issue une nouvelle dependance |
| `mobile/build.gradle.kts` | Marrich | idem |
| `contracts/<module>.yaml` | proprietaire du module | lisent |
| `api/migrations/` | chacun ajoute son fichier prefixe par son module | ne modifient jamais celui d'un autre |
| `docs/` | Marrich | proposent par PR |

## Dependances entre personnes

| Pour que... | ...il faut d'abord |
|---|---|
| Samuel protege `POST /parcels` | Beni livre `@Roles` |
| Marrich rattache un bien a une parcelle | Samuel livre `GET /parcels/:id/status` (ou un simulateur dans son contrat) |
| Romuald envoie ses bornes | Beni livre `POST /sync` |
| Romuald affiche la carte | Samuel livre `GET /parcels` |
| Beni rattache une visite a un bien | Marrich livre `GET /properties/:id` |
| Les autres journalisent | Samuel livre `audit.log(...)` |

En attendant, chacun code contre les donnees simulees decrites dans le contrat du module voisin.

## Encadrant pedagogique (M. Gédéon AMOUSSOU) - avis et signature

- Donne un avis sur le travail des etudiants et sur les livrables pedagogiques.
- Signe la note de validation du budget et les documents qui le demandent.
- Ne decide pas des achats ni de l'orientation (c'est LGR) et n'ecrit pas de code.
- N'a pas de compte sur le depot GitHub : il n'y intervient pas.
