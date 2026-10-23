# Contrats d'API

Un fichier OpenAPI par module, ecrit par son proprietaire avant de coder :

- `auth.yaml`, `sync.yaml` et `leasing.yaml` : Beni
- `land.yaml` : Samuel
- `listings.yaml` : Marrich
- `survey.md` : Romuald (interface Kotlin des bornes, pas une API REST)

Chaque fichier decrit les routes, les roles autorises, les erreurs (401, 403, 409) et un exemple de reponse. Les autres modules codent contre ces exemples tant que le vrai module n'est pas pret.
Modifier un contrat deja fusionne : seulement son proprietaire, par PR, et en prevenant ceux qui l'utilisent.
