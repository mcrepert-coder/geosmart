# Fichiers a commiter pour partager M4

Ce dossier est le module de Beni a partager avec les autres intervenants. Aucun commit et aucun envoi GitHub n'ont ete effectues : vous gardez la main sur le depot et la branche de destination.

## Contenu source

Commiter `api/src/`, `api/test/`, `api/migrations/`, les fichiers npm et TypeScript, `mobile/beni/`, l'application exemple `mobile/app/`, les fichiers Gradle et le wrapper, `contracts/`, `tools/`, les guides et les fichiers de configuration Git.

La bibliotheque partagee Android est **mobile/beni**. L'application **mobile/app** sert a la tester et n'a pas a remplacer l'application des autres intervenants. Le point d'entree public backend est **api/src/index.ts**, expose sous le nom **@geosmart/beni-module** apres `npm pack`.

Les fichiers suivants sont ignores : `node_modules`, `dist`, caches Gradle, dossiers `build`, `.env`, `local.properties`, APK, AAR, paquets `.tgz`, ZIP et dossier `livraison/`. Ils ne doivent pas etre ajoutes avec `git add -f`. L'exemple `.env.example` contient uniquement des valeurs a remplacer et doit etre commite. Le fichier `gradle-wrapper.jar` fait partie du wrapper et doit etre commite.

## Dans le depot commun

1. Ouvrir ou cloner le depot GitHub de l'equipe.
2. Creer une branche, par exemple `module/beni-m4`.
3. Copier le contenu source de ce dossier dans `modules/beni/`, en conservant les exclusions ci-dessus. Ne pas ecraser le code des autres intervenants.
4. Pour la CI, copier **le fichier** `.github/workflows/module-beni.yml` dans `.github/workflows/` a la racine du depot commun et regler sa variable `MODULE_DIR` sur `modules/beni`. Aucun autre workflow de l'equipe n'est a remplacer.
5. Tester `npm ci` puis `npm test` depuis `modules/beni/api/`. Compiler Android depuis `modules/beni/mobile/` avec `./gradlew :beni:assembleRelease :app:assembleDebug` (Windows : `gradlew.bat`).
6. Examiner `git status` et le diff, puis creer le commit et la Pull Request.

Exemple depuis la racine du depot commun, une fois les sources copiees :

```bash
git switch -c module/beni-m4
git add modules/beni .github/workflows/module-beni.yml
git diff --cached --stat
git diff --cached --check
git commit -m "ajoute le module partage de comptes et synchronisation de Beni"
git push -u origin module/beni-m4
```

Si la branche a deja ete creee, commencer a `git add`. Le depot de destination garde sa configuration et son historique Git. Ne pas copier de dossier `.git` dans `modules/beni`.

## Dans un depot dedie au module

Si l'equipe prefere un depot propre au module, le contenu source peut etre place directement a sa racine. La CI fonctionne alors avec `MODULE_DIR: .`. Les autres intervenants peuvent telecharger les artefacts `.tgz` et `.aar` produits par la CI, ou reutiliser les sources.

## Pour les consommateurs

- **Samuel ou tout module metier protege** : importer BeniGuard et Roles, puis ajouter `@UseGuards(BeniGuard)` et les roles sur les routes concernees.
- **Terrain** : appeler OfflineQueue.enqueue sur Android ; fournir SurveyAdapter au backend pour les controles GNSS et les affectations de chantiers.
- **Carte** : fournir MapGateway avec les geometries publiques, sans donnees personnelles.
- **Integration** : configurer BeniModule une seule fois et partager cette configuration ; fournir la base, le secret et les adaptateurs. Voir INTEGRATION.md.

Les artefacts du dossier `livraison/` sont fournis pour votre transmission locale et les essais. GitHub les regenere par CI ; ils ne font pas partie du commit source. La CI ajoutee a ete preparee mais son execution sur GitHub reste a constater apres votre push.

## Retour sur les contrats #35

Inclure COMPATIBILITE-EQUIPE.md et les contrats auth.yaml et sync.yaml corriges. La version 0.2.0 utilise ADMIN, fournit les champs d identite du geometre et transporte une mission complete avec entityType survey_session. Le schema metier de mission et le passage en parcelle restent a convenir avec les autres intervenants. Ne pas annoncer cette partie comme validee collectivement avant leur revue.
