# GeoSmart Field — site web

Application Next.js du projet GeoSmart Field. Marrich maintient le site des
annonces et les intégrations web; le sous-dossier `src/app/parcelle/` relève de
Samuel.

## Développement local

Depuis `web/` :

```powershell
npm ci
npm run dev
```

Le site est servi sur <http://localhost:3000>. Pour valider les changements :

```powershell
npm run lint
npm exec -- tsc --noEmit
npm run build
```

`NEXT_PUBLIC_API_URL` configure l’API utilisée par le navigateur pour vérifier
les parcelles et les attestations. Cette variable est intégrée au build client;
elle doit donc être fournie lors de la construction de l’image Docker ou avant
le build Next.js. Pour Docker Compose, `API_INTERNAL_URL` configure séparément la
cible du proxy Listings entre conteneurs (par défaut `http://backend:3001`).

## Catalogue Listings

Sans `NEXT_PUBLIC_API_URL`, le catalogue n’affiche aucune annonce fictive et
indique que l’API doit être configurée. Pour l’exécuter contre l’API Listings,
définir `NEXT_PUBLIC_API_URL` (par exemple `http://localhost:3001`) avant
`npm run dev` ou `npm run build`. Next.js relaie alors les requêtes publiques
vers l’API. Une erreur de l’API est affichée, sans retour silencieux aux données
de démonstration.

Les données de démonstration du catalogue peuvent être activées uniquement en
développement avec `NEXT_PUBLIC_DEMO_MODE=true`. Elles ne sont jamais activées
dans un build de production. Les parcours agent, administrateur, connexion et
inscription de démonstration utilisent le même réglage ; ils ne constituent ni
une authentification ni un contrôle d’accès réels.

La publication doit passer par l’API avec un jeton émis par le module Auth. La
source du badge « agent certifié » attend encore l’ajout de `agentCertified` au
contrat et à l’identité fournie par Auth.

Les coordonnées de carte Listings sont volontairement approximatives (arrondies
à 0,01 degré) et ne représentent ni les limites ni les bornes d’une parcelle.
Les pages foncières dans `src/app/parcelle/` restent séparées et utilisent leurs
propres routes.
