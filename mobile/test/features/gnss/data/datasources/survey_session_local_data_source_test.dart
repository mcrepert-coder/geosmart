import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/database/local_database.dart';
import 'package:geosmart_mobile/features/gnss/data/datasources/survey_session_local_data_source.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/sync_queue_store.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();

  late Database database;
  late SurveySessionLocalDataSource store;

  final session = SurveySession(
    id: 'session-1',
    clientId: 'client-session-1',
    projectId: 'project-1',
    surveyorId: 'surveyor-1',
    title: 'Leve parcelle A',
    createdAt: DateTime.utc(2026, 10, 30, 9),
  );

  SurveyPoint point({required int number, String? id}) {
    final quality = GnssFixQuality.fixed;
    return SurveyPoint.fromPosition(
      id: id ?? 'point-$number',
      clientId: 'client-point-$number',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      pointNumber: number,
      pointName: 'B$number',
      position: GnssPosition(
        latitude: 6.13192 + number / 100000,
        longitude: 1.22281 + number / 100000,
        altitude: 12.5,
        accuracy: 0.012,
        fixQuality: quality,
        satellitesCount: 18,
        pdop: 1.4,
        hdop: 0.8,
        vdop: 1.1,
        recordedAt: DateTime.utc(2026, 10, 30, 9, 10 + number),
      ),
    );
  }

  setUp(() async {
    database = await LocalDatabase.open(
      factory: databaseFactoryFfi,
      path: inMemoryDatabasePath,
    );
    store = SurveySessionLocalDataSource(database);
  });

  tearDown(() async {
    await database.close();
  });

  group('SurveySessionLocalDataSource', () {
    test('cree puis relit une mission vide', () async {
      await store.createSession(session);

      final loaded = await store.loadSession(session.id);

      expect(loaded, isNotNull);
      expect(loaded!.title, 'Leve parcelle A');
      expect(loaded.status, SurveySessionStatus.draft);
      expect(loaded.points, isEmpty);
    });

    test('ajoute une borne et passe la mission en cours', () async {
      await store.createSession(session);

      await store.addPoint(session.id, point(number: 1));

      final loaded = await store.loadSession(session.id);
      expect(loaded!.status, SurveySessionStatus.inProgress);
      expect(loaded.points, hasLength(1));
      expect(loaded.points.single.pointName, 'B1');
      expect(loaded.points.single.isValidated, isTrue);
    });

    test('relit les bornes dans l ordre du leve', () async {
      await store.createSession(session);
      await store.addPoint(session.id, point(number: 3));
      await store.addPoint(session.id, point(number: 1));
      await store.addPoint(session.id, point(number: 2));

      final points = await store.pointsFor(session.id);

      expect(points.map((p) => p.pointNumber), [1, 2, 3]);
    });

    test('refuse une mission en double', () async {
      await store.createSession(session);

      expect(
        () => store.createSession(session),
        throwsA(isA<DatabaseException>()),
      );
    });

    test('supprime une borne sans toucher aux autres', () async {
      await store.createSession(session);
      await store.addPoint(session.id, point(number: 1));
      await store.addPoint(session.id, point(number: 2));

      await store.removePoint('point-1');

      final points = await store.pointsFor(session.id);
      expect(points.map((p) => p.id), ['point-2']);
    });

    test('supprime les bornes avec la mission', () async {
      await store.createSession(session);
      await store.addPoint(session.id, point(number: 1));

      await database.delete(
        'survey_sessions',
        where: 'id = ?',
        whereArgs: [session.id],
      );

      final points = await store.pointsFor(session.id);
      expect(points, isEmpty);
    });

    test('met a jour la mission sans toucher aux bornes', () async {
      await store.createSession(session);
      await store.addPoint(session.id, point(number: 1));
      final loaded = (await store.loadSession(session.id))!;

      await store.saveSession(
        loaded.copyWith(
          status: SurveySessionStatus.completed,
          perimeterMeters: 12.5,
          areaSquareMeters: 8.0,
        ),
      );

      final reloaded = await store.loadSession(session.id);
      expect(reloaded!.status, SurveySessionStatus.completed);
      expect(reloaded.perimeterMeters, 12.5);
      expect(reloaded.areaSquareMeters, 8.0);
      expect(reloaded.points, hasLength(1));
    });

    test('refuse de mettre a jour une mission inconnue', () async {
      expect(() => store.saveSession(session), throwsStateError);
    });
  });

  group('SurveySessionLocalDataSource - file d envoi', () {
    late SurveySession completed;

    setUp(() async {
      await store.createSession(session);
      completed = session.copyWith(status: SurveySessionStatus.completed);
      await store.saveSession(completed);
    });

    test('enfile une mission terminee une seule fois', () async {
      await store.enqueue(completed);
      await store.enqueue(completed);

      expect(await store.pendingCount(), 1);
      final entry = (await store.pending()).single;
      expect(entry.sessionId, session.id);
      expect(entry.clientId, session.clientId);
      expect(entry.status, SyncQueueStatus.pending);
      expect(entry.attempts, 0);
      expect(entry.lastError, isNull);
    });

    test('marque une mission synchronisee', () async {
      await store.enqueue(completed);

      await store.markSynced(session.id);

      expect(await store.pendingCount(), 0);
    });

    test('un echec reseau garde la mission en attente', () async {
      await store.enqueue(completed);

      await store.markFailed(session.id, 'reseau indisponible');

      final entry = (await store.pending()).single;
      expect(entry.attempts, 1);
      expect(entry.lastError, 'reseau indisponible');
    });

    test('un refus metier retire la mission de la file', () async {
      await store.enqueue(completed);

      await store.markRejected(session.id, 'refus serveur');

      expect(await store.pendingCount(), 0);
    });

    test('markPending remet une mission refusee en attente', () async {
      await store.enqueue(completed);
      await store.markRejected(session.id, 'refus serveur');

      await store.markPending(session.id);

      expect(await store.pendingCount(), 1);
    });
  });
}
