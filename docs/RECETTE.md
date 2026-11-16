# Recette d'acceptation GeoSmart

Cette recette vérifie les critères CA-2 à CA-7 du cahier des charges. Marrich la
rejoue sur l'intégration ; chaque propriétaire reste responsable des tests de
son module. Les commandes API s'exécutent depuis `api/`, les commandes Flutter
depuis `mobile/`, et les commandes web depuis `web/`.

## Préconditions

- PostgreSQL + PostGIS démarrent avec les migrations de l'API.
- `DATABASE_URL` et `JWT_SECRET` sont définis.
- Auth fournit un utilisateur de test avec rôle actif. `AUTH_DEV_MODE` est
  réservé au développement et ne doit jamais être activé en production.
- Pour tester le catalogue connecté, `NEXT_PUBLIC_API_URL` pointe vers l'API
  avant le démarrage ou le build Next.js.

## Critères et tests automatisés

| Critère | Propriétaire | Vérification |
|---|---|---|
| CA-2 — chevauchement refusé, limite partagée acceptée | Samuel | `npm run test:db -- --runInBand land-parcels.db-spec.ts` et `npm run test:db -- --runInBand land-http.db-spec.ts` |
| CA-3 — synchronisation sans perte ni doublon après coupure | Beni / Romuald | `flutter test test/features/gnss/domain/services/sync_queue_processor_test.dart` et, dans `api/`, `npm run test:db -- --runInBand sync.db-spec.ts` (mission complète, renvoi sans doublon) ; scénario de bout en bout ci-dessous |
| CA-4 — un agent ne modifie pas une limite | Samuel | `npm run test:db -- --runInBand parcel-update.db-spec.ts` |
| CA-5 — un client ne publie pas | Marrich | `npm test -- --runInBand listings.service.spec.ts` |
| CA-6 — agent actif, parcelle certifiée, annonce publique, badges et partage | Marrich | `npm run test:db -- --runInBand listings.db-spec.ts` ; vérifier aussi la carte publique et le lien de partage dans le navigateur |
| CA-7 — points limités au chantier assigné | Romuald / Beni | dans `api/`, `npm run test:db -- --runInBand projects.db-spec.ts sync.db-spec.ts` (refus 403 hors chantier assigné ou clos) et `flutter test test/features/gnss/presentation/new_mission_project_test.dart` ; scénario ci-dessous |

## Scénarios de bout en bout CA-3 et CA-7

A rejouer sur l'API lancée avec Docker (`docker compose up`), avec un administrateur,
un géomètre et deux topographes actifs.

1. Le géomètre crée un chantier : `POST /projects` avec un titre. Réponse 201, statut
   `OUVERT`.
2. Il assigne le premier topographe : `PUT /projects/{projectId}/topographers/{accountId}`.
3. Sur le téléphone du premier topographe, créer une mission sur ce chantier (liste des
   chantiers dans « Nouvelle mission »), lever trois bornes FIXED, terminer la mission.
4. Couper le réseau, lancer l'envoi, rétablir le réseau, relancer : la mission passe à
   `SYNCED` et `GET /projects/{projectId}` indique `missionsCount: 1` (CA-3, pas de
   doublon).
5. Le second topographe, non assigné, envoie une mission sur le même chantier : refus
   403 (CA-7), ligne `SYNC_ITEM` en `DENIED` dans le journal.
6. Le géomètre clôt le chantier (`POST /projects/{projectId}/close`) : un nouvel envoi
   du premier topographe est refusé (403).

## Résultats de l'implémentation Listings

- Dans `api/`, `npm test -- --runInBand listings.service.spec.ts` : réussi,
  7 tests.
- Dans `api/`, `npm run test:db -- --runInBand listings.db-spec.ts` : réussi,
  4 tests, migrations/PostGIS et photos PostgreSQL inclus.
- Dans `api/`, ESLint sur `{src,apps,libs,test}/**/*.ts` avec `--no-fix` :
  aucune erreur, un avertissement préexistant dans `src/main.ts`. `npm run
  build` : réussi.
- `contracts/listings.yaml` : parsing YAML réussi.
- Dans `web/`, `npm run lint`, `npm exec -- tsc --noEmit` et `npm run build` :
  réussis.
- Dans `mobile/`, `flutter test test/features/listings` : réussi, 7 tests
  (filtres, tri, pagination, fiche publique, validation des prix et erreurs
  HTTP/configuration).
- Dans `mobile/`, `flutter analyze` : réussi, aucune anomalie.
- Dans `mobile/`, `flutter build apk --debug` : réussi ; Gradle émet un
  avertissement de compatibilité Kotlin provenant du plugin
  `reactive_ble_mobile`.
- `flutter test` complet : 4 tests de
  `test/features/gnss/presentation/trash_page_test.dart` échouent parce que les
  fixtures ne montrent pas « Mission A ». Ces tests GNSS hors périmètre Listings
  restent à traiter séparément ; les autres tests passent.

La recette de bout en bout n'est pas considérée complète tant que les scénarios
CA-3 et CA-7 ci-dessus n'ont pas été rejoués sur un vrai téléphone. Le badge
"agent certifié" de CA-6 est fourni par le module Auth (`agentCertified`).
