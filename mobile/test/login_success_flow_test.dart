import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/authenticated_home_shell.dart';
import 'package:geosmart_mobile/app/geosmart_app.dart';
import 'package:geosmart_mobile/features/account/data/auth_api.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:geosmart_mobile/features/account/presentation/viewmodels/auth_controller.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';
import 'package:geosmart_mobile/features/leasing/data/leasing_api.dart';
import 'package:geosmart_mobile/features/sync/data/sync_api.dart';
import 'package:geosmart_mobile/features/sync/domain/sync_processor.dart';
import 'package:geosmart_mobile/features/sync/presentation/viewmodels/sync_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/fake_survey_store.dart';
import 'support/fake_sync_queue.dart';

class _FakeSessionStore implements SessionStore {
  AccountSession? session;

  @override
  Future<AccountSession?> load() async => session;

  @override
  Future<void> save(AccountSession value) async => session = value;

  @override
  Future<void> clear() async => session = null;
}

void main() {
  testWidgets('une connexion reussie ouvre la coque connectee', (tester) async {
    final surveySession = SurveySession(
      id: 'session-1',
      clientId: 'client-session-1',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      title: 'Leve parcelle A',
      createdAt: DateTime.utc(2026, 10, 30, 9),
    );
    final client = MockClient((request) async {
      if (request.url.path == '/auth/login') {
        return http.Response(
          jsonEncode({
            'accessToken': 'access',
            'refreshToken': 'refresh',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/auth/me') {
        return http.Response(
          jsonEncode({
            'id': 'compte-1',
            'role': 'TOPOGRAPHE',
            'registeredSurveyor': false,
            'accountActive': true,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{"message":"indisponible"}', 500);
    });
    final auth = AuthController(
      api: AuthApi(client, baseUrl: 'https://api.test'),
      store: _FakeSessionStore(),
    );
    addTearDown(auth.dispose);
    final survey = SurveyController(
      store: FakeSurveySessionStore(session: surveySession),
      source: ManualGnssSource(),
      sessionId: surveySession.id,
    );
    addTearDown(survey.dispose);
    final syncApi = SyncApi(
      client,
      baseUrl: 'https://api.test',
      token: () async => null,
    );
    final syncController = SyncController(
      queue: FakeSyncQueueStore(),
      sessions: FakeSurveySessionStore(session: surveySession),
      processor: SyncProcessor(
        sessions: FakeSurveySessionStore(session: surveySession),
        queue: FakeSyncQueueStore(),
        api: syncApi,
      ),
    );
    addTearDown(syncController.dispose);

    await tester.pumpWidget(
      GeoSmartApp(
        controller: survey,
        auth: auth,
        leasingApi: LeasingApi(
          client,
          baseUrl: 'https://api.test',
          token: () async => null,
        ),
        syncController: syncController,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Connexion'));
    await tester.pumpAndSettle();
    expect(find.text('Creer un compte'), findsNothing);
    await tester.enterText(
      find.widgetWithText(TextField, 'Numero de telephone'),
      '+22890000000',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Mot de passe'),
      'motdepasse',
    );
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();

    expect(find.byType(AuthenticatedHomeShell), findsOneWidget);
    expect(find.text('Connexion reussie.'), findsOneWidget);
  });
}
