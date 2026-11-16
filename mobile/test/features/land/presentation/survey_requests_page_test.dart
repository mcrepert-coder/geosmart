import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/land/presentation/parcel_sheet.dart';
import 'package:geosmart_mobile/features/land/presentation/survey_requests_page.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> request(String id, String state, {String? surveyor}) => {
  'id': id,
  'state': state,
  'agentId': 'a-1',
  'surveyorId': surveyor,
  'locality': 'Baguida, lot $id',
  'description': 'Terrain de 600 m2 a borner avant vente.',
  'createdAt': '2026-10-27T08:00:00Z',
};

/// Faux serveur des demandes de leve : garde l'etat entre les appels.
class FakeServer {
  final requests = <Map<String, dynamic>>[
    request('1', 'OUVERTE'),
    request('2', 'PRISE', surveyor: 'g-1'),
  ];
  final calls = <String>[];
  bool alreadyTaken = false;

  http.Response json(Object body, int status) => http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  LandApi api() => LandApi(
    MockClient((r) async {
      calls.add('${r.method} ${r.url.path}');
      if (r.method == 'GET') return json(requests, 200);
      if (r.url.path.endsWith('/take')) {
        if (alreadyTaken) {
          return json({
            'code': 'REQUEST_ALREADY_TAKEN',
            'message': 'Cette demande a deja ete prise.',
          }, 409);
        }
        requests[0] = request('1', 'PRISE', surveyor: 'g-1');
        return json(requests[0], 200);
      }
      if (r.url.path.endsWith('/complete')) {
        requests[1] = request('2', 'TERMINEE', surveyor: 'g-1');
        return json(requests[1], 200);
      }
      if (r.url.path.endsWith('/cancel')) {
        requests[0] = request('1', 'ANNULEE');
        return json(requests[0], 200);
      }
      final body = jsonDecode(r.body) as Map<String, dynamic>;
      final created = {
        ...request('3', 'OUVERTE'),
        'locality': body['locality'],
      };
      requests.add(created);
      return json(created, 201);
    }),
    baseUrl: 'http://api.test',
    token: () async => 'jeton',
  );
}

Future<FakeServer> pump(
  WidgetTester tester,
  LandViewer viewer, {
  bool active = true,
}) async {
  final server = FakeServer();
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: SurveyRequestsPage(
        api: server.api(),
        viewer: viewer,
        accountActive: active,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return server;
}

void main() {
  testWidgets('le geometre prend une demande ouverte', (tester) async {
    final server = await pump(
      tester,
      const LandViewer(id: 'g-1', role: 'GEOMETRE'),
    );

    expect(find.text('Demandes de levé'), findsOneWidget);
    expect(find.text('Ouverte'), findsOneWidget);
    expect(find.text('Prise par vous'), findsOneWidget);
    expect(find.text('Nouvelle demande'), findsNothing);
    expect(find.text('Prendre la demande'), findsOneWidget);

    await tester.tap(find.text('Prendre la demande'));
    await tester.pumpAndSettle();
    expect(server.calls, contains('POST /survey-requests/1/take'));
    expect(find.text('Prise par vous'), findsNWidgets(2));
    expect(find.text('Prendre la demande'), findsNothing);
  });

  testWidgets('explique qu un autre geometre a deja pris la demande', (
    tester,
  ) async {
    final server = await pump(
      tester,
      const LandViewer(id: 'g-2', role: 'GEOMETRE'),
    );
    server.alreadyTaken = true;
    await tester.tap(find.text('Prendre la demande'));
    await tester.pump();
    await tester.pump();
    expect(
      find.text('Un autre géomètre vient de prendre cette demande.'),
      findsOneWidget,
    );
  });

  testWidgets('l agent actif cree une demande', (tester) async {
    final server = await pump(
      tester,
      const LandViewer(id: 'a-1', role: 'AGENT'),
    );
    expect(find.text('Mes demandes de levé'), findsOneWidget);
    expect(find.text('Prendre la demande'), findsNothing);

    await tester.tap(find.text('Nouvelle demande'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Envoyer la demande'));
    await tester.pump();
    expect(
      find.text('La localité et la description sont obligatoires.'),
      findsOneWidget,
    );

    await tester.enterText(
      find.widgetWithText(TextField, 'Localité *'),
      'Agoe, lot 7',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Description *'),
      'Bornage avant achat.',
    );
    await tester.tap(find.text('Envoyer la demande'));
    await tester.pumpAndSettle();
    expect(server.calls, contains('POST /survey-requests'));
    expect(find.text('Agoe, lot 7'), findsOneWidget);
  });

  testWidgets('un agent en attente de validation ne peut pas demander', (
    tester,
  ) async {
    await pump(
      tester,
      const LandViewer(id: 'a-1', role: 'AGENT'),
      active: false,
    );
    expect(find.textContaining('en attente de validation'), findsOneWidget);
    expect(find.text('Nouvelle demande'), findsNothing);
  });
  testWidgets('le geometre termine la demande qu il a prise', (tester) async {
    final server = await pump(
      tester,
      const LandViewer(id: 'g-1', role: 'GEOMETRE'),
    );
    expect(find.text('Marquer comme terminée'), findsOneWidget);
    await tester.tap(find.text('Marquer comme terminée'));
    await tester.pumpAndSettle();
    expect(server.calls, contains('POST /survey-requests/2/complete'));
    expect(find.text('Terminée'), findsOneWidget);
    expect(find.text('Marquer comme terminée'), findsNothing);
  });

  testWidgets('un autre geometre ne peut pas terminer la demande', (
    tester,
  ) async {
    await pump(tester, const LandViewer(id: 'g-2', role: 'GEOMETRE'));
    expect(find.text('Marquer comme terminée'), findsNothing);
  });

  testWidgets('l agent annule sa demande ouverte', (tester) async {
    final server = await pump(
      tester,
      const LandViewer(id: 'a-1', role: 'AGENT'),
    );
    // Seule la demande ouverte peut etre annulee, pas celle deja prise.
    expect(find.text('Annuler la demande'), findsOneWidget);
    await tester.tap(find.text('Annuler la demande'));
    await tester.pumpAndSettle();
    expect(server.calls, contains('POST /survey-requests/1/cancel'));
    expect(find.text('Annulée'), findsOneWidget);
    expect(find.text('Annuler la demande'), findsNothing);
  });
}
