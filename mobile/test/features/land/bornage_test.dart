import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/land/domain/entities/bornage.dart';
import 'package:geosmart_mobile/features/land/domain/entities/parcel_draft.dart';
import 'package:geosmart_mobile/features/land/presentation/create_parcel_page.dart';

SurveyPoint point(int n, double lat, double lon) => SurveyPoint(
  id: 'pt-$n',
  clientId: 'c-$n',
  projectId: 'CH-2026-031',
  surveyorId: 'g-1',
  pointNumber: n,
  pointName: 'B$n',
  latitude: lat,
  longitude: lon,
  fixQuality: GnssFixQuality.fixed,
  satellitesCount: 18,
  pdop: 1.4,
  recordedAt: DateTime.utc(2026, 10, 24, 9, 30),
);

// Voisins de la maquette T6.
const komlan = Neighbour(
  name: 'Komlan Adjete',
  phone: '+228 90 44 21 08',
  side: NeighbourSide.n,
  present: true,
);
const abla = Neighbour(
  name: 'Abla Mensah',
  phone: '+228 91 07 66 34',
  side: NeighbourSide.e,
  present: true,
);
const tchalla = Neighbour(
  name: 'Famille Tchalla',
  side: NeighbourSide.s,
  present: false,
  representedBy: 'Essowe T.',
);

void main() {
  group('Bornage', () {
    final heldAt = DateTime.utc(2026, 10, 24, 9, 30);

    test('produit le format attendu par le serveur', () {
      final b = Bornage(neighbours: const [komlan, tchalla], heldAt: heldAt);
      expect(b.validate(), isNull);
      expect(b.presentCount, 1);
      expect(b.toJson(), {
        'neighbours': [
          {
            'name': 'Komlan Adjete',
            'phone': '+228 90 44 21 08',
            'side': 'N',
            'present': true,
          },
          {
            'name': 'Famille Tchalla',
            'side': 'S',
            'present': false,
            'representedBy': 'Essowe T.',
          },
        ],
        'heldAt': '2026-10-24T09:30:00.000Z',
      });
    });

    test('ne garde le representant que pour un voisin absent', () {
      const present = Neighbour(
        name: 'X',
        side: NeighbourSide.o,
        present: true,
        representedBy: 'Y',
      );
      expect(present.toJson().containsKey('representedBy'), isFalse);
    });

    test('refuse les saisies que le serveur refuserait', () {
      expect(
        const Neighbour(
          name: ' ',
          side: NeighbourSide.n,
          present: true,
        ).validate(),
        isNotNull,
      );
      expect(
        const Neighbour(
          name: 'X',
          side: NeighbourSide.n,
          present: true,
          phone: '+33 6 12 34 56 78',
        ).validate(),
        'Téléphone attendu au format +228 90 12 34 56.',
      );
      expect(
        Bornage(neighbours: const [], heldAt: heldAt).validate(),
        'Ajoutez au moins un voisin.',
      );
      expect(
        Bornage(neighbours: List.filled(21, komlan), heldAt: heldAt).validate(),
        'Au plus 20 voisins.',
      );
      expect(
        Bornage(
          neighbours: const [komlan],
          heldAt: DateTime.now().add(const Duration(days: 1)),
        ).validate(),
        isNotNull,
      );
    });

    test('le brouillon envoie le bornage avec la parcelle', () {
      final draft =
          ParcelDraft(
            surveySessionId: 'CH-2026-031',
            points: [
              point(1, 6.13, 1.21),
              point(2, 6.13, 1.211),
              point(3, 6.131, 1.211),
            ],
            commune: 'AG3',
            declaredStatus: DeclaredStatus.coutumier,
          ).copyWith(
            bornage: Bornage(neighbours: const [komlan, abla], heldAt: heldAt),
          );
      final payload = draft.toCreatePayload();
      expect((payload['bornage'] as Map)['neighbours'], hasLength(2));
    });
  });

  testWidgets('saisit un voisin depuis l ecran de creation', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: CreateParcelPage(
          initialDraft: ParcelDraft(
            surveySessionId: 'CH-2026-031',
            points: [
              point(1, 6.13, 1.21),
              point(2, 6.13, 1.211),
              point(3, 6.131, 1.211),
            ],
          ),
          onQueue: (_) async {},
        ),
      ),
    );

    await tester.tap(find.text('Bornage'));
    await tester.pumpAndSettle();
    expect(find.text('Bornage contradictoire'), findsOneWidget);
    expect(
      find.textContaining('Les photos seront disponibles'),
      findsOneWidget,
    );

    // Enregistrer sans voisin est refuse.
    await tester.tap(find.text('Enregistrer le bornage'));
    await tester.pump();
    expect(find.text('Ajoutez au moins un voisin.'), findsOneWidget);

    await tester.tap(find.text('Ajouter'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Nom *'),
      'Komlan Adjete',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Téléphone'),
      '+228 90 44 21 08',
    );
    await tester.tap(find.text('Valider'));
    await tester.pumpAndSettle();
    expect(find.text('Komlan Adjete'), findsOneWidget);
    expect(find.text('Présent'), findsOneWidget);

    await tester.tap(find.text('Enregistrer le bornage'));
    await tester.pumpAndSettle();
    expect(find.text('Nouvelle parcelle'), findsOneWidget);
    expect(find.text('Bornage (1/1)'), findsOneWidget);
  });
}
