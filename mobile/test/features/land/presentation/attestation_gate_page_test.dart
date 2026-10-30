import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/land/presentation/attestation_gate_page.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> parcel({String b5 = 'FIXED'}) => {
  'id': 'TG-AG3-00457',
  'version': 2,
  'areaM2': 452.18,
  'perimeterM': 101.81,
  'legalStatus': 'COUTUMIER_NON_TITRE',
  'certified': b5 == 'FIXED',
  'geometryHash':
      'a3f9c2e15d87b8aa0c4e9f1d2b3a4c5d6e7f8091a2b3c4d5e6f708191c04d8ce',
  'surveyor': {'id': 'g-1'},
  'boundaries': [
    for (var n = 1; n <= 4; n++)
      {
        'pointNumber': n,
        'name': 'B$n',
        'fixQuality': 'FIXED',
        'pdop': 1.2 + n / 10,
      },
    {'pointNumber': 5, 'name': 'B5', 'fixQuality': b5, 'pdop': 1.9},
  ],
  'updatedAt': '2026-10-24T11:02:00.000Z',
};

http.Response json(Object body, int status) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

Future<List<http.Request>> pump(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) server,
  bool registered = true,
}) async {
  final requests = <http.Request>[];
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: AttestationGatePage(
        parcelId: 'TG-AG3-00457',
        registeredSurveyor: registered,
        api: LandApi(
          MockClient((r) {
            requests.add(r);
            return server(r);
          }),
          baseUrl: 'http://api.test',
          token: () async => 'jeton',
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return requests;
}

Finder issueButton() =>
    find.widgetWithText(FilledButton, "Émettre l'attestation de levé");

bool enabled(WidgetTester tester) =>
    tester.widget<FilledButton>(issueButton()).onPressed != null;

void main() {
  testWidgets('trois conditions vertes : le bouton emet l attestation', (
    tester,
  ) async {
    final requests = await pump(
      tester,
      server: (r) async {
        if (r.method == 'POST') {
          return json({
            'number': 'AT-2026-000031',
            'parcelId': 'TG-AG3-00457',
            'parcelVersion': 2,
            'geometryHash': 'x',
            'documentHash': 'b'.padRight(64, 'c'),
            'issuedAt': '2026-10-24T11:05:00.000Z',
            'mention': 'Ne vaut pas titre foncier',
            'pdfUrl': '/attestations/AT-2026-000031/pdf',
          }, 201);
        }
        return json(parcel(), 200);
      },
    );

    expect(find.text("Géomètre inscrit à l'Ordre"), findsOneWidget);
    expect(find.text('5 / 5 bornes en RTK Fixed'), findsOneWidget);
    expect(find.text('PDOP max 1,9'), findsOneWidget);
    expect(find.text('Aucun conflit serveur'), findsOneWidget);
    expect(find.text('NE VAUT PAS TITRE FONCIER'), findsWidgets);
    expect(find.text('SHA-256 a3f9c2e1…1c04d8ce'), findsOneWidget);
    expect(enabled(tester), isTrue);

    await tester.tap(issueButton());
    await tester.pumpAndSettle();
    expect(requests.last.url.path, '/parcels/TG-AG3-00457/attestations');
    expect(find.text('Attestation AT-2026-000031 émise'), findsOneWidget);
    expect(enabled(tester), isFalse);
  });

  testWidgets('une borne en Float desactive le bouton et dit quoi faire', (
    tester,
  ) async {
    await pump(tester, server: (_) async => json(parcel(b5: 'FLOAT'), 200));
    expect(find.text('4 / 5 bornes en RTK Fixed'), findsOneWidget);
    expect(
      find.text('Reprenez B5 en RTK Fixed, puis modifiez la parcelle.'),
      findsOneWidget,
    );
    expect(enabled(tester), isFalse);
  });

  testWidgets('un geometre non inscrit ne peut pas emettre', (tester) async {
    await pump(
      tester,
      registered: false,
      server: (_) async => json(parcel(), 200),
    );
    expect(find.text("Géomètre non inscrit à l'Ordre"), findsOneWidget);
    expect(enabled(tester), isFalse);
  });

  testWidgets('hors ligne : en attente de synchronisation', (tester) async {
    await pump(
      tester,
      server: (_) async => throw const SocketException('hors ligne'),
    );
    expect(
      find.text(
        'En attente de synchronisation : connectez-vous pour vérifier.',
      ),
      findsOneWidget,
    );
    expect(enabled(tester), isFalse);
  });

  testWidgets('affiche le refus du serveur a l emission', (tester) async {
    await pump(
      tester,
      server: (r) async {
        if (r.method == 'POST') {
          return json({
            'code': 'ATTESTATION_NOT_ALLOWED',
            'message': 'La parcelle recouvre une parcelle deja enregistree.',
            'details': {
              'reasons': ['PARCEL_IN_CONFLICT'],
            },
          }, 422);
        }
        return json(parcel(), 200);
      },
    );
    await tester.tap(issueButton());
    await tester.pumpAndSettle();
    expect(
      find.text('La parcelle recouvre une parcelle deja enregistree.'),
      findsOneWidget,
    );
  });
}
