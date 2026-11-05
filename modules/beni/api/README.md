# @geosmart/beni-module

Paquet NestJS du module M4 : comptes, roles, administration, carte et synchronisation. Son import ne demarre pas de serveur. Les executeurs locaux `main.ts` et `demo.ts` servent uniquement aux essais et ne sont pas embarques dans le paquet npm.

## Construire le paquet partage

```bash
npm ci
npm test
npm pack
```

Le paquet genere est `geosmart-beni-module-0.2.0.tgz`. Pour l'utiliser dans un autre backend :

```bash
npm install /chemin/vers/geosmart-beni-module-0.2.0.tgz
```

NestJS 11, reflect-metadata et RxJS doivent etre compatibles avec les peerDependencies du paquet. `private: true` empeche une publication npm accidentelle ; la distribution locale et par artefact GitHub reste possible.

## Surface publique

```typescript
import {
  BeniModule, Store, AuthService,
  BeniGuard, Roles, Public, ErrorFilter,
  SyncRejection,
} from '@geosmart/beni-module';
import type { User, Role, SurveyAdapter, MapGateway, SmsSender } from '@geosmart/beni-module';
```

Voir `../INTEGRATION.md` pour les exemples complets. Aucun consommateur ne doit importer un fichier interne `src/` ni acceder directement aux tables pour prendre une decision de droits.

Les routes du module sont protegees par leurs gardes de controleur. L'import du module n'installe aucune garde globale dans le backend hote. Pour proteger une route d'un autre module, ce dernier importe BeniModule et utilise `@UseGuards(BeniGuard)` avec `@Roles(...)`.

Les connexions PostgreSQL et les fournisseurs metier sont injectes par l'hote. La source cartographique et le traitement des points ne sont pas inclus dans le paquet ; leur absence est signalee explicitement.
