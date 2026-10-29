# Module foncier et journal (proprietaire : Samuel)

Dossiers couverts : `api/src/land/`, `api/src/audit/`, leurs tests, `contracts/land.yaml`, `mobile/lib/features/land/`, `web/src/app/parcelle/`.

Le detail (routes, regles, branchement, decisions de LGR) est dans `README.md`.

## Fait

1. `contracts/land.yaml` : parcelles, statut, attestation, demandes de leve, alertes, journal. Un test (`http/land-contract.spec.ts`) verifie qu'il decrit exactement les routes codees.
2. `audit/` : `audit.log(...)`, journal chaine SHA-256 en ajout seul (la base refuse UPDATE, DELETE et TRUNCATE sur `audit_log`), `GET /audit` et `GET /audit/verify` (administrateur).
3. Migrations `parcels`, `parcel_versions`, `parcel_counters`, `attestations`, `survey_requests`, `overlap_alert_reviews` (dossiers `migrations/`).
4. Validation : de 3 a 500 sommets, pas d'auto-intersection, toutes bornes RTK Fixed (RG-01).
5. Chevauchement : 409 si les interieurs se recouvrent, limite commune acceptee ; alerte journalisee hors de la transaction annulee, puis examinee par l'administrateur (W3).
6. Versions : chaque modification cree une version ; seul le geometre auteur modifie la limite (CA-4).
7. Attestation de leve en PDF avec la mention "Ne vaut pas titre foncier", sans QR code, verification par numero et empreinte. Le nom et le numero d'Ordre du geometre sont imprimes quand `request.user` les fournit (decision 6).
8. Statut avant achat (route publique, page `web/src/app/parcelle/`), bornage contradictoire, demandes de leve (prise, fin, annulation).
9. Ecrans mobiles : creation, bornage, modification, controle avant attestation, verification, demandes.
10. Securite : toute ecriture exige un compte actif (`accountActive`), quel que soit le role ; un compte suspendu peut encore lire.

## En attente

- Champs `fullName` et `ordreNumber` dans `request.user` pour l'attestation : module comptes de Beni (#23).
- Refus de chevauchement dans la file d'envoi mobile : file de synchronisation de Beni.
- Ecrans d'administration web (alertes W3, journal) : squelette admin de Marrich.
- Photos du bornage : "plus tard" selon LGR.
- Liste officielle des communes : sans reponse de LGR (provisoire `AGO`, `LOM`).
- Note de litige visible sur la page publique : question 8 posee a LGR (#24).
- Limite du nombre de requetes sur les routes publiques : `main.ts` de Marrich.

## Verification

Dans `api/` : `npm test`, `npm run test:db -- --runInBand`, `npx eslint "src/{land,audit}/**/*.ts"`. Tests obligatoires couverts : CA-2 (refus, alerte, voisine acceptee), CA-4, RG-03.

Dans `mobile/` : `flutter test test/features/land` et `flutter analyze lib/features/land`. Dans `web/` : `node --test src/app/parcelle/_lib/parcelle.test.mjs`.

## Depend de

`request.user` pose par le module comptes de Beni (#23). En attendant, les tests HTTP le posent a partir d'un en-tete de test.
