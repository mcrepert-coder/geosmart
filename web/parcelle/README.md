# Page publique de verification d'une parcelle (EF-206)

Proprietaire : Samuel. Page statique, sans dependance ni etape de construction.

- `index.html`, `parcelle.css` : la page.
- `statut.mjs` : logique sans DOM (validation de l'identifiant et de la reponse,
  modele d'affichage, copie locale, repli hors ligne). Testee.
- `page.mjs` : liaison avec la page. Tout texte passe par `textContent`.

## Fonctionnement

La page appelle `GET /parcels/{id}/status` (contracts/land.yaml) sur le meme serveur.
Une autre adresse d'API peut etre fixee par `data-api-base` sur la balise `<html>`.
La reponse est verifiee en liste blanche : un champ inattendu (donnee personnelle
par exemple) fait refuser la reponse au lieu de l'afficher.

Chaque statut obtenu est copie dans le stockage local du navigateur. Si le serveur
est injoignable ou repond par une erreur 5xx, la copie est affichee avec sa date.
Une reponse 404 n'utilise jamais la copie.

L'adresse `?id=PRC-...` ouvre directement une parcelle, ce qui permet un lien de partage.

## Demonstration sans API

Ajouter `?demo` a l'adresse : la page utilise les exemples du contrat
(PRC-2026-000014 certifiee, PRC-2026-000009 en litige). Les modules JavaScript
exigent un serveur HTTP, par exemple depuis `web/` :

    python -m http.server 8765
    # puis http://127.0.0.1:8765/parcelle/?demo&id=PRC-2026-000014

## Tests

    node --test web/parcelle/statut.test.mjs

## Reste ouvert

- Acces sans compte a la route de statut : decision LGR. La page suppose un acces public.
- Servir `web/` depuis le serveur NestJS : integration de Marrich.
- CODEOWNERS attribue encore `web/parcelle/` a `/web/` (issue a ouvrir).
