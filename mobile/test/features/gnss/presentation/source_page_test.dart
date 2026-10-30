import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_device.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/presentation/source_page.dart';
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

  Future<void> settleAsync(WidgetTester tester) async {
    await tester.pump();
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pumpAndSettle();
  }

  Future<SurveyController> pumpSourcePage(
    WidgetTester tester, {
    GnssScan? scanDevices,
    GnssSourceBuilder? simulatedSource,
    GnssAddressSourceBuilder? nativeSource,
  }) async {
    final controller = SurveyController(
      store: FakeSurveySessionStore(session: session),
      source: ManualGnssSource(),
      sessionId: session.id,
    );
    addTearDown(controller.dispose);
    await controller.start();

    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => GnssSourcePage(
                      controller: controller,
                      scanDevices: scanDevices,
                      simulatedSource: simulatedSource,
                      nativeSource: nativeSource,
                    ),
                  ),
                ),
                child: const Text('ouvrir'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('ouvrir'));
    await tester.pumpAndSettle();
    return controller;
  }

  testWidgets('affiche la source courante et la simulation', (tester) async {
    await pumpSourcePage(tester);

    expect(find.text('Recepteur GNSS'), findsOneWidget);
    expect(find.text('Simulation Dart'), findsOneWidget);
    expect(find.text('Utiliser la simulation'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('liste les recepteurs trouves par le scan', (tester) async {
    await pumpSourcePage(
      tester,
      scanDevices: () async => const [
        GnssDevice(
          name: 'UM982_GNSS',
          address: 'AA:BB:CC:DD:EE:FF',
          isBonded: true,
        ),
      ],
    );

    await tester.tap(find.text('Rechercher un recepteur'));
    await tester.pumpAndSettle();

    expect(find.text('UM982_GNSS'), findsOneWidget);
    expect(find.text('AA:BB:CC:DD:EE:FF'), findsOneWidget);
    expect(find.text('Appaire'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('refuse une adresse MAC invalide', (tester) async {
    await pumpSourcePage(tester);

    await tester.scrollUntilVisible(
      find.text('Adresse MAC du recepteur'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(find.byType(TextField), 'ZZ');
    await tester.tap(find.text('Connecter ce recepteur'));
    await tester.pump();

    expect(
      find.text('Adresse Bluetooth invalide, format AA:BB:CC:DD:EE:FF.'),
      findsOneWidget,
    );

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('bascule vers la simulation demandee', (tester) async {
    final next = ManualGnssSource();
    addTearDown(next.stop);
    final controller = await pumpSourcePage(
      tester,
      simulatedSource: () => next,
    );

    await tester.tap(
      find.widgetWithText(FilledButton, 'Utiliser la simulation'),
    );
    await settleAsync(tester);

    expect(controller.source, same(next));
    expect(next.started, isTrue);
    expect(find.text('Recepteur GNSS'), findsNothing);

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('connecte le recepteur saisi a la main', (tester) async {
    final next = ManualGnssSource();
    addTearDown(next.stop);
    final controller = await pumpSourcePage(tester, nativeSource: (_) => next);

    await tester.scrollUntilVisible(
      find.text('Adresse MAC du recepteur'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(find.byType(TextField), 'aa:bb:cc:dd:ee:ff');
    await tester.tap(find.text('Connecter ce recepteur'));
    await settleAsync(tester);

    expect(controller.source, same(next));
    expect(next.started, isTrue);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
