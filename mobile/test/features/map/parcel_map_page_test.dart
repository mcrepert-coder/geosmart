import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/map/domain/map_parcel.dart';
import 'package:geosmart_mobile/features/map/presentation/parcel_map_page.dart';
import 'package:geosmart_mobile/features/map/presentation/viewmodels/parcel_map_controller.dart';

MapParcel parcel(String id, String status, {bool certified = true}) =>
    MapParcel.fromFeature({
      'type': 'Feature',
      'id': id,
      'geometry': {
        'type': 'Polygon',
        'coordinates': [
          [
            [1.2120, 6.1370],
            [1.2126, 6.1370],
            [1.2126, 6.1376],
            [1.2120, 6.1376],
            [1.2120, 6.1370],
          ],
        ],
      },
      'properties': {
        'legalStatus': status,
        'certified': certified,
        'areaM2': 4400,
      },
    })!;

Future<void> pumpMap(
  WidgetTester tester,
  ParcelMapController controller,
) async {
  await tester.pumpWidget(
    MaterialApp(
      home: ParcelMapPage(
        controller: controller,
        tileUrl: null, // pas de tuiles reseau dans les tests
      ),
    ),
  );
  await tester.pump();
  // Laisse passer le chargement lance par onMapReady.
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  testWidgets('charge les parcelles de la zone affichee et les filtres', (
    tester,
  ) async {
    final asked = <MapBounds>[];
    final controller = ParcelMapController(
      loader: (bounds) async {
        asked.add(bounds);
        return [
          parcel('TG-AG3-00457', 'TITRE'),
          parcel('TG-AG3-00458', 'EN_LITIGE', certified: false),
        ];
      },
    );
    addTearDown(controller.dispose);

    await pumpMap(tester, controller);

    expect(find.text('Carte des parcelles'), findsOneWidget);
    expect(asked, isNotEmpty);
    expect(asked.first.contains(asked.first), isTrue);
    expect(controller.parcels, hasLength(2));
    for (final status in MapLegalStatus.values) {
      expect(find.text(status.label), findsOneWidget);
    }

    await tester.tap(find.byKey(const ValueKey('filtre-EN_LITIGE')));
    await tester.pump();
    expect(controller.visibleParcels.map((p) => p.id), ['TG-AG3-00457']);

    await tester.tap(find.byKey(const ValueKey('filtre-certifiees')));
    await tester.pump();
    expect(controller.filter.certifiedOnly, isTrue);
  });

  testWidgets('affiche la fiche de la parcelle choisie', (tester) async {
    final controller = ParcelMapController(
      loader: (_) async => [parcel('TG-AG3-00457', 'COUTUMIER_NON_TITRE')],
    );
    addTearDown(controller.dispose);
    await pumpMap(tester, controller);

    controller.select(controller.parcels.single);
    await tester.pump();

    expect(find.text('TG-AG3-00457'), findsOneWidget);
    expect(find.text('Coutumier non titré'), findsWidgets);
    expect(find.textContaining('4400 m²'), findsOneWidget);

    await tester.tap(find.byTooltip('Fermer'));
    await tester.pump();
    expect(controller.selected, isNull);
  });

  testWidgets('affiche l erreur de l API avec Reessayer', (tester) async {
    var calls = 0;
    final controller = ParcelMapController(
      loader: (_) async {
        calls++;
        throw const LandApiException(
          0,
          'NETWORK',
          'Pas de connexion au serveur.',
        );
      },
    );
    addTearDown(controller.dispose);
    await pumpMap(tester, controller);

    expect(find.text('Pas de connexion au serveur.'), findsOneWidget);
    await tester.tap(find.text('Réessayer'));
    await tester.pump();
    expect(calls, 2);
  });
}
