import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/presentation/missions_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/new_mission_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/missions_controller.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';

import '../../../support/fake_multi_session_store.dart';
import '../../../support/fake_survey_store.dart';

void main() {
  SurveySession mission(
    String id, {
    required String title,
    SurveySessionStatus status = SurveySessionStatus.draft,
    List<SurveyPoint> points = const [],
    double? areaSquareMeters,
    DateTime? createdAt,
  }) {
    return SurveySession(
      id: id,
      clientId: 'client-$id',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      title: title,
      status: status,
      points: points,
      areaSquareMeters: areaSquareMeters,
      createdAt: createdAt ?? DateTime.utc(2026, 10, 30, 9),
    );
  }

  SurveyPoint point(int number) {
    return SurveyPoint.fromPosition(
      id: 'point-$number',
      clientId: 'client-point-$number',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      pointNumber: number,
      pointName: 'B$number',
      position: GnssPosition(
        latitude: 6.13192 + number / 100000,
        longitude: 1.22281 + number / 100000,
        altitude: 12.5,
        accuracy: 0.012,
        fixQuality: GnssFixQuality.fixed,
        satellitesCount: 18,
        pdop: 1.4,
        hdop: 0.8,
        vdop: 1.1,
        instrument: 'UM982',
        recordedAt: DateTime.utc(2026, 10, 30, 9, 30),
      ),
    );
  }

  Future<void> pumpPage(
    WidgetTester tester, {
    required FakeMultiSessionStore store,
    required SurveyController survey,
  }) async {
    final missions = MissionsController(store: store);
    addTearDown(missions.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: MissionsPage(survey: survey, missions: missions),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('affiche les missions en mosaique avec leur statut', (
    tester,
  ) async {
    final store = FakeMultiSessionStore(
      sessions: [
        mission(
          'mission-a',
          title: 'Leve A',
          status: SurveySessionStatus.inProgress,
          points: [point(1), point(2)],
        ),
        mission(
          'mission-b',
          title: 'Leve B',
          status: SurveySessionStatus.synced,
          points: [point(1), point(2), point(3)],
          areaSquareMeters: 1250.5,
          createdAt: DateTime.utc(2026, 10, 28, 9),
        ),
      ],
    );
    final survey = SurveyController(
      store: store,
      source: ManualGnssSource(),
      sessionId: 'mission-a',
    );
    addTearDown(survey.dispose);

    await pumpPage(tester, store: store, survey: survey);

    expect(find.text('Mes missions'), findsOneWidget);
    expect(find.text('Leve A'), findsOneWidget);
    expect(find.text('Leve B'), findsOneWidget);
    expect(find.text('En cours'), findsOneWidget);
    expect(find.text('Synchronisee'), findsOneWidget);
    expect(find.text('2 bornes'), findsOneWidget);
    expect(find.text('3 bornes'), findsOneWidget);
    expect(find.text('1 250,50 m2'), findsOneWidget);
    expect(find.text('Creer une mission'), findsOneWidget);
  });

  testWidgets('la mosaique tient sur un ecran de telephone', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final store = FakeMultiSessionStore(
      sessions: [
        mission(
          'mission-a',
          title: 'Leve de la parcelle agricole du plateau',
          status: SurveySessionStatus.completed,
          points: [point(1), point(2), point(3)],
          areaSquareMeters: 1250.5,
        ),
      ],
    );
    final survey = SurveyController(
      store: store,
      source: ManualGnssSource(),
      sessionId: 'mission-a',
    );
    addTearDown(survey.dispose);

    await pumpPage(tester, store: store, survey: survey);

    expect(find.text('Terminee'), findsOneWidget);
    expect(find.text('3 bornes'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ouvre la mesure de la mission choisie', (tester) async {
    final store = FakeMultiSessionStore(
      sessions: [mission('mission-a', title: 'Leve A')],
    );
    final source = ManualGnssSource();
    final survey = SurveyController(
      store: store,
      source: source,
      sessionId: 'autre-mission',
    );
    addTearDown(survey.dispose);

    await pumpPage(tester, store: store, survey: survey);
    await tester.tap(find.text('Leve A'));
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(survey.sessionId, 'mission-a');
    expect(survey.session?.title, 'Leve A');
    expect(find.text("Mesure d'une borne"), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('propose de creer une premiere mission', (tester) async {
    final store = FakeMultiSessionStore();
    final survey = SurveyController(
      store: store,
      source: ManualGnssSource(),
      sessionId: 'mission-a',
    );
    addTearDown(survey.dispose);

    await pumpPage(tester, store: store, survey: survey);

    expect(find.text('Aucune mission'), findsOneWidget);

    await tester.tap(find.text('Creer une mission'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(NewMissionPage), findsOneWidget);
  });

  testWidgets('le bouton flottant ouvre le formulaire de creation', (
    tester,
  ) async {
    final store = FakeMultiSessionStore(
      sessions: [mission('mission-a', title: 'Leve A')],
    );
    final survey = SurveyController(
      store: store,
      source: ManualGnssSource(),
      sessionId: 'mission-a',
    );
    addTearDown(survey.dispose);

    await pumpPage(tester, store: store, survey: survey);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(NewMissionPage), findsOneWidget);
  });
}
