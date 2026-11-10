import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/sync_queue_store.dart';
import 'package:geosmart_mobile/features/sync/data/sync_api.dart';
import 'package:geosmart_mobile/features/sync/domain/sync_processor.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../../../support/fake_survey_store.dart';
import '../../../support/fake_sync_queue.dart';

void main() {
  SurveyPoint point(int number) => SurveyPoint(
    id: 'point-$number',
    clientId: 'client-point-$number',
    projectId: 'project-1',
    surveyorId: 'surveyor-1',
    pointNumber: number,
    pointName: 'B$number',
    latitude: 6.13192 + number / 100000,
    longitude: 1.22281 + number / 100000,
    fixQuality: GnssFixQuality.fixed,
    satellitesCount: 18,
    pdop: 1.2,
    instrument: 'UM982',
    recordedAt: DateTime.utc(2026, 10, 30, 9),
  );

  SurveySession readySession() => SurveySession(
    id: 'session-1',
    clientId: 'client-session-1',
    projectId: 'project-1',
    surveyorId: 'surveyor-1',
    title: 'Leve parcelle A',
    status: SurveySessionStatus.completed,
    points: [point(1), point(2), point(3)],
    perimeterMeters: 44.4,
    areaSquareMeters: 123,
    createdAt: DateTime.utc(2026, 10, 30, 9),
    completedAt: DateTime.utc(2026, 10, 30, 10),
  );

  Future<(FakeSurveySessionStore, FakeSyncQueueStore)> seededQueue(
    SurveySession session,
  ) async {
    final store = FakeSurveySessionStore(
      session: session,
      points: session.points,
    );
    final queue = FakeSyncQueueStore();
    await queue.enqueue(session);
    return (store, queue);
  }

  SyncApi apiWith(
    Future<http.Response> Function(http.Request request) handler, {
    Future<String?> Function() token = _constantToken,
  }) => SyncApi(
    MockClient(handler),
    baseUrl: 'https://api.test',
    token: token,
  );

  group('SyncApi', () {
    test('envoie le jeton du compte connecte', () async {
      late http.Request seen;
      final api = apiWith((request) async {
        seen = request;
        return http.Response('{}', 200);
      });

      await api.send({'clientId': 'x'});

      expect(seen.url.path, '/sync');
      expect(seen.headers['Authorization'], 'Bearer jeton');
    });

    test('une erreur serveur sans JSON garde le statut HTTP', () async {
      final api = apiWith((request) async => http.Response('', 503));

      await expectLater(
        api.send({}),
        throwsA(
          isA<SyncApiException>()
              .having((error) => error.status, 'status', 503)
              .having((error) => error.isBusiness, 'isBusiness', isFalse),
        ),
      );
    });
  });

  group('SyncProcessor (EF-405)', () {
    test('envoi accepte : la file est videe', () async {
      final (store, queue) = await seededQueue(readySession());
      late Map<String, dynamic> sentBody;
      final api = apiWith((request) async {
        sentBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({'clientId': 'client-session-1', 'result': 'ACCEPTED'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final result = await SyncProcessor(
        sessions: store,
        queue: queue,
        api: api,
      ).flush();

      expect(result.sent, 1);
      expect(result.remaining, 0);
      expect(sentBody['clientId'], 'client-session-1');
      expect(
        queue.entries['session-1']?.status,
        SyncQueueStatus.synced,
      );
    });

    test('refus metier (400 RG-01) : conserve avec son motif', () async {
      final (store, queue) = await seededQueue(readySession());
      final api = apiWith(
        (request) async => http.Response(
          jsonEncode({
            'code': 'VALIDATION_ERROR',
            'message': 'Le point officiel doit etre en RTK Fixed (RG-01).',
            'details': {'clientId': 'client-session-1'},
          }),
          400,
          headers: {'content-type': 'application/json'},
        ),
      );

      final result = await SyncProcessor(
        sessions: store,
        queue: queue,
        api: api,
      ).flush();

      expect(result.rejected, 1);
      final entry = queue.entries['session-1'];
      expect(entry?.status, SyncQueueStatus.rejected);
      expect(entry?.lastError, contains('RG-01'));
    });

    test('interdit (403) : refuse avec le motif du serveur', () async {
      final (store, queue) = await seededQueue(readySession());
      final api = apiWith(
        (request) async => http.Response(
          jsonEncode({
            'code': 'FORBIDDEN',
            'message': 'Action non autorisee pour votre role.',
          }),
          403,
          headers: {'content-type': 'application/json'},
        ),
      );

      final result = await SyncProcessor(
        sessions: store,
        queue: queue,
        api: api,
      ).flush();

      expect(result.rejected, 1);
      expect(queue.entries['session-1']?.status, SyncQueueStatus.rejected);
    });

    test('panne serveur (503) : la mission reste en attente pour la reprise', () async {
      final (store, queue) = await seededQueue(readySession());
      final api = apiWith((request) async => http.Response('', 503));

      final result = await SyncProcessor(
        sessions: store,
        queue: queue,
        api: api,
      ).flush();

      expect(result.failed, 1);
      expect(result.remaining, 1);
      expect(queue.entries['session-1']?.status, SyncQueueStatus.pending);
    });

    test('reseau coupe : la mission reste en attente', () async {
      final (store, queue) = await seededQueue(readySession());
      final api = apiWith(
        (request) async => throw http.ClientException('Pas de reseau'),
      );

      final result = await SyncProcessor(
        sessions: store,
        queue: queue,
        api: api,
      ).flush();

      expect(result.failed, 1);
      expect(queue.entries['session-1']?.status, SyncQueueStatus.pending);
    });

    test('mission locale introuvable : refusee', () async {
      final store = FakeSurveySessionStore();
      final queue = FakeSyncQueueStore();
      await queue.enqueue(readySession());
      final api = apiWith((request) async => http.Response('{}', 200));

      final result = await SyncProcessor(
        sessions: store,
        queue: queue,
        api: api,
      ).flush();

      expect(result.rejected, 1);
      expect(queue.entries['session-1']?.status, SyncQueueStatus.rejected);
    });
  });
}

Future<String?> _constantToken() async => 'jeton';
