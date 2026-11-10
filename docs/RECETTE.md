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
| CA-3 — synchronisation sans perte ni doublon après coupure | Beni / Romuald | `flutter test test/features/gnss/domain/services/sync_queue_processor_test.dart` ; le serveur Sync réel reste à intégrer |
| CA-4 — un agent ne modifie pas une limite | Samuel | `npm run test:db -- --runInBand parcel-update.db-spec.ts` |
| CA-5 — un client ne publie pas | Marrich | `npm test -- --runInBand listings.service.spec.ts` |
| CA-6 — agent actif, parcelle certifiée, annonce publique, badges et partage | Marrich | `npm run test:db -- --runInBand listings.db-spec.ts` ; vérifier aussi la carte publique et le lien de partage dans le navigateur |
| CA-7 — points limités au chantier assigné | Romuald / Beni | `flutter test test/features/gnss/domain/services/sync_queue_processor_test.dart` ; contrôle d'assignation serveur à compléter avec Sync |

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

La recette de bout en bout n'est pas considérée complète tant que le module Auth
ne fournit pas `agentCertified` et qu'un environnement API/Auth partagé ne permet
pas de tester les scénarios CA-3 et CA-7 réels.
