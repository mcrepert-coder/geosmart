# Services de consultation

`ParcelQueryService` fournit deux operations internes :

- `list(filters, reader)` : page de parcelles pour la carte, reservee aux comptes
  actifs. Filtres statut, bbox WGS84, certification ; pagination par identifiant
  et total calcule dans la meme requete SQL que la page.
- `status(id)` : statut courant en liste blanche, sans identifiant d'auteur,
  nom de personne, libelle, bornes, geometrie, donnees de creation ou URL de piece.
  Une parcelle inconnue donne 404. checkedAt est genere au moment de la reponse.

Ces fonctions ne creent aucune route HTTP. L'exposition publique du statut reste
une decision ouverte de LGR ; seul le futur controleur autorisera cet acces.
Le contexte reader doit venir du module auth avec verification en base a chaque
requete. Le service ne verifie pas de jeton et ne lit aucun en-tete de developpement.

## Certification courante

Le constructeur exige un adaptateur `SurveyorCertification.registeredAuthors(ids)`
fourni par le module comptes. Il renvoie les auteurs actuellement inscrits a
l'Ordre parmi les identifiants demandes. Les bornes doivent egalement toutes
etre RTK_FIXED. Aucun badge historique de creation_response n'est utilise.
Les tests emploient un adaptateur fictif explicite ; aucun simulateur n'est
active par defaut dans le service. Une panne de l'adaptateur n'est pas masquee.

L'acces SQL reste limite aux tables foncieres. La certification et les donnees SQL
proviennent de sources distinctes : une photographie atomique entre modules
n'est pas garantie lors d'une modification concurrente. Pour une liste, l'adaptateur
est appele en lot avec les auteurs de l'emprise et du statut demandes.

## Conventions

Les nombres et booleens des filtres doivent deja avoir ete parses par le controleur.
bbox reste une chaine de quatre nombres ; les emprises de largeur ou hauteur nulle
et celles traversant l'antimeridien sont refusees. Les parametres SQL sont lies.
La geometrie de carte utilise 17 decimales pour preserver les coordonnees stockees.
La liste ne renvoie jamais les champs internes utilises pour l'idempotence.

hasAttestation indique l'existence d'au moins une attestation, y compris historique.
Il ne prouve pas qu'une attestation correspond a la version courante ni que le
terrain peut etre achete sans verification. surveyedAt correspond a la derniere
date de mesure des bornes courantes. EN_LITIGE implique inConflict=true.

Les filtres et visibilites restent soumis a la revue du contrat par l'equipe.
L'historique est maintenant disponible via `versions(id, reader)`, reserve aux
geometres et administrateurs actifs ; voir MODIFICATION.md. Le detail complet,
les routes et l'integration NestJS restent a developper.
