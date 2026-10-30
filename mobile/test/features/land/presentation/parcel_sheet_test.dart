import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/land/domain/entities/land_models.dart';
import 'package:geosmart_mobile/features/land/presentation/parcel_sheet.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// Parcelle de la maquette BottomSheet ; le geometre n'est renvoye qu'a
// l'auteur et a l'administrateur.
Map<String, dynamic> parcel({bool withSurveyor = true}) => {
  'id': 'TG-AG3-00398',
  'version': 2,
  'areaM2': 612.4,
  'perimeterM': 101.8,
  'legalStatus': 'COUTUMIER_NON_TITRE',
  'certified': false,
  'geometryHash': 'h',
  'locality': 'Agoe',
  if (withSurveyor) 'surveyor': {'id': 'g-1'},
  'boundaries': [
    for (var n = 1; n <= 4; n++)
      {
        'pointNumber': n,
        'name': 'B$n',
        'fixQuality': n == 4 ? 'FLOAT' : 'FIXED',
      },
  ],
  'updatedAt': '2026-10-14T10:05:00.000Z',
};

const versions = [
  {
    'version': 2,
    'geometryHash': 'h2',
    'areaM2': 612.4,
    'reason': 'Reprise de B3',
    'authorId': 'g-1',
    'createdAt': '2026-10-14T10:05:00Z',
  },
  {
    'version': 1,
    'geometryHash': 'h1',
    'areaM2': 608.9,
    'reason': null,
    'authorId': 'g-1',
    'createdAt': '2026-10-02T15:20:00Z',
  },
];

Future<void> pump(
  WidgetTester tester,
  LandViewer viewer, {
  bool withSurveyor = true,
  List<String>? actions,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  final api = LandApi(
    MockClient((r) async {
      final body = r.url.path.endsWith('/versions')
          ? versions
          : parcel(withSurveyor: withSurveyor);
      return http.Response(
        jsonEncode(body),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }),
    baseUrl: 'http://api.test',
    token: () async => 'jeton',
  );
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ParcelSheet(
          parcelId: 'TG-AG3-00398',
          api: api,
          viewer: viewer,
          onEdit: (ParcelInfo p) => actions?.add('modifier ${p.id}'),
          onAttestation: (ParcelInfo p) => actions?.add('attestation ${p.id}'),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('le geometre auteur voit toutes les actions', (tester) async {
    final actions = <String>[];
    await pump(
      tester,
      const LandViewer(id: 'g-1', role: 'GEOMETRE'),
      actions: actions,
    );

    expect(find.text('TG-AG3-00398'), findsOneWidget);
    expect(find.text('Coutumier non titré'), findsOneWidget);
    expect(find.text('Non certifiée'), findsOneWidget);
    expect(find.text('3 / 4 bornes Fixed'), findsOneWidget);
    expect(find.text('v2 · 14/10/2026 · Agoe'), findsOneWidget);
    expect(
      find.text('Ne vaut pas titre foncier. Statut déclaré lors du levé.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Modifier'));
    await tester.tap(find.text('Attestation de levé'));
    expect(actions, ['modifier TG-AG3-00398', 'attestation TG-AG3-00398']);

    await tester.tap(find.text('Historique'));
    await tester.pumpAndSettle();
    expect(find.text('Reprise de B3'), findsOneWidget);
    expect(find.text('Création'), findsOneWidget);
  });

  testWidgets('un autre geometre consulte l historique sans modifier', (
    tester,
  ) async {
    await pump(
      tester,
      const LandViewer(id: 'g-2', role: 'GEOMETRE'),
      withSurveyor: false,
    );
    expect(find.text('Historique'), findsOneWidget);
    expect(find.text('Modifier'), findsNothing);
    expect(find.text('Attestation de levé'), findsNothing);
  });

  testWidgets('l administrateur ne modifie aucune limite', (tester) async {
    await pump(tester, const LandViewer(id: 'adm', role: 'ADMIN'));
    expect(find.text('Historique'), findsOneWidget);
    expect(find.text('Modifier'), findsNothing);
  });

  testWidgets('client et agent : aucune action, rien de grise', (tester) async {
    for (final role in ['CLIENT', 'AGENT']) {
      await pump(tester, LandViewer(id: 'x', role: role), withSurveyor: false);
      expect(find.byType(OutlinedButton), findsNothing, reason: role);
      expect(find.byType(FilledButton), findsNothing, reason: role);
      expect(find.text('TG-AG3-00398'), findsOneWidget, reason: role);
    }
  });
}
