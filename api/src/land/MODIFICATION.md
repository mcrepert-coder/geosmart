# Modification des parcelles et historique

`ParcelUpdateService.update(id, patch, creator)` renvoie la parcelle en nouvelle
version. Le contexte creator est le meme contexte fiable que pour la creation,
fourni par auth apres verification en base ; il ne vient jamais du corps HTTP.

Le brouillon de contrat reserve la modification au geometre auteur actif.
Aucun droit de changement de statut n'est ajoute pour l'administrateur tant
que LGR n'a pas tranche. Les champs modifiables sont label, legalStatus et vertices.
Auteur, chantier, clientId et donnees de rejeu restent inchanges.

## Transaction

Apres validation du patch et emprunt d'une connexion, le controle foncier prend
le verrou global en READ COMMITTED. La lecture courante, le controle de l'auteur
et expectedVersion interviennent sous ce verrou avant les controles spatiaux.
Une version obsolete donne 409 VERSION_CONFLICT avec currentVersion.

Les bornes conservees sont revalidees si vertices n'est pas fourni. La geometrie
candidate est preparee apres cette lecture et controlee en excluant uniquement
la parcelle autorisee. Les recouvrements sont refuses et alertes apres rollback,
comme pour la creation ; le client est rendu avant l'emprunt du journal autonome.

Sans changement effectif, le service donne 400 NO_CHANGE, sans version ni audit.
Sinon surface et perimetre sont recalcules en UTM 31N. Etat courant, instantane
N+1 avec motif et evenement PARCEL_UPDATED sont valides dans le meme COMMIT.
Une erreur SQL, d'audit ou de contrainte differee annule l'ensemble.

Un indicateur in_conflict existant est conserve : changer le statut ne cloture
pas implicitement une alerte ou une procedure de conflit. EN_LITIGE impose aussi
inConflict=true. La procedure explicite de resolution reste a definir avec LGR.
La certification de la reponse utilise l'inscription courante du contexte fiable.

## Historique

`ParcelQueryService.versions(id, reader)` renvoie les versions en ordre decroissant,
avec geometrie, empreinte, acteur, date et motif si present. L'acces est reserve
aux geometres et administrateurs actifs, conformement au contrat ; les autres
roles sont refuses avant la recherche de la parcelle.

Les instantanes precedents et creation_response ne sont jamais modifies. Le
rejeu de creation renvoie toujours la reponse initiale, meme apres une modification.
Les geometries historiques sont renvoyees avec 17 decimales et les dates en UTC.

## Integration restante

Ces services ne creent pas les routes PATCH /parcels/{id} et
GET /parcels/{id}/versions. Il reste a raccorder controleurs, roles et pool commun.
La concurrence multi-connexions et les performances du verrou global doivent
etre verifiees sur PostgreSQL cible ; les tests PGlite ne prouvent pas ces points.
