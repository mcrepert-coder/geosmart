# Travailler avec Git sans se marcher dessus

## Branches

- `main` : toujours livrable. Seul LGR y fusionne, a chaque jalon, depuis `dev`.
- `dev` : branche d'integration de l'equipe. Personne n'y pousse directement : on y fusionne par Pull Request.
- `feat/<module>-<sujet>` : une branche par tache. Exemples : `feat/land-chevauchement`, `feat/auth-roles`, `feat/gnss-ntrip`.
- Une branche vit au plus quelques heures. On la fusionne vite pour eviter les conflits.

## Cycle d'une tache

1. Mettre a jour : `git switch dev`, `git pull`.
2. Creer la branche depuis `dev` : `git switch -c feat/land-chevauchement`.
3. Travailler uniquement dans ses dossiers.
4. Lancer les tests et le linter du dossier.
5. Commit en francais, une ligne, sans mention d'outil ni ligne de co-auteur : "ajoute le refus 409 en cas de chevauchement".
6. `git push -u origin feat/land-chevauchement`, puis ouvrir la Pull Request vers `dev` (pas vers `main`).
7. Un autre etudiant relit. Marrich fusionne dans `dev` quand la CI est verte et que le relecteur a approuve.
8. A chaque jalon, apres la recette, LGR fusionne `dev` dans `main`.

Une Pull Request reste petite : une tache, quelques centaines de lignes au plus. Au-dela, la decouper : personne ne peut relire 6 000 lignes d'un coup.

## Pull Request

Une PR contient : ce qui change, l'exigence visee (par exemple EF-202), la commande de test lancee, et "Dossiers touches : uniquement les miens". Une PR qui touche le dossier d'un autre est refusee, sauf accord ecrit de son proprietaire.

## Reprise du travail d'un autre (delegation)

Quand un proprietaire est indisponible, LGR peut confier son module a un autre etudiant. Depuis novembre 2026 (accord de LGR et de Marrich), Samuel est tech lead : il peut completer les modules de Marrich, Beni et Romuald, resoudre les conflits et fusionner les PR vers `dev`.

Les regles restent les memes :
1. Le travail se fait sur la branche du proprietaire (`marrich`, `beni`, `romuald`) et passe par une PR vers `dev`.
2. La description de la PR dit que le travail est repris et par qui ; la case "Je n'ai touche que mes dossiers" reste decochee avec l'explication.
3. CI verte avant toute fusion ; les PR dependantes sont fusionnees dans l'ordre.
4. A son retour, le proprietaire fait `git pull` sur sa branche avant de reprendre.

## Si un conflit apparait

Ne pas le resoudre a la va-vite. Prevenir Marrich. Les conflits viennent presque toujours d'un fichier partage ; la table de `docs/RESPONSABILITES.md` existe pour les eviter.

## Protection de la branche principale

Si le depot est public, activer les regles de protection sur `main` et `dev` : PR obligatoire, une approbation, CI verte. Si le depot est prive en offre gratuite, la protection n'est pas disponible : la regle reste la meme par convention, et LGR refuse toute fusion qui n'a pas de PR.

## Secrets

Jamais dans Git. Les valeurs (mot de passe de base, secret des jetons, cles) vivent dans un fichier `.env` local ignore par Git ; le depot ne contient que `.env.example` avec des valeurs factices.
