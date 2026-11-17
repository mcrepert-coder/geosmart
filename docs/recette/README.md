# Scripts de recette de bout en bout

Ces scripts rejouent les criteres d'acceptation sur une pile reelle (API, base
PostGIS et site), avec de vrais comptes crees par l'API et valides par
l'administration. Ils completent les tests automatiques listes dans
`docs/RECETTE.md`. Node 22 ou plus recent (fetch, FormData, Blob).

| Script | Verifie |
|---|---|
| `serveur-ca2-ca3-ca4-ca7.mjs` | CA-2 (chevauchement refuse, alerte, voisine acceptee), CA-3 (renvoi sans doublon), CA-4 (agent refuse), CA-7 (chantier assigne, chantier clos), chaine du journal |
| `annonces-ca5-ca6.mjs` | CA-5 (client refuse), CA-6 (agent certifie, parcelle certifiee, badges, carte, partage) par l'espace agent du site, retrait du badge a la suspension |
| `nouvel-inscrit.mjs` | Parcours d'un nouvel inscrit : connexion en attente, depot des pieces par "Mon compte", validation |

## Preparer la pile

1. Base locale PostGIS : `docker compose --profile local-db up -d db`.
   Utiliser une base locale de recette et definir `DATABASE_URL` sur
   `localhost:5433`; ne pas lancer ces scripts sur la base Aiven de production.
2. API, depuis `api/` : `npm run build`, puis la lancer en ecrivant son journal
   dans un fichier (les codes SMS simules y sont lus) :

   ```bash
   DATABASE_URL=... JWT_SECRET=... PORT=3011 \
   WEB_PUBLIC_URL=http://localhost:3020 API_PUBLIC_URL=http://localhost:3011 \
   node dist/main.js > api.log 2>&1 &
   ```

3. Administrateur de recette : `ADMIN_PHONE=... ADMIN_INITIAL_PASSWORD=... node dist/auth/bootstrap-admin.js`
   (numero et mot de passe de test, jamais ceux de production).
4. Site, depuis `web/` (pour les deux derniers scripts) :

   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:3011 NEXT_PUBLIC_DEMO_MODE=false npm run build
   API_INTERNAL_URL=http://localhost:3011 ADMIN_COOKIE_SECURE=false npx next start -p 3020
   ```

## Lancer

```bash
export RECETTE_ADMIN_PHONE=+228...      # administrateur de recette
export RECETTE_ADMIN_PASSWORD=...
export RECETTE_API_LOG=chemin/vers/api.log
export API=http://localhost:3011 WEB=http://localhost:3020
node docs/recette/serveur-ca2-ca3-ca4-ca7.mjs
node docs/recette/annonces-ca5-ca6.mjs
node docs/recette/nouvel-inscrit.mjs
```

Chaque script affiche une ligne par verification et se termine en erreur si
l'une echoue. Les limites de requetes de l'API (5 inscriptions par minute)
imposent d'attendre une minute entre deux scripts.

Les scripts creent des comptes et des parcelles : a lancer sur une base de
recette, jamais sur la production.
