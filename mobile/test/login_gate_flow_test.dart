import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/geosmart_app.dart';
import 'package:geosmart_mobile/features/account/data/auth_api.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:geosmart_mobile/features/account/presentation/login_gate_page.dart';
import 'package:geosmart_mobile/features/account/presentation/login_page.dart';
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
  final surveySession = SurveySession(
    id: 'session-1',
    clientId: 'client-session-1',
    projectId: 'project-1',
    surveyorId: 'surveyor-1',
    title: 'Leve parcelle A',
    createdAt: DateTime.utc(2026, 10, 30, 9),
  );

  AuthController authWithoutSession() {
    final api = AuthApi(
      MockClient(
        (request) async => http.Response('{"message":"indisponible"}', 500),
      ),
      baseUrl: 'https://api.test',
    );
    return AuthController(api: api, store: _FakeSessionStore());
  }

  /// L'app exige LeasingApi et SyncController des qu'il y a de
  /// l'authentification, meme si l'utilisateur est deconnecte.
  Future<(LeasingApi, SyncController)> appDependencies() async {
    final client = MockClient(
      (request) async => http.Response('{"message":"indisponible"}', 500),
    );
    final leasingApi = LeasingApi(
      client,
      baseUrl: 'https://api.test',
      token: () async => null,
    );
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
    return (leasingApi, syncController);
  }

  SurveyController surveyController() {
    return SurveyController(
      store: FakeSurveySessionStore(session: surveySession),
      source: ManualGnssSource(),
      sessionId: surveySession.id,
    );
  }

  testWidgets('l accueil non connecte est la premiere page au lancement', (
    tester,
  ) async {
    final auth = authWithoutSession();
    addTearDown(auth.dispose);
    final survey = surveyController();
    addTearDown(survey.dispose);
    final (leasingApi, syncController) = await appDependencies();
    addTearDown(syncController.dispose);

    // Statut encore en chargement : la page d accueil non connecte est deja
    // affichee, sans ecran intermediaire.
    await tester.pumpWidget(
      GeoSmartApp(
        controller: survey,
        auth: auth,
        leasingApi: leasingApi,
        syncController: syncController,
      ),
    );
    await tester.pump();

    expect(find.byType(LoginGatePage), findsOneWidget);
    expect(find.text('Veuillez vous connecter'), findsOneWidget);
    expect(find.byType(LoginPage), findsNothing);
  });

  testWidgets('deconnecte, le bouton mene au formulaire de connexion', (
    tester,
  ) async {
    final auth = authWithoutSession();
    addTearDown(auth.dispose);
    final survey = surveyController();
    addTearDown(survey.dispose);
    final (leasingApi, syncController) = await appDependencies();
    addTearDown(syncController.dispose);
    await auth.logout();

    await tester.pumpWidget(
      GeoSmartApp(
        controller: survey,
        auth: auth,
        leasingApi: leasingApi,
        syncController: syncController,
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Connexion'));
    await tester.pumpAndSettle();

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.text('Numero de telephone'), findsOneWidget);
  });
}
