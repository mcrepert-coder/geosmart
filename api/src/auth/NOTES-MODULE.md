# Module comptes, administration, synchronisation (proprietaire : Beni)

Dossiers couverts : `api/src/auth|users|admin|sync/`, `api/test/` correspondants, `contracts/auth.yaml`, `contracts/sync.yaml`, `mobile/.../field/account|sync/`. Le module location (`leasing/`) a son propre fichier NOTES-MODULE.md et vient apres.

## A faire dans l'ordre (priorite : le point 2 debloque tout le monde)

1. Ecrire `contracts/auth.yaml` et `contracts/sync.yaml`, PR le matin du jour 1.
2. Decorateur `@Roles(...)` et garde JWT ; le role est relu en base a chaque requete (RG-06). Publier tout de suite.
3. Inscription par telephone, code SMS via une interface `SmsSender` (implementation qui ecrit dans le journal), BCrypt, jetons (acces 1 h, renouvellement 30 jours a usage unique), blocage 15 min apres 5 echecs.
4. Pieces justificatives : limite 5 Mo, JPEG/PNG/PDF ; pieces d'identite lisibles seulement par le proprietaire et l'admin.
5. Espace admin : liste en attente, validation avec role unique, rejet avec motif, suspension.
6. Sync : `POST /sync` idempotent par `clientId` ; reponse par element (accepte / refuse avec motif).
7. Application : file d'envoi locale, reprise automatique, ecran de synchronisation, session chiffree, navigation par role.

## Verification

`npm test -- auth admin sync` et `npm run lint`. Tests obligatoires : compte en attente refuse, mauvais role 403, renvoi du meme `clientId` sans doublon (CA-3).

## Ne jamais

Stocker un mot de passe en clair, mettre le secret des jetons dans le depot, renvoyer une piece d'identite a un autre utilisateur.
