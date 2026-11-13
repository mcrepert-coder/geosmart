import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/map/domain/map_parcel.dart';
import 'package:geosmart_mobile/features/map/presentation/viewmodels/parcel_map_controller.dart';

Map<String, dynamic> feature(
  String id, {
  String legalStatus = 'TITRE',
  bool certified = true,
  List<List<double>>? ring,
}) => {
  'type': 'Feature',
  'id': id,
  'geometry': {
    'type': 'Polygon',
    'coordinates': [
      ring ??
          [
            [1.2125, 6.1372],
            [1.2127, 6.1372],
            [1.2127, 6.1374],
            [1.2125, 6.1374],
            [1.2125, 6.1372],
          ],
    ],
  },
  'properties': {
    'legalStatus': legalStatus,
    'certified': certified,
    'areaM2': 487.5,
  },
};

const lome = MapBounds(minLon: 1.20, minLat: 6.12, maxLon: 1.25, maxLat: 6.18);

void main() {
  group('MapParcel', () {
    test('lit une Feature GeoJSON en [longitude, latitude]', () {
      final parcel = MapParcel.fromFeature(feature('TG-AG3-00457'))!;

      expect(parcel.id, 'TG-AG3-00457');
      expect(parcel.outline, hasLength(4)); // point de fermeture retire
      expect(parcel.outline.first, const GeoPoint(6.1372, 1.2125));
      expect(parcel.legalStatus, MapLegalStatus.titre);
      expect(parcel.certified, isTrue);
      expect(parcel.areaM2, 487.5);
      expect(parcel.center.latitude, closeTo(6.1373, 1e-9));
      expect(parcel.center.longitude, closeTo(1.2126, 1e-9));
    });

    test('retrouve la parcelle touchee (point dans le contour)', () {
      final parcel = MapParcel.fromFeature(feature('P1'))!;
      expect(parcel.contains(const GeoPoint(6.1373, 1.2126)), isTrue);
      expect(parcel.contains(const GeoPoint(6.1380, 1.2126)), isFalse);
      expect(parcel.contains(const GeoPoint(6.1373, 1.2130)), isFalse);
    });

    test('un statut inconnu devient INCONNU', () {
      final parcel = MapParcel.fromFeature(
        feature('P1', legalStatus: 'AUTRE'),
      )!;
      expect(parcel.legalStatus, MapLegalStatus.inconnu);
    });

    test('ignore les geometries inexploitables', () {
      final collection = {
        'type': 'FeatureCollection',
        'features': [
          feature('OK'),
          feature(
            'DEUX-POINTS',
            ring: [
              [1.0, 6.0],
              [1.1, 6.0],
            ],
          ),
          {'id': 'SANS-GEOMETRIE'},
          'pas un objet',
        ],
      };
      final parcels = MapParcel.fromCollection(collection);
      expect(parcels.map((p) => p.id), ['OK']);
    });
  });

  group('MapBounds', () {
    test('formate bbox comme le contrat : minLon,minLat,maxLon,maxLat', () {
      expect(lome.toQuery(), '1.200000,6.120000,1.250000,6.180000');
    });

    test('elargit la zone et teste l inclusion', () {
      final wide = lome.expand(0.5);
      expect(wide.minLon, closeTo(1.175, 1e-9));
      expect(wide.maxLat, closeTo(6.21, 1e-9));
      expect(wide.contains(lome), isTrue);
      expect(lome.contains(wide), isFalse);
    });
  });

  group('MapFilter', () {
    final titre = MapParcel.fromFeature(feature('T'))!;
    final litigeNonCertifie = MapParcel.fromFeature(
      feature('L', legalStatus: 'EN_LITIGE', certified: false),
    )!;

    test('affiche tout par defaut', () {
      const filter = MapFilter();
      expect(filter.accepts(titre), isTrue);
      expect(filter.accepts(litigeNonCertifie), isTrue);
    });

    test('masque un statut puis le reaffiche', () {
      final hidden = const MapFilter().toggle(MapLegalStatus.litige);
      expect(hidden.accepts(litigeNonCertifie), isFalse);
      expect(
        hidden.toggle(MapLegalStatus.litige).accepts(litigeNonCertifie),
        isTrue,
      );
    });

    test('certifiees seulement', () {
      final filter = const MapFilter().withCertifiedOnly(true);
      expect(filter.accepts(titre), isTrue);
      expect(filter.accepts(litigeNonCertifie), isFalse);
    });
  });

  group('ParcelMapController', () {
    test('charge la zone elargie puis ne recharge pas a l interieur', () async {
      final asked = <MapBounds>[];
      final controller = ParcelMapController(
        loader: (bounds) async {
          asked.add(bounds);
          return [MapParcel.fromFeature(feature('P1'))!];
        },
      );

      await controller.onViewChanged(lome);
      expect(asked, hasLength(1));
      expect(asked.single.contains(lome), isTrue);
      expect(controller.parcels.map((p) => p.id), ['P1']);
      expect(controller.loading, isFalse);

      const inside = MapBounds(
        minLon: 1.21,
        minLat: 6.13,
        maxLon: 1.24,
        maxLat: 6.17,
      );
      await controller.onViewChanged(inside);
      expect(asked, hasLength(1));

      await controller.retry(inside);
      expect(asked, hasLength(2));
    });

    test('garde le message d erreur de l API', () async {
      final controller = ParcelMapController(
        loader: (_) async => throw const LandApiException(
          0,
          'NETWORK',
          'Pas de connexion au serveur.',
        ),
      );

      await controller.onViewChanged(lome);
      expect(controller.error, 'Pas de connexion au serveur.');
      expect(controller.loading, isFalse);
    });

    test('ignore une reponse arrivee apres une requete plus recente', () async {
      final first = Completer<List<MapParcel>>();
      var calls = 0;
      final controller = ParcelMapController(
        loader: (_) {
          calls++;
          return calls == 1
              ? first.future
              : Future.value([MapParcel.fromFeature(feature('RECENTE'))!]);
        },
      );

      final slow = controller.onViewChanged(lome);
      await controller.onViewChanged(lome, force: true);
      first.complete([MapParcel.fromFeature(feature('ANCIENNE'))!]);
      await slow;

      expect(controller.parcels.map((p) => p.id), ['RECENTE']);
    });

    test('un filtre qui cache la parcelle choisie la deselectionne', () async {
      final litige = MapParcel.fromFeature(
        feature('L', legalStatus: 'EN_LITIGE'),
      )!;
      final controller = ParcelMapController(loader: (_) async => [litige]);
      await controller.onViewChanged(lome);
      controller.select(litige);

      controller.toggleStatus(MapLegalStatus.litige);

      expect(controller.selected, isNull);
      expect(controller.visibleParcels, isEmpty);
    });
  });
}
