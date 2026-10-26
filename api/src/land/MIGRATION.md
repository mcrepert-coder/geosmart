# Preparation du stockage foncier

Migration : `api/migrations/202610241300_land_parcels.sql`.

La migration a ete executee avec succes sur PGlite avec son extension PostGIS
dans une base en memoire isolee : 95 tests d'integration passent sous Jest.
Une verification sur le serveur PostgreSQL/PostGIS cible reste necessaire,
notamment pour les droits de deploiement et les acces concurrents multi-connexions.
L'integrateur active PostGIS et execute la migration dans une transaction avec
le moteur commun. Aucun choix d'ORM ni schema d'un autre module n'est impose.

## Structure

- `parcels` : etat courant, geometrie WGS84 et index GIST, bornes avec leurs
  sources, mesures, auteur et cle d'idempotence par auteur.
- `parcel_versions` : instantanes complets, identifies par parcelle et version.
  La version courante doit exister a la fin de la transaction.
- `attestations` : reference a une version immuable, identite professionnelle
  a l'emission, mention obligatoire et reference interne du fichier PDF.
  Surface, perimetre, bornes et empreinte viennent de cette version.

La requete initiale est conservee pour comparer les renvois. `creation_response`
conserve le corps complet de la reponse initiale, y compris le badge de certification
au moment de la creation. Le service devra le renseigner dans la transaction de
creation et le rejouer sans recalcul en 200, apres controle des droits. Cette copie
historique ne remplace pas le statut courant pour une consultation avant achat.
Le trigger interdit la modification de la requete, de la reponse et de la cle de
rejeu. Les sources restent dans les bornes JSONB. Le badge courant depend du module
comptes. L'auteur et le chantier sont des identifiants opaques,
sans cle etrangere vers des tables encore non definies par leurs proprietaires.

## Verification a effectuer avec une base de test

1. Executer la migration atomiquement apres activation de PostGIS.
2. Inserer une parcelle et sa version 1 dans la meme transaction : succes.
3. Inserer une parcelle sans sa version : refus au commit.
4. Reutiliser la cle auteur/clientId : refus ; meme clientId et autre auteur :
   cle distincte, sans aucun droit d'acces implicite.
5. Refuser geometries vides, invalides, hors coordonnees WGS84 ou mauvais SRID.
6. Refuser statuts inconnus, empreintes mal formees, mesures non positives ou
   non finies et moins de trois bornes.
7. Creer une version 2 avec motif, puis mettre a jour l'etat courant dans la
   meme transaction ; verifier la conservation de la version 1.
8. Refuser modification, suppression et TRUNCATE des historiques et attestations.
9. Refuser une attestation sans version existante ou sans la mention obligatoire.
10. Verifier ensuite dans le service RTK Fixed, bornes/geometrie, autorisations,
    chevauchements concurrents, mesures, empreintes et atomicite avec l'audit.
11. Refuser toute modification des donnees de rejeu ; apres changement du statut
    courant, verifier que le renvoi utilise toujours la reponse initiale conservee.

Les contraintes SQL ne remplacent pas ces controles metier. Les alertes de refus
auront leur transaction independante ; les evenements des operations acceptees
doivent etre atomiques avec l'ecriture metier. Les droits admin, le stockage PDF
et les autres decisions ouvertes du contrat ne sont pas resolus par ce schema.

## Tests d'integration (api/test/land/land-migration.spec.ts)

La migration est executee dans une transaction sur une base de test isolee :
- `LAND_TEST_DATABASE_URL` : PostgreSQL/PostGIS de test dont le nom de base contient
  "test" ; un schema jetable `land_it_<horodatage>_<pid>` est cree puis supprime.
  `DATABASE_URL` n'est jamais utilisee.
- sinon PGlite (PostgreSQL embarque en memoire) avec PostGIS, si
  `@electric-sql/pglite` et `@electric-sql/pglite-postgis` sont installes.
- sans moteur disponible, la suite est ignoree avec un message.

PGlite exige `NODE_OPTIONS=--experimental-vm-modules` sous Jest :

    NODE_OPTIONS=--experimental-vm-modules npx jest test/land/land-migration.spec.ts

Chaque refus s'execute dans sa propre transaction annulee ; les contraintes
differees sont verifiees par un vrai COMMIT.

## Resultat de verification du 24 octobre 2026

- Moteur : PGlite en memoire avec PostGIS, sans connexion a une base existante.
- Execution : Jest et ts-jest installes dans un dossier temporaire hors du depot,
  Node lance avec `--experimental-vm-modules`.
- Resultat : 1 suite reussie, 95 tests reussis, aucun test ignore.
- Aucun package.json, verrou de dependances ou fichier CI du projet modifie.
- Cette execution ne valide pas les routes, les controles metier du service,
  la concurrence multi-connexions ni le deploiement sur un serveur PostgreSQL.

## Ce que la base garantit

- trois tables, geometrie Polygon SRID 4326 et index GIST ;
- parcelle et version courante ecrites dans la meme transaction (refus au COMMIT) ;
- geometries non vides, valides, de surface positive, sans trou, dans le domaine WGS84 ;
- statuts du contrat, empreintes hexadecimales minuscules de 64 caracteres,
  mesures finies et positives, bornes en tableau d'au moins 3 elements ;
- unicite (author_id, client_id) ; donnees de rejeu immuables ;
- versions et attestations en ajout seul (UPDATE, DELETE, TRUNCATE refuses) ;
- attestation rattachee a une version existante, mention "Ne vaut pas titre foncier".

Une geometrie sans SRID recoit celui de la colonne (comportement PostGIS) : le
service doit toujours construire la geometrie avec un SRID explicite.

## Ce que le service doit controler

Roles et inscription a l'Ordre, RTK Fixed et contenu de chaque borne, coherence
bornes/geometrie, calcul des empreintes et des mesures UTM 31N, progression des
versions (N+1 et etat courant identique a l'instantane), chevauchements y compris
concurrents, comparaison des reprises et atomicite avec l'audit.
