import 'package:flutter/widgets.dart';

import 'app/database/local_database.dart';
import 'app/geosmart_app.dart';
import 'features/gnss/data/datasources/simulated_gnss_source.dart';
import 'features/gnss/data/datasources/survey_session_local_data_source.dart';
import 'features/gnss/domain/entities/survey_session.dart';
import 'features/gnss/presentation/viewmodels/survey_controller.dart';

/// Identifiant de la mission de demonstration creee au premier lancement.
const String demoSessionId = 'demo-session';

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

  final controller = SurveyController(
    store: store,
    source: SimulatedGnssSource(),
    sessionId: session.id,
  );
  await controller.start();

  runApp(GeoSmartApp(controller: controller));
}
