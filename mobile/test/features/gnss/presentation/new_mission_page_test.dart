import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/presentation/new_mission_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/missions_controller.dart';

import '../../../support/fake_multi_session_store.dart';

void main() {
  Future<MissionsController> openForm(
    WidgetTester tester,
    FakeMultiSessionStore store,
  ) async {
    final missions = MissionsController(
      store: store,
      defaultProjectId: 'project-test',
      defaultSurveyorId: 'surveyor-test',
    );
    addTearDown(missions.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<dynamic>(
                    builder: (_) => NewMissionPage(missions: missions),
                  ),
                ),
                child: const Text('Ouvrir'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Ouvrir'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    return missions;
  }

  testWidgets('refuse un nom vide', (tester) async {
    final store = FakeMultiSessionStore();
    await openForm(tester, store);

    await tester.tap(find.text('Creer la mission'));
    await tester.pump();

    expect(find.text('Le nom de la mission est obligatoire.'), findsOneWidget);
    expect(store.createCalls, 0);
  });

  testWidgets('cree la mission puis ferme le formulaire', (tester) async {
    final store = FakeMultiSessionStore();
    await openForm(tester, store);

    await tester.enterText(find.byType(TextField), 'Leve parcelle B');
    await tester.tap(find.text('Creer la mission'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(store.stored, hasLength(1));
    expect(store.stored.single.title, 'Leve parcelle B');
    expect(find.text('Nouvelle mission'), findsNothing);
  });

  testWidgets('affiche un echec d ecriture', (tester) async {
    final store = FakeMultiSessionStore()..failCreate = true;
    await openForm(tester, store);

    await tester.enterText(find.byType(TextField), 'Leve parcelle C');
    await tester.tap(find.text('Creer la mission'));
    await tester.pump();
    await tester.pump();

    expect(find.text('La mission n a pas pu etre creee.'), findsOneWidget);
    expect(find.text('Nouvelle mission'), findsOneWidget);
  });
}
