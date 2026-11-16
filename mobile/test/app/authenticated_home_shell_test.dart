import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/geosmart_app.dart';
import 'package:geosmart_mobile/features/account/data/auth_api.dart';
import 'package:geosmart_mobile/features/account/domain/entities/account_user.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:geosmart_mobile/features/account/presentation/viewmodels/auth_controller.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/theme_controller.dart';
import 'package:geosmart_mobile/features/leasing/data/leasing_api.dart';
import 'package:geosmart_mobile/features/sync/data/sync_api.dart';
import 'package:geosmart_mobile/features/sync/domain/sync_processor.dart';
import 'package:geosmart_mobile/features/sync/presentation/viewmodels/sync_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../support/fake_survey_store.dart';
import '../support/fake_sync_queue.dart';

void main() {
  testWidgets('affiche les onglets autorises pour le role courant', (
    tester,
  ) async {
    final client = MockClient((request) async {
      if (request.url.path == '/auth/me') {
        return http.Response(
          jsonEncode({
            'id': 'agent-1',
            'role': 'AGENT',
            'registeredSurveyor': false,
            'accountActive': true,
          }),
          200,
        );
      }
      if (request.url.path == '/visits') return http.Response('[]', 200);
      return http.Response('{}', 200);
    });
    final auth = AuthController(
      api: AuthApi(client, baseUrl: 'https://api.test'),
      store: _MemorySessionStore(),
    );
    await auth.bootstrap();
    addTearDown(auth.dispose);

    final session = SurveySession(
      id: 'session-1',
      clientId: 'client-session-1',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      title: 'Mission test',
      createdAt: DateTime.utc(2026, 11, 10),
    );
    final surveyStore = FakeSurveySessionStore(session: session);
    final survey = SurveyController(
      store: surveyStore,
      source: ManualGnssSource(),
      sessionId: session.id,
    );
    addTearDown(survey.dispose);

    final queue = FakeSyncQueueStore();
    final syncApi = SyncApi(
      client,
      baseUrl: 'https://api.test',
      token: auth.accessToken,
    );
    final sync = SyncController(
      queue: queue,
      sessions: surveyStore,
      processor: SyncProcessor(
        sessions: surveyStore,
        queue: queue,
        api: syncApi,
      ),
    );
    addTearDown(sync.dispose);

    final theme = ThemeController();
    addTearDown(theme.dispose);
    await tester.pumpWidget(
      GeoSmartApp(
        controller: survey,
        themeController: theme,
        auth: auth,
        leasingApi: LeasingApi(
          client,
          baseUrl: 'https://api.test',
          token: auth.accessToken,
        ),
        syncController: sync,
      ),
    );
    await tester.pumpAndSettle();

    final navigation = find.byType(NavigationBar);
    expect(
      find.descendant(of: navigation, matching: find.text('Visites')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: navigation, matching: find.text('Baux')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: navigation, matching: find.text('Compte')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: navigation, matching: find.text('Leves')),
      findsNothing,
    );

    await tester.tap(
      find.descendant(of: navigation, matching: find.text('Baux')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Baux et loyers'), findsOneWidget);
  });
}

class _MemorySessionStore implements SessionStore {
  @override
  Future<AccountSession?> load() async => const AccountSession(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: AccountUser(
      id: 'account-1',
      role: AccountRole.client,
      registeredSurveyor: false,
      accountActive: true,
    ),
  );

  @override
  Future<void> save(AccountSession session) async {}

  @override
  Future<void> clear() async {}
}
