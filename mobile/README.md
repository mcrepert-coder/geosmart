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

The public catalogue and property details read from the Listings API. Configure
the API base URL at build/run time:

```shell
flutter run --dart-define=GEOSMART_API_URL=http://10.0.2.2:3001/
```

`10.0.2.2` is the Android emulator address for services running on the host.
For a physical device, use the host machine's reachable LAN address. Without
this setting, the catalogue shows an explicit configuration error rather than
demo properties. Android debug/profile builds permit HTTP for local development;
release deployments must use HTTPS. iOS builds also require an HTTPS API URL.

Run the Listings checks from this directory:

```shell
flutter test test/features/listings
flutter analyze
```
