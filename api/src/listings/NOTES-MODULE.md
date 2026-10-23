# Module annonces, site web, integration (proprietaire : Marrich)

Dossiers couverts : `api/src/listings/`, `api/test/listings/`, `contracts/listings.yaml`, `mobile/.../field/listings/`, `web/` (sauf `web/parcelle/`), `docs/`, `.github/`, et les fichiers de configuration partages.

## A faire dans l'ordre

1. J0 (priorite) : squelette NestJS, projet Android, CI GitHub (tests + linter), CODEOWNERS avec les vrais comptes, `.env.example`.
2. Ecrire `contracts/listings.yaml`.
3. Biens rattaches a une parcelle ; publication reservee aux agents actifs (CA-5 : le client est refuse avec "passez par un agent").
4. Badges "parcelle certifiee" et "agent certifie" ; recherche avec filtres.
5. Site web `web/` : liste des annonces, fiche d'un bien ; boutons de partage WhatsApp (message pre-rempli) et TikTok.
6. Integration : brancher chaque module dans `app.module.ts`, fusionner les PR relues, rejouer la recette et ecrire `docs/RECETTE.md`.

## Verification

`npm test -- listings` et `npm run lint`. Tests obligatoires : CA-5, CA-6. Avant la fusion de toute PR de l'equipe, la CI doit etre verte.

## Role d'integrateur

Tu fusionnes, tu ne reecris pas le code des autres. En cas de blocage, tu ouvres une issue au proprietaire ; en cas de desaccord, LGR tranche.
