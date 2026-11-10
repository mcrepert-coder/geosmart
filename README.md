# GeoSmart Field - depot de l'equipe

Projet Confluences Togo (Ambassade de France, SCAC), porte par LGR, realise par 4 etudiants, encadre par un encadrant pedagogique.
Representant LGR (decision, validation finale) : ASSOGBA Koffi Ezechiel.
Encadrant pedagogique : M. Gédéon AMOUSSOU.

## L'equipe (6 personnes)

| Nom | Role |
|---|---|
| ASSOGBA Koffi Ezechiel (LGR) | Decision et validation finale, verification du travail sur GitHub |
| M. Gédéon AMOUSSOU | Encadrant pedagogique : avis sur le travail, signature des livrables pedagogiques |
| SODOU Essodina Romuald | GNSS, NTRIP, terrain, calculs, carte |
| MASSEME Samuel | Foncier : parcelles, chevauchement, journal, attestation |
| AGLAMEY-SEGBEAYA Kanleto Beni | Comptes, administration, synchronisation, location |
| KOUSSOUGBO Kokou Marrich (delegue) | Annonces, site web, integration et revue (chef technique) |

## Ce que fait GeoSmart Field

Un ecosysteme pour securiser le foncier et structurer l'immobilier :
- une application Android de terrain, connectee a un recepteur GNSS RTK (precision de 1 a 2 cm) ;
- un serveur qui refuse les parcelles qui se chevauchent et garde un journal infalsifiable ;
- un site web et une application pour les annonces, les visites et la location ;
- des comptes avec roles (administrateur, geometre, topographe, agent, client).

GeoSmart seconde l'Etat (ANDF). Il ne le remplace pas : le document produit est une "attestation de leve" et ne vaut jamais titre foncier.

## Organisation du depot

| Dossier | Contenu | Responsable principal |
|---|---|---|
| `api/` | Serveur NestJS + PostgreSQL/PostGIS | voir docs/RESPONSABILITES.md (un sous-dossier par personne) |
| `mobile/` | Application Flutter (Dart) avec le module materiel en Kotlin natif (`mobile/android/`) | idem |
| `web/` | Site web : annonces (Marrich), verification d'une parcelle (Samuel) | Marrich et Samuel |
| `contracts/` | Contrat d'API (OpenAPI), un fichier par module | chaque proprietaire de module |
| `docs/` | Cahier des charges, responsabilites, workflow Git | Marrich (integrateur) |
| `.github/` | CODEOWNERS, modeles de PR, CI | Marrich |

## Par ou commencer

1. Lire `docs/CAHIER-DES-CHARGES.md` en entier (20 minutes), puis `docs/ARCHITECTURE.md`.
2. Lire `docs/CONSIGNES-ETUDIANTS.md` (une page), puis `docs/FEUILLE-DE-ROUTE.md`.
3. Lire `docs/RESPONSABILITES.md` : trouver son nom, ses dossiers, ses livrables.
4. Lire `docs/WORKFLOW-GIT.md` : branches, PR, revue.
5. Lire `docs/REGLES-DE-TRAVAIL.md` : regles communes, fichiers partages, historique propre.

## Lancer les services avec Docker

Docker Compose lance l'API NestJS depuis `api/`, le site Next.js et PostgreSQL avec PostGIS :

```powershell
Copy-Item .env.docker.example .env
# Remplacer POSTGRES_PASSWORD et JWT_SECRET par des valeurs aleatoires.
docker compose up --build
```

Le site est disponible sur `http://localhost:3000`, l'API sur `http://localhost:3001` et PostgreSQL sur le port `5433` (hote). Les ports peuvent etre changes dans `.env`. Compose refuse de demarrer si les secrets requis ne sont pas remplaces. Utilisez des secrets differents pour chaque environnement, jamais ceux d'exemple.

Pour arreter les services sans supprimer les donnees, utilisez `docker compose down`. Pour supprimer aussi le volume de la base locale, utilisez `docker compose down -v`.

L'application Flutter reste dans `mobile/` et se lance avec le SDK Flutter de la machine (`cd mobile`, puis `flutter run`). Docker Compose ne construit pas l'APK.

## Regles d'or

- On ne touche que ses propres dossiers. Pour le reste, on ouvre une issue au proprietaire.
- Aucun mot de passe, cle ou jeton dans le depot. Jamais.
- Tout passe par une Pull Request relue par un autre etudiant, puis validee par LGR avant la fusion dans `main`.
- Pas d'argent liquide, pas de materiel hors des regles de Confluences : voir le cahier des charges, section 9.
