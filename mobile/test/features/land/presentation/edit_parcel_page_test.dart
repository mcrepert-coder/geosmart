import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/land/domain/entities/land_models.dart';
import 'package:geosmart_mobile/features/land/domain/entities/parcel_draft.dart';
import 'package:geosmart_mobile/features/land/presentation/edit_parcel_page.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

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
  recordedAt: DateTime.utc(2026, 10, 29, 9, 30),
);

final current = ParcelInfo.fromJson({
  'id': 'TG-AG3-00457',
  'version': 2,
  'areaM2': 12000.0,
  'perimeterM': 440.0,
  'legalStatus': 'INCONNU',
  'certified': true,
  'geometryHash': 'h',
  'surveyor': {'id': 'g-1'},
  'boundaries': const [],
  'updatedAt': '2026-10-24T09:42:00Z',
});

ParcelDraft draft(List<SurveyPoint> points) =>
    ParcelDraft(surveySessionId: 'CH-2026-031', points: points);

final square = [
  point(1, 6.13, 1.21),
  point(2, 6.13, 1.211),
  point(3, 6.131, 1.211),
  point(4, 6.131, 1.21),
];

Map<String, dynamic> updated() => {
  'id': 'TG-AG3-00457',
  'version': 3,
  'areaM2': 12242.64,
  'perimeterM': 442.59,
  'legalStatus': 'INCONNU',
  'certified': true,
  'geometryHash': 'h3',
  'boundaries': const [],
  'updatedAt': '2026-10-29T10:00:00Z',
};

Future<List<http.Request>> pump(
  WidgetTester tester,
  ParcelDraft d,
  http.Response Function(http.Request) server,
  List<Object?> popped,
) async {
  final requests = <http.Request>[];
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  final api = LandApi(
    MockClient((r) async {
      requests.add(r);
      return server(r);
    }),
    baseUrl: 'http://api.test',
    token: () async => 'jeton',
  );
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async => popped.add(
                await Navigator.of(context).push<ParcelInfo>(
                  MaterialPageRoute(
                    builder: (_) =>
                        EditParcelPage(parcel: current, draft: d, api: api),
                  ),
                ),
              ),
              child: const Text('ouvrir'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('ouvrir'));
  await tester.pumpAndSettle();
  return requests;
}

http.Response json(Object body, int status) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  testWidgets(
    'envoie la nouvelle version avec la version attendue et le motif',
    (tester) async {
      final popped = <Object?>[];
      final requests = await pump(
        tester,
        draft(square),
        (_) => json(updated(), 200),
        popped,
      );

      expect(find.text('TG-AG3-00457 · version 2'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Reprise de la borne B3');
      await tester.tap(find.text('Enregistrer la version 3'));
      await tester.pumpAndSettle();

      final r = requests.single;
      expect(r.method, 'PATCH');
      expect(r.url.path, '/parcels/TG-AG3-00457');
      final body = jsonDecode(r.body) as Map<String, dynamic>;
      expect(body['expectedVersion'], 2);
      expect(body['reason'], 'Reprise de la borne B3');
      expect((body['boundaries'] as List).length, 4);
      expect(body.containsKey('commune'), isFalse);
      expect((popped.single as ParcelInfo).version, 3);
    },
  );

  testWidgets('explique un conflit de version', (tester) async {
    final popped = <Object?>[];
    await pump(
      tester,
      draft(square),
      (_) => json({
        'code': 'VERSION_CONFLICT',
        'message': 'La parcelle a ete modifiee depuis la version 2.',
        'details': {'currentVersion': 3},
      }, 409),
      popped,
    );
    await tester.tap(find.text('Enregistrer la version 3'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('modifiée entre-temps (version 3)'),
      findsOneWidget,
    );
    expect(popped, isEmpty);
  });

  testWidgets('explique un chevauchement sans accuser', (tester) async {
    await pump(
      tester,
      draft(square),
      (_) => json({
        'code': 'PARCEL_OVERLAP',
        'message': 'Cette parcelle recouvre une parcelle deja enregistree.',
        'details': {
          'conflicts': [
            {'parcelId': 'TG-AG3-00412', 'overlapAreaM2': 18.4},
          ],
        },
      }, 409),
      [],
    );
    await tester.tap(find.text('Enregistrer la version 3'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('recouvre TG-AG3-00412 sur 18,40'),
      findsOneWidget,
    );
    expect(find.textContaining("L'alerte a été journalisée."), findsOneWidget);
  });

  testWidgets('bloque une limite dont les cotes se croisent', (tester) async {
    await pump(
      tester,
      draft([square[0], square[2], square[1], square[3]]),
      (_) => json(updated(), 200),
      [],
    );
    expect(find.textContaining('se croisent'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Enregistrer la version 3'),
    );
    expect(button.onPressed, isNull);
  });
}
