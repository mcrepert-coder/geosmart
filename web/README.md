# GeoSmart Field — site web

Application Next.js du projet GeoSmart Field. Marrich maintient le site des
annonces et les intégrations web ; le sous-dossier `src/app/parcelle/` relève de
Samuel.

## Développement local

Depuis `web/` :

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Le site est servi sur <http://localhost:3000>. Pour valider les changements :

```powershell
npm run lint
npm exec -- tsc --noEmit
npm test
npm run build
```

`NEXT_PUBLIC_API_URL` configure l’API utilisée par le navigateur. Cette variable
est intégrée au build client ; elle doit donc être fournie lors de la
construction de l’image Docker ou avant le build Next.js. Pour Docker Compose,
`API_INTERNAL_URL` configure séparément la cible du proxy Listings et des routes
serveur/proxy entre conteneurs (par défaut `http://backend:3001`).
`WEB_ORIGIN` est l’origine publique du site web : les routes de modification
refusent les requêtes dont l’`Origin` ne correspond ni à cette valeur ni à celle
de la requête.
`ADMIN_COOKIE_SECURE` doit rester à `true` derrière HTTPS en production ; sa
valeur `false` dans `.env.example` est réservée au Compose local servi en HTTP.

## Catalogue public (`/`)

- Avec `NEXT_PUBLIC_API_URL` : Next.js relaie les requêtes publiques vers l’API
  Listings (`/listings-api`). Le catalogue affiche les annonces réelles (filtres,
  carte, fiche, partage). Une erreur de l’API est affichée, sans retour silencieux
  aux données de démonstration.
- Sans `NEXT_PUBLIC_API_URL` : aucune annonce fictive n’est affichée et le site
  indique que l’API Listings doit être configurée.
- Données de démonstration du catalogue : uniquement en développement avec
  `NEXT_PUBLIC_DEMO_MODE=true` (jamais en build de production).

Les coordonnées de carte Listings sont volontairement approximatives (arrondies
à 0,01 degré) et ne représentent ni les limites ni les bornes d’une parcelle.

## Comptes, connexion et espaces

- **Inscription** (`/inscription`) : création de compte et vérification du
  téléphone via les routes d’authentification de l’API. Le rôle est attribué
  après vérification par l’administration. L’envoi SMS est actuellement simulé et
  le code apparaît dans les journaux du serveur API.
- **Connexion** (`/connexion`) :
  -   mode relié API : ouvre « Mon compte » (connexion par mot de passe). Tout
    compte actif ou en attente peut se connecter pour déposer ses pièces
    justificatives ; l’accès agent/admin dépend ensuite du rôle et de l’état du
    compte.
  - mode démonstration (`NEXT_PUBLIC_DEMO_MODE=true`, hors production) : parcours
    simulé (OTP/code de démo) permettant d’ouvrir des espaces de démonstration.
- **Mon compte** : consultation du compte, dépôt/liste des pièces justificatives
  (JPEG/PNG/PDF, 5 Mo max) transmises à l’administration.
- **Devenir agent ou géomètre** (`/devenir-agent`) : parcours guidé en
  démonstration. En mode relié API, le dépôt de dossier professionnel dédié n’est
  pas encore exposé sur ce parcours : créez un compte puis déposez vos pièces
  depuis « Mon compte » pour validation/attribution du rôle par l’administration.
- **Espace agent** (`/agent`) : accès aux comptes `AGENT`. En mode relié API,
  gestion des biens de l’agent (création/brouillon/publication/retrait, photos,
  partage) via les routes/proxy Listings ; la publication est soumise aux règles
  de l’API (compte actif, parcelle non litigieuse, etc.). `/agent/loyers` n’est
  pas encore relié à l’API sur le site (gestion disponible dans l’application
  mobile ; suivi simulé en démonstration).
- **Administration** (`/admin`) : connexion administrateur via l’API. En mode
  relié, les fonctions connectées incluent notamment le tableau de bord, la
  gestion des comptes et de leurs justificatifs, le journal d’audit (avec
  vérification de chaîne) et les alertes selon les routes disponibles ; certaines
  pages (carte, parcelles, attestations, etc.) restent indisponibles tant qu’elles
  ne sont pas prises en charge par une API adaptée.

## Pages foncières (`/parcelle`)

Les pages de vérification de parcelle et d’attestation restent séparées du
catalogue et utilisent leurs propres routes/contrats (`NEXT_PUBLIC_API_URL` pour
les données réelles, données d’exemple possibles en mode démo selon la
configuration).
