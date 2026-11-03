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

    test('deplace une mission en brouillon ou en cours dans la corbeille', () async {
      final store = FakeMultiSessionStore(
        sessions: [
          mission(
            'draft-1',
            title: 'Mission Brouillon',
            createdAt: DateTime.utc(2026, 10, 28),
            status: SurveySessionStatus.draft,
          ),
          mission(
            'in-progress-1',
            title: 'Mission En cours',
            createdAt: DateTime.utc(2026, 10, 29),
            status: SurveySessionStatus.inProgress,
          ),
        ],
      );
      final controller = MissionsController(
        store: store,
        clock: () => DateTime.utc(2026, 10, 31, 12),
      );
      addTearDown(controller.dispose);
      await controller.load();

      final deleted = await controller.deleteMission('draft-1');

      expect(deleted, isTrue);
      expect(controller.error, isNull);
      expect(controller.missions.map((m) => m.id), ['in-progress-1']);
      expect(controller.trash.map((m) => m.id), ['draft-1']);
      expect(controller.trashCount, 1);
      expect(controller.trash.first.deletedAt, DateTime.utc(2026, 10, 31, 12));
      expect(store.trashCalls, 1);
    });

    test('restaure une mission placee dans la corbeille', () async {
      final store = FakeMultiSessionStore(
        sessions: [
          mission(
            'draft-1',
            title: 'Mission Brouillon',
            createdAt: DateTime.utc(2026, 10, 28),
            status: SurveySessionStatus.draft,
          ),
        ],
      );
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);
      await controller.load();

      await controller.deleteMission('draft-1');
      expect(controller.missions, isEmpty);
      expect(controller.trashCount, 1);

      final restored = await controller.restoreMission('draft-1');

      expect(restored, isTrue);
      expect(controller.trashCount, 0);
      expect(controller.missions, hasLength(1));
      expect(controller.missions.first.id, 'draft-1');
      expect(controller.missions.first.inTrash, isFalse);
      expect(store.restoreCalls, 1);
    });

    test('supprime definitivement une mission de la corbeille', () async {
      final store = FakeMultiSessionStore(
        sessions: [
          mission(
            'draft-1',
            title: 'Mission A',
            createdAt: DateTime.utc(2026, 10, 28),
          ),
        ],
      );
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);
      await controller.load();
      await controller.deleteMission('draft-1');

      final deletedPermanently = await controller.permanentlyDelete('draft-1');

      expect(deletedPermanently, isTrue);
      expect(controller.trash, isEmpty);
      expect(store.deleteCalls, 1);
    });

    test('vide toute la corbeille', () async {
      final store = FakeMultiSessionStore(
        sessions: [
          mission('m1', title: 'M1', createdAt: DateTime.utc(2026, 10, 28)),
          mission('m2', title: 'M2', createdAt: DateTime.utc(2026, 10, 29)),
        ],
      );
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);
      await controller.load();
      await controller.deleteMission('m1');
      await controller.deleteMission('m2');

      expect(controller.trashCount, 2);

      final emptied = await controller.emptyTrash();

      expect(emptied, isTrue);
      expect(controller.trash, isEmpty);
      expect(store.deleteCalls, 2);
    });

    test('load purge automatiquement les missions en corbeille depuis plus de 7 jours', () async {
      final clockTime = DateTime.utc(2026, 11, 10, 12);
      final store = FakeMultiSessionStore(
        sessions: [
          // En corbeille depuis 8 jours (> 7 jours)
          SurveySession(
            id: 'old-trash',
            clientId: 'client-old',
            projectId: 'p1',
            surveyorId: 's1',
            title: 'Vieille corbeille',
            status: SurveySessionStatus.draft,
            createdAt: DateTime.utc(2026, 10, 20),
            deletedAt: clockTime.subtract(const Duration(days: 8)),
          ),
          // En corbeille depuis 3 jours (< 7 jours)
          SurveySession(
            id: 'recent-trash',
            clientId: 'client-recent',
            projectId: 'p1',
            surveyorId: 's1',
            title: 'Corbeille recente',
            status: SurveySessionStatus.draft,
            createdAt: DateTime.utc(2026, 10, 25),
            deletedAt: clockTime.subtract(const Duration(days: 3)),
          ),
        ],
      );
      final controller = MissionsController(
        store: store,
        clock: () => clockTime,
      );
      addTearDown(controller.dispose);

      await controller.load();

      expect(store.purgeCalls, 1);
      expect(controller.trash.map((m) => m.id), ['recent-trash']);
      expect(controller.trashCount, 1);
    });

    test('refuse de supprimer une mission terminee ou synchronisee', () async {
      final store = FakeMultiSessionStore(
        sessions: [
          mission(
            'completed-1',
            title: 'Mission Terminee',
            createdAt: DateTime.utc(2026, 10, 28),
            status: SurveySessionStatus.completed,
          ),
          mission(
            'synced-1',
            title: 'Mission Synchronisee',
            createdAt: DateTime.utc(2026, 10, 29),
            status: SurveySessionStatus.synced,
          ),
        ],
      );
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);
      await controller.load();

      final deletedCompleted = await controller.deleteMission('completed-1');
      expect(deletedCompleted, isFalse);
      expect(controller.error, contains('brouillon ou en cours'));
      expect(store.deleteCalls, 0);

      final deletedSynced = await controller.deleteMission('synced-1');
      expect(deletedSynced, isFalse);
      expect(controller.error, contains('brouillon ou en cours'));
      expect(store.deleteCalls, 0);
    });

    test('signale une erreur si la mission a supprimer est introuvable', () async {
      final store = FakeMultiSessionStore();
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);
      await controller.load();

      final deleted = await controller.deleteMission('inconnue');

      expect(deleted, isFalse);
      expect(controller.error, contains('introuvable'));
      expect(store.deleteCalls, 0);
    });

    test('signale un echec de suppression locale', () async {
      final store = FakeMultiSessionStore(
        sessions: [
          mission(
            'draft-1',
            title: 'Mission A',
            createdAt: DateTime.utc(2026, 10, 28),
          ),
        ],
      )..failDelete = true;
      final controller = MissionsController(store: store);
      addTearDown(controller.dispose);
      await controller.load();

      final deleted = await controller.deleteMission('draft-1');

      expect(deleted, isFalse);
      expect(controller.error, contains('pas pu etre supprimee'));
      expect(controller.missions, hasLength(1));
    });
  });
}
