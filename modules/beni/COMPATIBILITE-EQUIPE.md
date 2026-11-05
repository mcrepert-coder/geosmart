# Prise en compte du retour sur les contrats #35

Version 0.2.0, 2 novembre 2026. Ce suivi applique le message transmis dans le chat. Les fichiers du depot de destination, les PR #35 et #24 et les contrats de Romuald n'ont pas ete consultes ici. Aucune reponse n'a ete envoyee aux autres intervenants et aucune PR n'a ete modifiee.

## 1. Role administrateur

Le contrat `contracts/auth.yaml`, le schema OpenAPI, les types, les gardes, les services et le client Android utilisent desormais **ADMIN**. La valeur **ADMINISTRATEUR** n'est pas acceptee par le contrat. `request.user.role` utilise le meme identifiant que celui attendu par les controles fonciers mentionnes dans le message.

La liste du module est `ADMIN`, `GEOMETRE`, `TOPOGRAPHE`, `AGENT_IMMOBILIER`, `CLIENT`. ADMIN et GEOMETRE sont explicitement cites dans le retour recu ; verifier les autres libelles avec la liste complete du depot cible avant integration.

## 2. Identite du geometre pour l'attestation

Le schema **CurrentUser** expose :

```yaml
fullName:
  type: string
  maxLength: 120
ordreNumber:
  type: string
  maxLength: 40
  description: geometre inscrit a l'Ordre
```

Ces deux champs restent facultatifs dans le contrat. Le nom complet est fourni a partir du nom existant si aucune valeur specifique n'a ete renseignee. Le numero est enregistre par l'administration apres controle des pieces. La validation d'un geometre comme certifie exige une piece d'inscription et un numero d'Ordre. Le profil expose aussi **registeredSurveyor** et **accountActive**, calcules depuis le compte en base.

Le garde transmet ce profil public dans `request.user`, sans empreinte de mot de passe. Le module foncier peut lire `request.user.fullName` et `request.user.ordreNumber` pour produire son attestation. Le module M4 ne produit pas l'attestation.

## 3. Synchronisation de missions completes

L'enveloppe de transport est desormais :

```json
{
  "items": [
    {
      "clientId": "UUID-STABLE-DE-L-ELEMENT",
      "entityType": "survey_session",
      "payload": { "contenu": "mission complete fournie par Romuald" }
    }
  ]
}
```

Cet exemple illustre uniquement les champs de l'enveloppe ; remplacer le clientId par un vrai UUID. Le payload ci-dessus ne constitue pas un schema de mission valide. Le service transmet l'objet mission entier a SurveyAdapter en une seule transaction et conserve un seul recu idempotent par element. Le client Android met la mission complete dans SQLite avant envoi. Les anciens elements borne par borne ne sont pas envoyes automatiquement.

**Le message ne donne pas le JSON exact envoye par le telephone.** L'enveloppe `items/clientId/entityType/payload`, la contrainte UUID et les reponses du prototype sont donc a comparer au contrat reel avant de declarer la compatibilite complete. `contracts/sync.yaml` documente cette reserve. `demo-v1` dans le lanceur local est une fixture de test, pas une decision prise a la place de Romuald.

### Points a convenir avec Romuald et le foncier

1. Schema exact de SurveySession : identifiant, chantier, sommets ordonnes, precision, qualite GNSS, horodatages, statut et version.
2. Conditions d'envoi : mission terminee, modifications apres envoi et nouvel identifiant de transport a chaque nouvelle revision.
3. Droit du topographe sur le chantier et droit du geometre a terminer ou certifier la mission.
4. Responsable de la conversion mission -> parcelle et lien stable entre sessionId et parcelId pour eviter une double creation.
5. Correspondance des reponses, erreurs et conflits de version avec les contrats existants.

**Aucune conversion automatique en parcelle n'est ajoutee ici.** Le module M4 n'appelle pas `POST /parcels`. D'apres le retour recu, le telephone utilise deja cette route ; ce flux reste a verifier dans `contracts/land.yaml` avant tout changement. Il ne faut pas activer en parallele une seconde creation automatique de parcelle depuis `/sync`.

## Mise a niveau du prototype precedent

- Pour une base persistante ayant des roles en minuscules, executer explicitement `api/migrations/202611020002_beni_roles_compatibility.sql` avant utilisation. Elle convertit egalement une ancienne valeur ADMINISTRATEUR en ADMIN. La migration initiale d'un nouveau serveur suffit pour une base vide.
- Sur Android, le schema SQLite passe a la version 2. Les anciens elements en attente avec un autre type sont conserves avec le refus `LEGACY_POINT_SYNC_UNSUPPORTED`. Ils ne sont pas fusionnes artificiellement en mission. Reconstituer une mission complete depuis les donnees terrain avant de la placer dans une nouvelle entree.
- Se reconnecter pour actualiser les anciens profils en cache. Les jetons n'embarquent aucun role faisant autorite : les droits sont toujours relus en base.
- La version partagee est **0.2.0** : le changement de roles et d'enveloppe necessite une mise a jour coordonnee des consommateurs. Ne pas reutiliser le paquet 0.1.0.

Le contrat leasing cite dans le message n'est pas ajoute ni remplace par cette correction : il reste hors du perimetre M4 livre ici.
