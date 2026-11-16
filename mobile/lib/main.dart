import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import 'app/database/local_database.dart';
import 'app/geosmart_app.dart';
import 'app/runtime_config.dart';
import 'features/account/data/auth_api.dart';
import 'features/account/data/secure_session_store.dart';
import 'features/account/data/sqflite_session_store.dart';
import 'features/account/presentation/viewmodels/auth_controller.dart';
import 'features/gnss/data/datasources/native_gnss_source.dart';
import 'features/gnss/data/datasources/simulated_gnss_source.dart';
import 'features/gnss/data/datasources/survey_session_local_data_source.dart';
import 'features/gnss/data/survey_projects_api.dart';
import 'features/gnss/presentation/viewmodels/projects_admin_controller.dart';
import 'features/gnss/domain/entities/survey_session.dart';
import 'features/gnss/domain/repositories/gnss_position_source.dart';
import 'features/gnss/presentation/viewmodels/survey_controller.dart';
import 'features/land/data/land_api.dart';
import 'features/land/data/parcel_status_api.dart';
import 'features/land/data/parcel_status_cache.dart';
import 'features/land/domain/usecases/check_parcel.dart';
import 'features/land/land_entry_points.dart';
import 'features/leasing/data/leasing_api.dart';
import 'features/map/domain/map_parcel.dart';
import 'features/sync/data/sync_api.dart';
import 'features/sync/domain/sync_processor.dart';
import 'features/sync/presentation/viewmodels/sync_controller.dart';

/// Le recepteur Bluetooth est le defaut. Pour essayer la simulation sans
/// materiel : `flutter run --dart-define=GEOSMART_GNSS_SIMULATION=true`.
const bool useSimulatedGnss = bool.fromEnvironment(
  'GEOSMART_GNSS_SIMULATION',
  defaultValue: false,
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final database = await LocalDatabase.open();
  final store = SurveySessionLocalDataSource(database);
  final client = http.Client();
  // Session chiffree par le Keystore ; une ancienne session en clair dans
  // SQLite est migree puis effacee au premier lancement.
  final legacySessionStore = SqfliteSessionStore(database);
  await legacySessionStore.ensureTable();
  final accountStore = SecureSessionStore(
    const FlutterSecretStorage(),
    legacy: legacySessionStore,
  );
  final auth = AuthController(
    api: AuthApi(client, baseUrl: apiBaseUrl),
    store: accountStore,
  );
  await auth.bootstrap();
  final leasingApi = LeasingApi(
    client,
    baseUrl: apiBaseUrl,
    token: auth.accessToken,
  );
  final syncApi = SyncApi(client, baseUrl: apiBaseUrl, token: auth.accessToken);
  final landApi = LandApi(client, baseUrl: apiBaseUrl, token: auth.accessToken);
  // Verification publique (EF-206) : resultat garde hors ligne en SQLite.
  final statusCache = SqfliteParcelStatusCache(database);
  await statusCache.createTable();
  final land = LandServices(
    api: landApi,
    checkParcel: CheckParcel(
      ParcelStatusApi(client, baseUrl: apiBaseUrl),
      statusCache,
    ),
    statusCache: statusCache,
  );
  final projectsApi = SurveyProjectsApi(
    client,
    baseUrl: apiBaseUrl,
    token: auth.accessToken,
  );
  Future<List<MapParcel>> loadParcels(MapBounds bounds) async =>
      MapParcel.fromCollection(
        await landApi.listParcelsGeoJson(bbox: bounds.toQuery()),
      );
  final syncController = SyncController(
    queue: store,
    sessions: store,
    processor: SyncProcessor(sessions: store, queue: store, api: syncApi),
  );

  SurveySession? session;
  if (demoModeEnabled) {
    session = await store.loadSession(demoSessionId);
    if (session == null) {
      session = SurveySession(
        id: demoSessionId,
        clientId: 'demo-client-session',
        projectId: projectId,
        surveyorId: surveyorId,
        title: 'Leve de demonstration',
        createdAt: DateTime.now().toUtc(),
      );
      await store.createSession(session);
    }
  }

  final GnssPositionSource source = useSimulatedGnss
      ? SimulatedGnssSource()
      : NativeGnssSource();
  final controller = SurveyController(
    store: store,
    source: source,
    sessionId: session?.id ?? '',
  );

  runApp(
    GeoSmartApp(
      controller: controller,
      auth: auth,
      leasingApi: leasingApi,
      syncController: syncController,
      parcelLoader: loadParcels,
      projectsLoader: projectsApi.list,
      projectsAdmin: ApiProjectsAdminGateway(projectsApi),
      land: land,
    ),
  );
  unawaited(controller.start());
}
