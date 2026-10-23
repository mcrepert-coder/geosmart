# Regles de travail communes

Projet : GeoSmart Field. Lire d'abord `docs/CAHIER-DES-CHARGES.md` et `docs/RESPONSABILITES.md`.

## Qui travaille ou

Chacun retrouve son nom dans `docs/RESPONSABILITES.md` et ne modifie que les chemins listes dans sa ligne "Dossiers que je possede". Si une tache oblige a sortir de ces chemins :
1. s'arreter,
2. noter le fichier et son proprietaire,
3. ouvrir une issue GitHub pour ce proprietaire.
Aucune exception, meme pour "juste une ligne".

## Fichiers partages (interdits sauf pour leur proprietaire)

- `api/src/app.module.ts`, `api/package.json`, `mobile/build.gradle.kts`, `mobile/settings.gradle.kts` : Marrich (integrateur) seulement.
- `contracts/<module>.yaml` : uniquement le proprietaire du module. Les autres le lisent.
- `api/migrations/` : on ajoute un fichier nomme `AAAAMMJJHHMM_<module>_<description>.sql` et on ne modifie jamais une migration deja fusionnee.
- `.github/` et `docs/` : Marrich.

## Regles metier non negociables

- RG-01 : pas de RTK Fixed, pas de borne validee. Un point Float ou autonome est refuse pour un leve officiel.
- RG-02 : une parcelle qui chevauche une autre est refusee (409) et une alerte est journalisee. Une limite partagee n'est pas un chevauchement.
- RG-03 : attestation reservee au geometre inscrit a l'Ordre, avec toutes les bornes en RTK Fixed, sur une parcelle sans conflit.
- RG-05 : un client ne publie jamais un bien. Il passe par un agent.
- RG-06 : un seul role par compte, attribue par l'administrateur. Le role est relu en base a chaque requete.
- RG-08 : le terrain n'ecrit jamais directement sur le serveur : tout passe par la file locale hors ligne, avec un `clientId` unique (aucun doublon au renvoi).
- Vocabulaire : "attestation de leve", jamais "certificat" ni "titre". Mention obligatoire : "Ne vaut pas titre foncier". Pas de QR code sur l'attestation.
- Paiements mobiles : Flooz et T-Money (T-Money s'appelle maintenant Mixx by Yas : ce n'est qu'un seul service).

## Qualite

- Chaque fonction metier a un test. Une PR sans test est refusee.
- Avant de proposer une PR : lancer les tests et le linter du dossier (voir le fichier NOTES-MODULE.md du dossier).
- Ne jamais ecrire de secret (mot de passe, cle API, jeton) dans un fichier suivi par Git.
- Messages de commit en francais, une ligne, au present : "ajoute le rejet des points Float".

## Typographie (tous textes, code, commentaires, commits)

- Pas de tiret long ni moyen : utiliser "-".
- Pas de majuscule accentuee : "Etat", "Ecole", "A propos".
- Pas de fleches, puces decoratives, guillemets courbes, points de suspension en un caractere, emojis.
- Les minuscules accentuees du francais sont autorisees.

## Historique propre

- Les messages de commit sont ecrits par l'etudiant : une ligne, en francais, au present.
- Aucun commit, aucune Pull Request et aucun fichier ne contient de mention d'outil, de signature automatique ou de ligne de co-auteur.
- Le code et les commentaires sont relus et assumes par celui qui les propose.

## En cas de doute

Poser la question au proprietaire du module. Si personne ne sait, c'est une decision pour LGR : ouvrir une issue "decision" et ne pas deviner.
