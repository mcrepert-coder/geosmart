import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/geosmart_app.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';

import 'support/fake_survey_store.dart';

void main() {
  final session = SurveySession(
    id: 'session-1',
    clientId: 'client-session-1',
    projectId: 'project-1',
    surveyorId: 'surveyor-1',
    title: 'Leve parcelle A',
    createdAt: DateTime.utc(2026, 10, 30, 9),
  );

  GnssPosition position({double latitude = 6.13192}) {
    return GnssPosition(
      latitude: latitude,
      longitude: 1.22281,
      altitude: 12.5,
      accuracy: 0.012,
      fixQuality: GnssFixQuality.fixed,
      satellitesCount: 18,
      pdop: 1.4,
      hdop: 0.8,
      vdop: 1.1,
      instrument: 'UM982',
      recordedAt: DateTime.utc(2026, 10, 30, 9, 30),
    );
  }

  Future<void> pumpFrames(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
  }

  Future<void> scrollTo(WidgetTester tester, String text) async {
    await tester.scrollUntilVisible(
      find.text(text),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump();
  }

  testWidgets('affiche T3 et enregistre une borne avec annulation', (
    tester,
  ) async {
    final source = ManualGnssSource();
    final store = FakeSurveySessionStore(session: session);
    final controller = SurveyController(
      store: store,
      source: source,
      sessionId: session.id,
    );
    addTearDown(controller.dispose);
    await controller.start();
    await tester.pumpWidget(GeoSmartApp(controller: controller));
    await tester.pumpAndSettle();

    expect(find.text('Mes missions'), findsOneWidget);
    await tester.tap(find.text('Leve parcelle A'));
    await pumpFrames(tester);
    await tester.pump(const Duration(milliseconds: 500));

    source.emit(position());
    await pumpFrames(tester);

    expect(find.text("Mesure d'une borne"), findsOneWidget);
    expect(find.text('Leve parcelle A'), findsOneWidget);
    expect(find.text('RTK Fixed'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
    expect(find.text('1,4'), findsOneWidget);
    expect(find.text('E 303 336,16'), findsOneWidget);
    expect(find.text('N 678 113,20'), findsOneWidget);

    await scrollTo(tester, 'Aucune borne enregistree');
    expect(find.text('Aucune borne enregistree'), findsOneWidget);

    await tester.tap(find.text('Enregistrer la borne'));
    await tester.pump();
    expect(find.text('Mesure en cours'), findsOneWidget);

    for (var i = 0; i < 10; i++) {
      source.emit(position(latitude: 6.13192 + i / 100000));
      await pumpFrames(tester);
    }
    await tester.pumpAndSettle();

    expect(find.text("Borne B1 enregistree sur l'appareil"), findsOneWidget);
    expect(find.text('Annuler'), findsOneWidget);

    await scrollTo(tester, 'Bornes relevees (1)');
    expect(find.text('Bornes relevees (1)'), findsOneWidget);

    await tester.tap(find.text('Annuler'));
    await pumpFrames(tester);

    await scrollTo(tester, 'Aucune borne enregistree');
    expect(find.text('Bornes relevees (0)'), findsOneWidget);
    expect(find.text('Aucune borne enregistree'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  });
}
