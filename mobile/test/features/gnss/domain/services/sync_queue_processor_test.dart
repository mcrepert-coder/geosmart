import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/domain/services/sync_queue_processor.dart';

import '../../../../support/fake_survey_store.dart';
import '../../../../support/fake_sync_queue.dart';

void main() {
  SurveyPoint point(
    int number, {
    GnssFixQuality quality = GnssFixQuality.fixed,
  }) {
    return SurveyPoint(
      id: 'point-$number',
      clientId: 'client-point-$number',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      pointNumber: number,
      pointName: 'B$number',
      latitude: 6.13192 + number / 100000,
      longitude: 1.22281 + number / 100000,
      fixQuality: quality,
      satellitesCount: 18,
      pdop: 1.2,
      instrument: 'UM982',
      recordedAt: DateTime.utc(2026, 10, 30, 9),
    );
  }

  SurveySession session({
    SurveySessionStatus status = SurveySessionStatus.completed,
    List<SurveyPoint>? points,
    double? perimeterMeters = 44.4,
    double? areaSquareMeters = 123,
  }) {
    return SurveySession(
      id: 'session-1',
      clientId: 'client-session-1',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      title: 'Leve parcelle A',
      status: status,
      points: points ?? [point(1), point(2), point(3)],
      perimeterMeters: perimeterMeters,
      areaSquareMeters: areaSquareMeters,
      createdAt: DateTime.utc(2026, 10, 30, 9),
      completedAt: DateTime.utc(2026, 10, 30, 10),
    );
  }

  group('SyncQueueProcessor', () {
    test('envoie une mission prete et la marque synchronisee', () async {
      final ready = session();
      final store = FakeSurveySessionStore(
        session: ready,
        points: ready.points,
      );
      final queue = FakeSyncQueueStore();
      final transport = FakeSyncTransport();
      await queue.enqueue(ready);

      final result = await SyncQueueProcessor(
        sessions: store,
        queue: queue,
        transport: transport,
      ).flush();

      expect(result.sent, 1);
      expect(result.hasFailures, isFalse);
      expect(result.remaining, 0);
      expect(transport.sent.single['entityType'], 'survey_session');
      expect(store.session?.status, SurveySessionStatus.synced);
    });

    test('refuse une mission non terminee', () async {
      final draft = session(status: SurveySessionStatus.draft);
      final store = FakeSurveySessionStore(
        session: draft,
        points: draft.points,
      );
      final queue = FakeSyncQueueStore();
      final transport = FakeSyncTransport();
      await queue.enqueue(draft);

      final result = await SyncQueueProcessor(
        sessions: store,
        queue: queue,
        transport: transport,
      ).flush();

      expect(result.rejected, 1);
      expect(result.sent, 0);
      expect(transport.sent, isEmpty);
      expect(queue.entries[draft.id]?.status, isNotNull);
      expect(queue.entries[draft.id]?.status.name, 'rejected');
    });

    test('refuse une mission sans mesures', () async {
      final incomplete = session(perimeterMeters: null, areaSquareMeters: null);
      final store = FakeSurveySessionStore(
        session: incomplete,
        points: incomplete.points,
      );
      final queue = FakeSyncQueueStore();
      await queue.enqueue(incomplete);

      final result = await SyncQueueProcessor(
        sessions: store,
        queue: queue,
        transport: FakeSyncTransport(),
      ).flush();

      expect(result.rejected, 1);
      expect(queue.entries[incomplete.id]?.lastError, contains('perimetre'));
    });

    test('garde la mission en attente apres une panne reseau', () async {
      final ready = session();
      final store = FakeSurveySessionStore(
        session: ready,
        points: ready.points,
      );
      final queue = FakeSyncQueueStore();
      final transport = FakeSyncTransport()
        ..failure = StateError('reseau indisponible');
      await queue.enqueue(ready);

      final result = await SyncQueueProcessor(
        sessions: store,
        queue: queue,
        transport: transport,
      ).flush();

      expect(result.failed, 1);
      expect(result.remaining, 1);
      expect(queue.entries[ready.id]?.attempts, 1);
      expect(store.session?.status, SurveySessionStatus.completed);
    });

    test('rejette une mission locale introuvable', () async {
      final ready = session();
      final queue = FakeSyncQueueStore();
      await queue.enqueue(ready);

      final result = await SyncQueueProcessor(
        sessions: FakeSurveySessionStore(),
        queue: queue,
        transport: FakeSyncTransport(),
      ).flush();

      expect(result.rejected, 1);
      expect(queue.entries[ready.id]?.lastError, contains('introuvable'));
    });
  });
}
