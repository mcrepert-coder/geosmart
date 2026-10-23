# Travailler avec Git sans se marcher dessus

## Branches

- `main` : toujours livrable. Personne n'y pousse directement.
- `feat/<module>-<sujet>` : une branche par tache. Exemples : `feat/land-chevauchement`, `feat/auth-roles`, `feat/gnss-ntrip`.
- Une branche vit au plus quelques heures. On la fusionne vite pour eviter les conflits.

## Cycle d'une tache

1. Mettre a jour : `git switch main`, `git pull`.
2. Creer la branche : `git switch -c feat/land-chevauchement`.
3. Travailler uniquement dans ses dossiers.
4. Lancer les tests et le linter du dossier.
5. Commit en francais, une ligne, sans mention d'outil ni ligne de co-auteur : "ajoute le refus 409 en cas de chevauchement".
6. `git push -u origin feat/land-chevauchement`, puis ouvrir la Pull Request.
7. Un autre etudiant relit. Marrich fusionne quand la CI est verte et que le relecteur a approuve.
8. LGR verifie les jalons et valide les versions.

## Pull Request

Une PR contient : ce qui change, l'exigence visee (par exemple EF-202), la commande de test lancee, et "Dossiers touches : uniquement les miens". Une PR qui touche le dossier d'un autre est refusee, sauf accord ecrit de son proprietaire.

## Si un conflit apparait

Ne pas le resoudre a la va-vite. Prevenir Marrich. Les conflits viennent presque toujours d'un fichier partage ; la table de `docs/RESPONSABILITES.md` existe pour les eviter.

## Protection de la branche principale

Si le depot est public, activer les regles de protection sur `main` : PR obligatoire, une approbation, CI verte. Si le depot est prive en offre gratuite, la protection n'est pas disponible : la regle reste la meme par convention, et LGR refuse toute fusion qui n'a pas de PR.

## Secrets

Jamais dans Git. Les valeurs (mot de passe de base, secret des jetons, cles) vivent dans un fichier `.env` local ignore par Git ; le depot ne contient que `.env.example` avec des valeurs factices.
