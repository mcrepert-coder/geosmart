# geosmart_mobile

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Catalogue Listings

The public catalogue and property details read from the Listings API. Copy
`.env.example` to `.env.json`, adjust the API URLs for your device, then pass the
JSON file at build/run time:

```powershell
Copy-Item .env.example .env.json
flutter run --dart-define-from-file=.env.json
```

`10.0.2.2` is the Android emulator address for services running on the host.
For a physical device, use the host machine's reachable LAN address. Without
this setting, the catalogue shows an explicit configuration error rather than
demo properties. Android debug/profile builds permit HTTP for local development;
release deployments must use HTTPS. iOS builds also require an HTTPS API URL.

Demo data is disabled by default. To create a local demo mission, set
`GEOSMART_DEMO_MODE` to `"true"` in `.env.json`. For real mission creation,
provide `GEOSMART_PROJECT_ID` and `GEOSMART_SURVEYOR_ID`.

Run the Listings checks from this directory:

```shell
flutter test test/features/listings
flutter analyze
```

## Version de production

L'adresse par defaut de l'API est `https://geosmart-zueq.onrender.com`. La route
de connexion en decoule : `/auth/login`. La creation de compte se fait sur le
site web. Un autre environnement peut recevoir sa propre adresse `https` a la
construction :

```powershell
Copy-Item .env.release.example .env.release.json
# Remplacer l'adresse par celle https de l'environnement vise.
flutter build apk --release --dart-define-from-file=.env.release.json
```

- Le HTTP non chiffre n'est permis qu'en debug et profile (manifestes `debug` et
  `profile`) : une adresse `http` ne fonctionne pas en release.
- Avec un compte connecte, la mission est creee sur un chantier choisi dans
  `GET /projects` (CA-7) ; `GEOSMART_PROJECT_ID` et `GEOSMART_SURVEYOR_ID` ne servent
  qu'au mode sans compte et restent vides en production.
- `GEOSMART_DEMO_MODE` et `GEOSMART_GNSS_SIMULATION` restent a `false`.
- Signature : `android/app/build.gradle.kts` signe encore la release avec la cle de
  debug. Avant toute publication, creer une cle de signature (hors du depot) et la
  declarer dans `signingConfigs`. Ne jamais commiter la cle ni son mot de passe.

