# Module annonces, site web, integration (proprietaire : Marrich)

Dossiers couverts : `api/src/listings/`, `api/test/listings/`, `contracts/listings.yaml`, `mobile/lib/features/listings/`, `web/` (sauf `web/parcelle/`), `docs/`, `.github/`, et les fichiers de configuration partages.

## Etat de l'implementation

- Le contrat Listings definit les routes et les champs du MVP, les permissions,
  les filtres, le stockage photo en PostgreSQL et la localisation approximative.
- L'API Listings fournit la recherche et la fiche publique, la gestion des biens
  par agent, les badges fonciers, les liens de partage et l'upload/suppression
  des photos. Le module est branche dans `app.module.ts`.
- Le catalogue web consomme l'API lorsque `NEXT_PUBLIC_API_URL` est configuree ;
  sans cette variable, il affiche explicitement les donnees de demonstration.
- Le client mobile Listings est integre dans la coque Flutter : catalogue
  public filtre et pagine, fiches publiques, erreurs explicites. Les tests
  Listings et `flutter analyze` passent. La configuration `GEOSMART_API_URL`
  est documentee dans `mobile/README.md`.
- `docs/RECETTE.md` liste les validations CA-2 a CA-7.

## Bloqueurs inter-modules

- `contracts/auth.yaml` ne fournit pas encore `agentCertified`. Le badge agent
  reste donc a faux jusqu'a ce que Beni fournisse une valeur issue de la
  validation administrative.
- Le serveur Auth ne fournit pas encore de verification JWT en production ;
  les ecritures Listings ne peuvent etre recettees qu'avec le contexte
  d'authentification de test jusqu'a son integration.
- Le client mobile est en lecture publique seulement. Les ecrans agent et
  l'upload de photos attendent une authentification reelle et un parcours agent
  defini ; le catalogue ne contourne pas cette dependance.
- L'API et les tests Listings ne remplacent pas la recette de bout en bout
  CA-2 a CA-7 des modules Foncier, Sync et Terrain.

## Verification

Tests Listings : `npm test -- --runInBand listings.service.spec.ts` et
`npm run test:db -- --runInBand listings.db-spec.ts`. La recette complète et
les autres tests de l'equipe sont repertories dans `docs/RECETTE.md`. Avant la
fusion de toute PR de l'equipe, la CI doit etre verte.

## Role d'integrateur

Tu fusionnes, tu ne reecris pas le code des autres. En cas de blocage, tu ouvres une issue au proprietaire ; en cas de desaccord, LGR tranche.
