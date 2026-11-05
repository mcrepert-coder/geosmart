# Verifications - 2 novembre 2026

## Resultats observes

| Verification | Resultat |
|---|---|
| Compilation TypeScript stricte (`npm run build`) | Reussie |
| Tests Node.js (`npm test`) | 5 tests reussis, aucun echec |
| Serveur de demonstration autonome (`node tools/smoke-demo.cjs`) | Demarrage, health, trois parcelles fictives et connexion administrateur verifies |
| Compilation Android (`gradle assembleDebug`) | BUILD SUCCESSFUL |
| Bibliotheque Android (`:beni:assembleRelease`) et application consommatrice (`:app:assembleDebug`) | BUILD SUCCESSFUL apres separation |
| Paquet NestJS (`npm pack`) | Paquet partage genere avec exports publics et declarations TypeScript |
| Installation du `.tgz` dans un projet distinct | Installation reussie, compilation des types avec skipLibCheck=false et import sans demarrage de serveur verifies |
| Module consommateur NestJS | Garde exportee fonctionnelle ; aucune garde globale imposee aux routes de l'hote |
| Lanceur Gradle portable (`gradle wrapper`) | Genere, Gradle 9.1.0 |
| Constitution et lecture de l'archive ZIP source | Verification finale par script, sans caches, dependances, secrets ou artefacts binaires |

Les tests de l'API couvrent les parcours de comptes, verification du telephone, refus des comptes en attente, obligation de justificatifs, attribution du role, refus 403, protection des documents contre un autre utilisateur, suspension, rotation a usage unique du renouvellement et blocage apres cinq echecs. Ils couvrent aussi les reprises de synchronisation, l'absence de doublons, le refus d'un identifiant reutilise avec une autre charge et le filtrage de la carte.

Un quatrieme test instancie une application hote distincte qui importe seulement le point d'entree public du module, utilise BeniGuard et Roles sur son propre controleur, et conserve une route publique sans modification de ses droits. La CI GitHub est fournie, mais n'a pas ete executee sur GitHub avant votre push.

Les tests HTTP utilisent NestJS avec une base PostgreSQL emulee en memoire (`pg-mem`). Ils exercent les gardes et les routes reelles, mais ne remplacent pas une verification PostgreSQL en conditions reelles.

La compilation Android a utilise JDK 17, Android Gradle Plugin 9.0.1, Gradle 9.1.0 et le SDK Android 36. Un avertissement d'outils SDK XML a ete emis, sans bloquer la compilation. L'APK fourni est une version debug pour les essais.

## Verifications restant a effectuer

- Installation et recette visuelle sur un appareil ou un emulateur Android.
- Coupure et retour reseau reels, redemarrage de l'appareil et reprise JobScheduler.
- Tests de concurrence, de rollback et de persistance sur un PostgreSQL reel. Docker est installe sur le poste de preparation mais son moteur n'etait pas demarre ; le conteneur n'a pas ete lance.
- Connexion aux sources de parcelles, aux affectations de chantiers et aux mesures GNSS reelles.
- Fournisseur SMS reel, recuperation du mot de passe et reprise d'inscription apres expiration de la session.
- Recette de confidentialite, charge, sauvegarde et exploitation avant toute mise en production.

Cette livraison constitue un prototype autonome testable et une base d'integration du module M4. Elle ne constitue pas une version de production ni une application de leve foncier complet.

## Correction des contrats - version 0.2.0

Le retour sur #35 est applique au role ADMIN, au schema CurrentUser et au transport des missions completes. Les tests controlent les limites de fullName et ordreNumber, leur disponibilite dans le profil du geometre, les flags registeredSurveyor/accountActive, l'absence de donnees sensibles dans request.user, l'acceptation de l'enveloppe survey_session et le rejet d'un element survey_point. Un cinquieme test relit les contrats YAML generes pour prevenir une divergence avec le code.

La bibliotheque AAR et l'APK ont ete recompiles apres ces changements. La compatibilite exacte avec le JSON du telephone de Romuald et le lien mission/parcelle n'ont pas ete testes, car ces contrats sources n'ont pas ete fournis. Aucune creation automatique de parcelle n'a ete ajoutee. Voir COMPATIBILITE-EQUIPE.md.
