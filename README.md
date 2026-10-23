# GeoSmart Field - depot de l'equipe

Projet Confluences Togo (Ambassade de France, SCAC), porte par LGR, realise par 4 etudiants.
Representant LGR (decision, validation finale) : ASSOGBA Koffi Ezechiel.
Encadrant pedagogique : M. AMOUZOU.

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
| `mobile/` | Application Android Kotlin | idem |
| `web/` | Site web : annonces (Marrich), verification d'une parcelle (Samuel) | Marrich et Samuel |
| `contracts/` | Contrat d'API (OpenAPI), un fichier par module | chaque proprietaire de module |
| `docs/` | Cahier des charges, responsabilites, workflow Git | Marrich (integrateur) |
| `.github/` | CODEOWNERS, modeles de PR, CI | Marrich |

## Par ou commencer

1. Lire `docs/CAHIER-DES-CHARGES.md` en entier (20 minutes).
2. Lire `docs/CONSIGNES-ETUDIANTS.md` (une page), puis `docs/FEUILLE-DE-ROUTE.md`.
3. Lire `docs/RESPONSABILITES.md` : trouver son nom, ses dossiers, ses livrables.
4. Lire `docs/WORKFLOW-GIT.md` : branches, PR, revue.
5. Lire `docs/REGLES-DE-TRAVAIL.md` : regles communes, fichiers partages, historique propre.

## Regles d'or

- On ne touche que ses propres dossiers. Pour le reste, on ouvre une issue au proprietaire.
- Aucun mot de passe, cle ou jeton dans le depot. Jamais.
- Tout passe par une Pull Request relue par un autre etudiant, puis validee par LGR avant la fusion dans `main`.
- Pas d'argent liquide, pas de materiel hors des regles de Confluences : voir le cahier des charges, section 9.
