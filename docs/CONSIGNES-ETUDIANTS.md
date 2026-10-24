# Consignes pour l'equipe GeoSmart Field

A lire en entier avant de commencer. Une page.

## 1. Ce que nous construisons

Une application Android et un site pour : mesurer les terrains avec precision, empecher les doubles ventes, et vendre ou louer terrains et maisons en toute confiance. La partie immobiliere est la premiere source de revenu du projet : elle compte autant que la partie terrain.

## 2. Qui fait quoi

| Etudiant | Bloc | Dossiers |
|---|---|---|
| Romuald | GNSS, terrain, carte | `gnss/`, `survey/`, `cogo/`, `map/` |
| Samuel | Foncier, journal, verification d'une parcelle | `api/src/land/`, `api/src/audit/`, `web/parcelle/` |
| Beni | Comptes, administration, synchronisation, location | `api/src/auth|users|admin|sync|leasing/` |
| Marrich (delegue) | Annonces, site web, integration | `api/src/listings/`, `web/`, `docs/`, `.github/` |

Detail dans `docs/RESPONSABILITES.md`. Vous ne modifiez que vos dossiers. Pour le reste, ouvrez une issue au proprietaire.

## 3. Maintenant (aucun cout)

1. Creer son compte GitHub et envoyer son nom d'utilisateur a Koffi.
2. Installer Git, Android Studio, JDK 17, Node.js 20 et Docker.
3. Lire `docs/CAHIER-DES-CHARGES.md`, `docs/RESPONSABILITES.md`, `docs/REGLES-DE-TRAVAIL.md`, `docs/WORKFLOW-GIT.md`.
4. Ecrire la premiere version du contrat de son module (`contracts/<module>.yaml`).
5. Marrich prepare le squelette du depot et la CI.

## 4. Outils de travail

- Chacun prepare ses propres outils : ordinateur, logiciels, comptes personnels. Confluences ne verse aucun argent aux etudiants et ne finance pas ces outils.
- Les comptes ne se partagent pas.
- Le developpement ne commence que lorsque les quatre etudiants sont prets.

## 5. Le developpement (2 jours)

- Jour 1 matin : squelette, contrats. Beni livre `@Roles` en premier.
- Jour 1 apres-midi : chacun construit sa brique.
- Jour 2 matin : assemblage des briques.
- Jour 2 apres-midi : recette et correction.

Si le temps manque, on garde dans cet ordre : comptes et annonces, foncier, terrain, location.

## 6. Regles non negociables

- Pas de RTK Fixed, pas de borne validee (RG-01).
- Une parcelle qui chevauche une autre est refusee (RG-02).
- Le document s'appelle "attestation de leve" ; mention "Ne vaut pas titre foncier" ; pas de QR code.
- Un client ne publie jamais un bien : il passe par un agent (RG-05).
- Aucun mot de passe, cle ou jeton dans le depot, ni dans le groupe WhatsApp.
- Confluences ne verse jamais d'argent aux etudiants. Chaque depense passe par un prestataire ou un fournisseur : besoin, devis a l'ordre de "Ambassade de France / SCAC", accord de principe de l'encadrant et de l'ambassade, puis facture. Ne rien acheter vous-meme en pensant etre rembourse. Plafond du projet : 450 000 FCFA.

## 7. Comment on travaille

- Une branche par tache, une Pull Request par branche.
- Un autre etudiant relit. Marrich fusionne quand la CI est verte. Koffi valide les jalons.
- Un test pour chaque fonction metier. Pas de test, pas de fusion.
- Un probleme qui dure plus de 24 heures : ouvrir une issue et le dire dans le groupe.

## 8. Qui decide

- Questions techniques : le proprietaire du module, puis Marrich.
- Decisions de fond, achats, hebergement, modele economique : Koffi (LGR).
- Questions pedagogiques : M. Gédéon AMOUSSOU.
