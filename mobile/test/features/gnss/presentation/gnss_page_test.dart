import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/presentation/gnss_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';

import '../../../support/fake_survey_store.dart';

void main() {
  final session = SurveySession(
    id: 'session-1',
    clientId: 'client-session-1',
    projectId: 'project-1',
    surveyorId: 'surveyor-1',
    title: 'Leve parcelle A',
    createdAt: DateTime.utc(2026, 10, 30, 9),
  );

  GnssPosition position({
    GnssFixQuality quality = GnssFixQuality.fixed,
    double latitude = 6.13192,
  }) {
    return GnssPosition(
      latitude: latitude,
      longitude: 1.22281,
      altitude: 12.5,
      accuracy: quality == GnssFixQuality.fixed ? 0.012 : 0.4,
      fixQuality: quality,
      satellitesCount: quality == GnssFixQuality.fixed ? 18 : 11,
      pdop: quality == GnssFixQuality.fixed ? 1.4 : 2.9,
      hdop: 0.8,
      vdop: 1.1,
      instrument: 'UM982',
      recordedAt: DateTime.utc(2026, 10, 30, 9, 30),
    );
  }

  Future<(SurveyController, ManualGnssSource)> pumpPage(
    WidgetTester tester,
  ) async {
    final source = ManualGnssSource();
    final controller = SurveyController(
      store: FakeSurveySessionStore(session: session),
      source: source,
      sessionId: session.id,
    );
    addTearDown(controller.dispose);
    await controller.start();
    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: GnssPage(controller: controller, animateQuality: false),
      ),
    );
    return (controller, source);
  }

  SurveyPoint point(int number) {
    return SurveyPoint.fromPosition(
      id: 'point-$number',
      clientId: 'client-point-$number',
      projectId: session.projectId,
      surveyorId: session.surveyorId,
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

  Future<void> pumpFrames(WidgetTester tester) async {
    await tester.pump();
    await tester.pump();
  }

  Future<void> unmount(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  }

  testWidgets('T4 Float desactive le bouton et ecrit la raison', (
    tester,
  ) async {
    final (_, source) = await pumpPage(tester);
    source.emit(position(quality: GnssFixQuality.float));
    await tester.pump();

    expect(find.text('RTK Float'), findsOneWidget);
    expect(
      find.text('RTK Float : attendez le RTK Fixed pour enregistrer.'),
      findsOneWidget,
    );
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Enregistrer la borne'),
    );
    expect(button.onPressed, isNull);
    expect(
      find.text('Donnees simulees, pas de precision RTK annoncee.'),
      findsOneWidget,
    );

    await unmount(tester);
  });

  testWidgets('T4 bascule en theme nuit', (tester) async {
    await pumpPage(tester);

    await tester.tap(find.byTooltip('Theme nuit'));
    await tester.pump();

    final context = tester.element(find.text("Mesure d'une borne"));
    expect(Theme.of(context).brightness, Brightness.dark);
    expect(find.byTooltip('Theme jour'), findsOneWidget);

    await unmount(tester);
  });

  testWidgets('une perte du Fixed annule la moyenne en cours', (tester) async {
    final (_, source) = await pumpPage(tester);
    source.emit(position());
    await tester.pump();

    await tester.tap(find.text('Enregistrer la borne'));
    await tester.pump();
    for (var i = 0; i < 4; i++) {
      source.emit(position());
      await pumpFrames(tester);
    }
    expect(find.text('4 / 10'), findsOneWidget);

    source.emit(position(quality: GnssFixQuality.float));
    await pumpFrames(tester);

    expect(find.text('RTK Fixed perdu, mesure annulee.'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Aucune borne enregistree'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Aucune borne enregistree'), findsOneWidget);

    await unmount(tester);
  });

  testWidgets('deux vibrations au passage en RTK Fixed', (tester) async {
    final calls = <MethodCall>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'HapticFeedback.vibrate') calls.add(call);
      return null;
    });
    addTearDown(
      () => messenger.setMockMethodCallHandler(SystemChannels.platform, null),
    );

    final (_, source) = await pumpPage(tester);
    source.emit(position(quality: GnssFixQuality.float));
    await tester.pump();
    expect(calls, isEmpty);

    source.emit(position());
    await tester.pump();
    expect(calls, hasLength(2));

    source.emit(position());
    await tester.pump();
    expect(calls, hasLength(2));

    await unmount(tester);
  });

  testWidgets('termine la mission apres confirmation', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final source = ManualGnssSource();
    final controller = SurveyController(
      store: FakeSurveySessionStore(
        session: session,
        points: [point(1), point(2), point(3)],
      ),
      source: source,
      sessionId: session.id,
      clock: () => DateTime.utc(2026, 10, 30, 10),
    );
    addTearDown(controller.dispose);
    await controller.start();
    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: GnssPage(controller: controller, animateQuality: false),
      ),
    );
    await tester.pump();

    await tester.scrollUntilVisible(
      find.text('Terminer et enregistrer'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Terminer et enregistrer'));
    await tester.pumpAndSettle();

    expect(find.text('Confirmer la fin du leve'), findsOneWidget);

    await tester.tap(find.text('Confirmer la fin du leve'));
    await tester.pumpAndSettle();

    expect(controller.session!.status, SurveySessionStatus.completed);
    expect(controller.session!.perimeterMeters, isNotNull);
    expect(controller.session!.areaSquareMeters, isNotNull);

    await unmount(tester);
  });

  testWidgets('ouvre l ecran de choix du recepteur', (tester) async {
    await pumpPage(tester);

    await tester.tap(find.byTooltip('Choisir le recepteur'));
    await tester.pumpAndSettle();

    expect(find.text('Recepteur GNSS'), findsOneWidget);
    expect(find.text('Utiliser la simulation'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
