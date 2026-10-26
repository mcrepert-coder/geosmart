# Service de creation des parcelles

`ParcelCreationService.create(input, creator)` renvoie `{ status, parcel }` :
201 pour une creation, 200 pour une reprise de la requete initiale.
Il ne constitue pas encore une route HTTP ni un module NestJS integre.

## Contexte et integration

Le service recoit le pool PostgreSQL commun, une horloge et, facultativement,
une fabrique d'identifiants. Par defaut, l'identifiant est `PRC-<UUID>` ; aucun
format sequentiel supplementaire n'est impose par le contrat.

`creator` contient id, role, active et surveyorRegistered. Ces valeurs sont
fournies par le module comptes apres verification en base a chaque requete.
Elles ne viennent jamais du corps HTTP. Un geometre actif non inscrit peut creer
une parcelle, mais sa reponse porte certified=false. Le service ne remplace pas
la verification du jeton, le decorateur Roles ni les donnees de certification.

Le futur controleur transforme les erreurs metier (status, code, message et
details eventuels) en reponses du contrat ; les pannes SQL restent des erreurs
internes. Les deux chemins API et sync devront appeler le meme service. La file
locale reste obligatoire pour les donnees venant du terrain.

## Traitement

1. Verifier le contexte et les champs du contrat, copier la requete complete,
   valider les bornes et preparer le GeoJSON et son empreinte.
2. Emprunter un client, ouvrir READ COMMITTED et verrouiller les ecritures foncieres.
3. Rechercher la cle (auteur, clientId) avant le controle spatial : une reprise
   identique retourne creation_response sans nouvelle version ni nouvel audit.
   Un contenu different donne 409 IDEMPOTENCY_CONFLICT.
4. Verifier la geometrie et les voisins. Un recouvrement annule la transaction,
   rend le client au pool, puis journalise l'alerte dans sa propre transaction.
   Cette liberation evite de bloquer un pool limite a une connexion.
5. Calculer surface et perimetre avec ST_Transform(..., 32631), sans arrondi
   metier. Creer l'etat courant, la version 1 et PARCEL_CREATED ensemble.
6. COMMIT avant de retourner le succes ; rendre le client dans tous les cas.

Le stockage de certified dans la reponse initiale est historique : un rejeu
ne constitue jamais une consultation du statut courant avant achat.
Les decisions d'idempotence encore proposees dans le contrat restent a convenir
avec Beni. Le service n'accorde aucun droit admin supplementaire.

## Verification et limites

Les tests utilisent le vrai service d'audit, le SQL foncier et PostGIS embarque.
Le pool de test refuse un second emprunt avant liberation du premier client.
La concurrence multi-connexions et les performances restent a verifier sur
PostgreSQL cible ; le verrou global est une premiere strategie de coherence.
Il reste aussi a integrer le pool, les roles et le controleur via Marrich et Beni.
