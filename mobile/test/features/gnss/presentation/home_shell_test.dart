import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/geosmart_app.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/theme_controller.dart';

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

  Future<ThemeController> pumpApp(WidgetTester tester) async {
    final store = FakeSurveySessionStore(session: session);
    final controller = SurveyController(
      store: store,
      source: ManualGnssSource(),
      sessionId: session.id,
    );
    addTearDown(controller.dispose);
    final theme = ThemeController();
    addTearDown(theme.dispose);
    await tester.pumpWidget(
      GeoSmartApp(controller: controller, themeController: theme),
    );
    await tester.pump();
    await tester.pump();
    return theme;
  }

  Finder navLabel(String label) => find.descendant(
    of: find.byType(NavigationBar),
    matching: find.text(label),
  );

  testWidgets('reste en theme clair meme si le systeme est sombre', (
    tester,
  ) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);

    await pumpApp(tester);

    final context = tester.element(find.text('Mes missions'));
    expect(Theme.of(context).brightness, Brightness.light);
  });

  testWidgets('la barre du bas separe accueil et parametres', (tester) async {
    await pumpApp(tester);

    expect(navLabel('Accueil'), findsOneWidget);
    expect(navLabel('Parametres'), findsOneWidget);
    expect(tester.widget<IndexedStack>(find.byType(IndexedStack)).index, 0);

    await tester.tap(navLabel('Parametres'));
    await tester.pumpAndSettle();

    expect(tester.widget<IndexedStack>(find.byType(IndexedStack)).index, 1);

    await tester.tap(navLabel('Accueil'));
    await tester.pumpAndSettle();

    expect(tester.widget<IndexedStack>(find.byType(IndexedStack)).index, 0);
  });

  testWidgets('le theme choisi s applique a toutes les pages', (tester) async {
    final theme = await pumpApp(tester);

    await tester.tap(navLabel('Parametres'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Theme sombre'));
    await tester.pumpAndSettle();

    expect(theme.mode, ThemeMode.dark);
    final settingsContext = tester.element(find.text('Apparence'));
    expect(Theme.of(settingsContext).brightness, Brightness.dark);

    await tester.tap(navLabel('Accueil'));
    await tester.pumpAndSettle();

    final homeContext = tester.element(find.text('Mes missions'));
    expect(Theme.of(homeContext).brightness, Brightness.dark);

    await tester.tap(navLabel('Parametres'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Theme clair'));
    await tester.pumpAndSettle();

    expect(theme.mode, ThemeMode.light);
    final lightContext = tester.element(find.text('Apparence'));
    expect(Theme.of(lightContext).brightness, Brightness.light);
  });
}
