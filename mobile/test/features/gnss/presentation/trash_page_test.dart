import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/presentation/trash_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/missions_controller.dart';

import '../../../support/fake_multi_session_store.dart';

final _trashTestNow = DateTime.utc(2026, 11, 3);

void main() {
  SurveySession trashSession(
    String id, {
    required String title,
    DateTime? deletedAt,
    SurveySessionStatus status = SurveySessionStatus.draft,
  }) {
    return SurveySession(
      id: id,
      clientId: 'client-$id',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      title: title,
      status: status,
      createdAt: DateTime.utc(2026, 10, 20),
      deletedAt: deletedAt ?? DateTime.utc(2026, 11, 1),
    );
  }

  Future<void> pumpTrashPage(
    WidgetTester tester, {
    required MissionsController missions,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: TrashPage(missions: missions),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('affiche l etat vide quand aucune mission n est en corbeille', (
    tester,
  ) async {
    final store = FakeMultiSessionStore();
    final missions = MissionsController(
      store: store,
      clock: () => _trashTestNow,
    );
    addTearDown(missions.dispose);
    await missions.load();

    await pumpTrashPage(tester, missions: missions);

    expect(find.text('Corbeille'), findsOneWidget);
    expect(find.text('Corbeille vide'), findsOneWidget);
    expect(find.text('Vider'), findsNothing);
  });

  testWidgets('affiche les missions en corbeille avec le bouton vider', (
    tester,
  ) async {
    final store = FakeMultiSessionStore(
      sessions: [
        trashSession('m1', title: 'Mission A'),
        trashSession(
          'm2',
          title: 'Mission B',
          status: SurveySessionStatus.inProgress,
        ),
      ],
    );
    final missions = MissionsController(
      store: store,
      clock: () => _trashTestNow,
    );
    addTearDown(missions.dispose);
    await missions.load();

    await pumpTrashPage(tester, missions: missions);

    expect(find.text('Mission A'), findsOneWidget);
    expect(find.text('Mission B'), findsOneWidget);
    expect(find.text('Brouillon'), findsOneWidget);
    expect(find.text('En cours'), findsOneWidget);
    expect(find.text('Vider'), findsOneWidget);
  });

  testWidgets('restaure une mission depuis la corbeille', (tester) async {
    final store = FakeMultiSessionStore(
      sessions: [trashSession('m1', title: 'Mission A')],
    );
    final missions = MissionsController(
      store: store,
      clock: () => _trashTestNow,
    );
    addTearDown(missions.dispose);
    await missions.load();

    await pumpTrashPage(tester, missions: missions);

    expect(find.text('Mission A'), findsOneWidget);

    await tester.tap(find.byKey(const Key('restore-mission-m1')));
    await tester.pump();
    await tester.pump();

    expect(find.text('Mission A'), findsNothing);
    expect(find.text('Corbeille vide'), findsOneWidget);
    expect(missions.missions, hasLength(1));
    expect(missions.missions.first.id, 'm1');
    expect(store.restoreCalls, 1);
  });

  testWidgets('supprime definitivement une mission apres confirmation', (
    tester,
  ) async {
    final store = FakeMultiSessionStore(
      sessions: [trashSession('m1', title: 'Mission A')],
    );
    final missions = MissionsController(
      store: store,
      clock: () => _trashTestNow,
    );
    addTearDown(missions.dispose);
    await missions.load();

    await pumpTrashPage(tester, missions: missions);

    await tester.tap(find.byKey(const Key('permanent-delete-m1')));
    await tester.pump();

    expect(find.text('Supprimer definitivement Mission A ?'), findsOneWidget);

    // Annuler d'abord
    await tester.tap(find.text('Annuler'));
    await tester.pump();
    expect(find.text('Mission A'), findsOneWidget);
    expect(store.deleteCalls, 0);

    // Confirmer
    await tester.tap(find.byKey(const Key('permanent-delete-m1')));
    await tester.pump();
    await tester.tap(find.text('Supprimer'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Mission A'), findsNothing);
    expect(store.deleteCalls, 1);
  });

  testWidgets('vide toute la corbeille apres confirmation', (tester) async {
    final store = FakeMultiSessionStore(
      sessions: [
        trashSession('m1', title: 'Mission A'),
        trashSession('m2', title: 'Mission B'),
      ],
    );
    final missions = MissionsController(
      store: store,
      clock: () => _trashTestNow,
    );
    addTearDown(missions.dispose);
    await missions.load();

    await pumpTrashPage(tester, missions: missions);

    await tester.tap(find.byKey(const Key('empty-trash-button')));
    await tester.pump();

    await tester.tap(find.text('Vider la corbeille ?'));
    await tester.pump();

    expect(find.text('Vider la corbeille ?'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('Vider'),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Corbeille vide'), findsOneWidget);
    expect(missions.trash, isEmpty);
    expect(store.deleteCalls, 2);
  });
}
