import 'dart:async';

import 'package:flutter/widgets.dart';

import 'app/database/local_database.dart';
import 'app/geosmart_app.dart';
import 'features/gnss/data/datasources/native_gnss_source.dart';
import 'features/gnss/data/datasources/simulated_gnss_source.dart';
import 'features/gnss/data/datasources/survey_session_local_data_source.dart';
import 'features/gnss/domain/entities/survey_session.dart';
import 'features/gnss/domain/repositories/gnss_position_source.dart';
import 'features/gnss/presentation/viewmodels/survey_controller.dart';

/// Identifiant de la mission de demonstration creee au premier lancement.
const String demoSessionId = 'demo-session';

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

  var session = await store.loadSession(demoSessionId);
  if (session == null) {
    session = SurveySession(
      id: demoSessionId,
      clientId: 'demo-client-session',
      projectId: 'demo-project',
      surveyorId: 'demo-surveyor',
      title: 'Leve de demonstration',
      createdAt: DateTime.now().toUtc(),
    );
    await store.createSession(session);
  }

  final GnssPositionSource source = useSimulatedGnss
      ? SimulatedGnssSource()
      : NativeGnssSource();
  final controller = SurveyController(
    store: store,
    source: source,
    sessionId: session.id,
  );

  runApp(GeoSmartApp(controller: controller));
  unawaited(controller.start());
}
