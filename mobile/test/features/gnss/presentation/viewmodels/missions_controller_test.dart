import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/missions_controller.dart';

import '../../../../support/fake_multi_session_store.dart';

void main() {
  SurveySession mission(
    String id, {
    required String title,
    required DateTime createdAt,
    SurveySessionStatus status = SurveySessionStatus.draft,
  }) {
    return SurveySession(
      id: id,
      clientId: 'client-$id',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      title: title,
      status: status,
      createdAt: createdAt,
    );
  }

  group('MissionsController', () {
    test('liste les missions de la plus recente a la plus ancienne', () async {
      final store = FakeMultiSessionStore(
        sessions: [
          mission(
            'ancienne',
            title: 'Ancienne',
            createdAt: DateTime.utc(2026, 10, 28),
          ),
          mission(
            'recente',
            title: 'Recente',
            createdAt: DateTime.utc(2026, 10, 30),
          ),
        ],
      );
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);

      await controller.load();

      expect(controller.isLoading, isFalse);
      expect(controller.error, isNull);
      expect(controller.missions.map((value) => value.id), [
        'recente',
        'ancienne',
      ]);
    });

    test('cree une mission locale et la place en tete', () async {
      final store = FakeMultiSessionStore(
        sessions: [
          mission(
            'ancienne',
            title: 'Ancienne',
            createdAt: DateTime.utc(2026, 10, 28),
          ),
        ],
      );
      var nextId = 0;
      final controller = MissionsController(
        store: store,
        idGenerator: () => 'id-${nextId++}',
        clock: () => DateTime.utc(2026, 10, 31, 8),
      );
      addTearDown(controller.dispose);
      await controller.load();

      final created = await controller.createMission(title: '  Leve B  ');

      expect(created, isNotNull);
      expect(created!.title, 'Leve B');
      expect(created.projectId, 'demo-project');
      expect(created.surveyorId, 'demo-surveyor');
      expect(created.status, SurveySessionStatus.draft);
      expect(created.createdAt, DateTime.utc(2026, 10, 31, 8));
      expect(controller.missions.first.id, created.id);
      expect(store.createCalls, 1);
    });

    test('refuse un nom vide', () async {
      final store = FakeMultiSessionStore();
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);
      await controller.load();

      final created = await controller.createMission(title: '   ');

      expect(created, isNull);
      expect(controller.error, contains('obligatoire'));
      expect(store.createCalls, 0);
    });

    test('signale un echec d ecriture locale', () async {
      final store = FakeMultiSessionStore()..failCreate = true;
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);
      await controller.load();

      final created = await controller.createMission(title: 'Leve C');

      expect(created, isNull);
      expect(controller.error, contains('pas pu etre creee'));
      expect(controller.missions, isEmpty);
    });
  });
}
