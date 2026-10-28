# Module foncier et journal (proprietaire : Samuel)

Dossiers couverts : `api/src/land/`, `api/src/audit/`, leurs tests, `contracts/land.yaml`, `mobile/lib/features/land/`, `web/parcelle/`.

## A faire dans l'ordre

1. Ecrire `contracts/land.yaml` d'abord (parcelles, statut, attestation, demandes de leve) et ouvrir une PR.
2. Module `audit/` en premier (les autres en ont besoin) : `audit.log(action, acteur, details)`, journal chaine (chaque ligne contient le SHA-256 de la precedente).
3. Migration `AAAAMMJJHHMM_land_parcels.sql` : `parcels` (geometry(Polygon, 4326), index GIST), `parcel_versions`, `attestations`.
4. Validation : au moins 3 sommets, pas d'auto-intersection (ST_IsValid), toutes bornes RTK Fixed (RG-01).
5. Chevauchement : `ST_Overlaps`/`ST_Intersects` moins les limites communes ; 409 + alerte ecrite dans une transaction separee (sinon elle disparait avec le rollback).
6. Versions : toute modification cree une version ; seul l'auteur geometre ou l'admin modifie (CA-4).
7. Attestation PDF : mention "Ne vaut pas titre foncier", pas de QR code, mots "attestation de leve" (jamais certificat ni titre).
8. Statut avant achat (API et page publique `web/parcelle/`), bornage contradictoire, demandes de leve.

## Verification

`npm test -- land audit` et `npm run lint`. Tests obligatoires : CA-2 (refus + alerte + voisine acceptee), CA-4, RG-03.

## Depend de

`@Roles` de Beni (en attendant, un garde simule documente dans le contrat).
