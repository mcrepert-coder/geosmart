import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/sync_queue_store.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';

import '../../../../support/fake_survey_store.dart';
import '../../../../support/fake_sync_queue.dart';

void main() {
  late FakeSurveySessionStore store;
  late ManualGnssSource source;
  late SurveyController controller;
  late List<SurveyEvent> events;

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
    double longitude = 1.22281,
    double? pdop = 1.4,
    int satellites = 18,
  }) {
    return GnssPosition(
      latitude: latitude,
      longitude: longitude,
      altitude: 12.5,
      accuracy: quality == GnssFixQuality.fixed ? 0.012 : 0.4,
      fixQuality: quality,
      satellitesCount: satellites,
      pdop: pdop,
      hdop: 0.8,
      vdop: 1.1,
      instrument: 'UM982',
      recordedAt: DateTime.utc(2026, 10, 30, 9, 30),
    );
  }

  Future<void> settle() => pumpEventQueue();

  setUp(() async {
    store = FakeSurveySessionStore(session: session);
    source = ManualGnssSource();
    var nextId = 0;
    controller = SurveyController(
      store: store,
      source: source,
      sessionId: session.id,
      idGenerator: () => 'id-${nextId++}',
      clock: () => DateTime.utc(2026, 10, 30, 9, 45),
    );
    events = [];
    controller.events.listen(events.add);
    await controller.start();
    await settle();
  });

  tearDown(() {
    controller.dispose();
  });

  group('SurveyController chargement', () {
    test('charge la mission et demarre la source', () async {
      expect(controller.isLoading, isFalse);
      expect(controller.session?.title, 'Leve parcelle A');
      expect(source.started, isTrue);
      expect(controller.isSimulation, isTrue);
    });

    test('signale une mission absente', () async {
      final absent = SurveyController(
        store: FakeSurveySessionStore(),
        source: ManualGnssSource(),
        sessionId: 'inconnue',
      );
      await absent.start();

      expect(absent.session, isNull);
      expect(absent.error, contains('introuvable'));
      expect(absent.canRecord, isFalse);
      absent.dispose();
    });

    test('reprend les bornes deja enregistrees', () async {
      final existing = SurveyPoint.fromPosition(
        id: 'point-existant',
        clientId: 'client-point-existant',
        projectId: session.projectId,
        surveyorId: session.surveyorId,
        pointNumber: 1,
        pointName: 'B1',
        position: position(),
      );
      final replay = SurveyController(
        store: FakeSurveySessionStore(session: session, points: [existing]),
        source: ManualGnssSource(),
        sessionId: session.id,
      );
      await replay.start();

      expect(replay.points, hasLength(1));
      expect(replay.points.single.pointName, 'B1');
      replay.dispose();
    });
  });

  group('SurveyController Bluetooth', () {
    test('expose un Bluetooth desactive et sa raison', () async {
      final native = FakeStatusGnssSource(bluetoothDisabled: true);
      final nativeController = SurveyController(
        store: FakeSurveySessionStore(session: session),
        source: native,
        sessionId: session.id,
      );
      await nativeController.start();

      expect(nativeController.isSimulation, isFalse);
      expect(nativeController.bluetoothDisabled, isTrue);
      expect(nativeController.disabledReason, contains('Bluetooth'));

      nativeController.dispose();
    });

    test('relit l etat Bluetooth apres le retour au premier plan', () async {
      final native = FakeStatusGnssSource(bluetoothDisabled: true);
      final nativeController = SurveyController(
        store: FakeSurveySessionStore(session: session),
        source: native,
        sessionId: session.id,
      );
      await nativeController.start();
      expect(nativeController.bluetoothDisabled, isTrue);

      native.setBluetoothEnabled(true);
      await nativeController.refreshBluetoothState();

      expect(native.refreshCalls, 3);
      expect(native.started, isTrue);
      expect(nativeController.bluetoothDisabled, isFalse);
      expect(nativeController.disabledReason, contains('recepteur GNSS'));

      nativeController.dispose();
    });

    test('la simulation ne porte aucune alerte Bluetooth', () async {
      expect(controller.isSimulation, isTrue);
      expect(controller.bluetoothDisabled, isFalse);

      await controller.refreshBluetoothState();

      expect(controller.bluetoothDisabled, isFalse);
    });
  });

  group('SurveyController RG-01', () {
    test('refuse Float avec une raison ecrite', () async {
      source.emit(position(quality: GnssFixQuality.float));
      await settle();

      expect(controller.canRecord, isFalse);
      expect(controller.disabledReason, contains('RTK Float'));
    });

    test('refuse autonome et fix invalide', () async {
      source.emit(position(quality: GnssFixQuality.autonomous));
      await settle();
      expect(controller.canRecord, isFalse);
      expect(controller.disabledReason, contains('autonome'));

      source.emit(position(quality: GnssFixQuality.invalid));
      await settle();
      expect(controller.canRecord, isFalse);
      expect(controller.disabledReason, contains('invalide'));
    });

    test('accepte Fixed sans raison de refus', () async {
      source.emit(position());
      await settle();

      expect(controller.canRecord, isTrue);
      expect(controller.disabledReason, isNull);
    });

    test('attend une position avant d autoriser la mesure', () async {
      expect(controller.canRecord, isFalse);
      expect(controller.disabledReason, contains('recepteur GNSS'));
    });
  });

  group('SurveyController moyenne des 10 epoques', () {
    test('moyenne dix epoques et enregistre une borne Fixed', () async {
      source.emit(position());
      await settle();
      controller.startMeasurement();
      expect(controller.isAveraging, isTrue);
      expect(controller.canRecord, isFalse);

      for (var i = 0; i < 10; i++) {
        source.emit(position(latitude: 6.13192 + i / 100000));
        await settle();
      }

      expect(controller.isAveraging, isFalse);
      expect(controller.points, hasLength(1));
      final point = controller.points.single;
      expect(point.pointName, 'B1');
      expect(point.fixQuality, GnssFixQuality.fixed);
      expect(point.isValidated, isTrue);
      expect(point.latitude, closeTo(6.131965, 0.0000001));
      expect(point.satellitesCount, 18);
      expect(point.pdop, closeTo(1.4, 0.0001));
      expect(store.points, hasLength(1));
      expect(store.addCalls, 1);
      expect(events.whereType<PointRecorded>(), hasLength(1));
    });

    test('annule la moyenne si le Fixed est perdu', () async {
      source.emit(position());
      await settle();
      controller.startMeasurement();
      source.emit(position());
      await settle();

      source.emit(position(quality: GnssFixQuality.float));
      await settle();

      expect(controller.isAveraging, isFalse);
      expect(controller.epochsCollected, 0);
      expect(controller.points, isEmpty);
      expect(store.addCalls, 0);
      final cancelled = events.whereType<MeasurementCancelled>().single;
      expect(cancelled.reason, contains('Fixed perdu'));
    });

    test('annule la moyenne sur demande', () async {
      source.emit(position());
      await settle();
      controller.startMeasurement();
      source.emit(position());
      await settle();

      controller.cancelMeasurement();
      await settle();

      expect(controller.isAveraging, isFalse);
      expect(controller.points, isEmpty);
      expect(events.whereType<MeasurementCancelled>(), hasLength(1));
    });

    test('numerote les bornes dans l ordre', () async {
      source.emit(position());
      await settle();
      for (var pointIndex = 0; pointIndex < 2; pointIndex++) {
        controller.startMeasurement();
        for (var i = 0; i < 10; i++) {
          source.emit(position());
          await settle();
        }
      }

      expect(controller.points.map((point) => point.pointName), ['B1', 'B2']);
    });

    test('remonte l echec d ecriture locale', () async {
      store.failAdds = true;
      source.emit(position());
      await settle();
      controller.startMeasurement();
      for (var i = 0; i < 10; i++) {
        source.emit(position());
        await settle();
      }

      expect(controller.points, isEmpty);
      expect(controller.error, contains('enregistree'));
      expect(events.whereType<SurveyError>(), hasLength(1));

      source.emit(position());
      await settle();
      expect(controller.canRecord, isTrue);
      expect(controller.disabledReason, isNull);
    });
  });

  group('SurveyController annulation', () {
    test('supprime la derniere borne enregistree', () async {
      source.emit(position());
      await settle();
      controller.startMeasurement();
      for (var i = 0; i < 10; i++) {
        source.emit(position());
        await settle();
      }
      final point = controller.points.single;

      await controller.undoPoint(point.id);

      expect(controller.points, isEmpty);
      expect(store.points, isEmpty);
      expect(store.addCalls, 1);
    });

    test('ignore une borne inconnue', () async {
      await controller.undoPoint('absente');
      expect(controller.points, isEmpty);
    });
  });

  group('SurveyController reprise et suppression', () {
    late FakeSurveySessionStore localStore;
    late ManualGnssSource localSource;
    late SurveyController localController;
    late List<SurveyEvent> localEvents;

    SurveyPoint existingPoint() {
      return SurveyPoint.fromPosition(
        id: 'point-1',
        clientId: 'client-point-1',
        projectId: session.projectId,
        surveyorId: session.surveyorId,
        pointNumber: 1,
        pointName: 'B1',
        position: position(),
      );
    }

    setUp(() async {
      localStore = FakeSurveySessionStore(
        session: session,
        points: [existingPoint()],
      );
      localSource = ManualGnssSource();
      localController = SurveyController(
        store: localStore,
        source: localSource,
        sessionId: session.id,
        idGenerator: () => 'new-id',
        clock: () => DateTime.utc(2026, 10, 30, 10),
      );
      localEvents = [];
      localController.events.listen(localEvents.add);
      await localController.start();
      await settle();
    });

    tearDown(() {
      localController.dispose();
    });

    test('reprend la mesure d une borne existante', () async {
      localSource.emit(position());
      await settle();

      localController.startRemeasure('point-1');

      expect(localController.isAveraging, isTrue);
      expect(localController.isRemeasuring, isTrue);
      expect(localController.remeasuringPoint?.pointName, 'B1');

      for (var i = 0; i < 10; i++) {
        localSource.emit(position(latitude: 6.14, longitude: 1.25));
        await settle();
      }

      expect(localController.isAveraging, isFalse);
      expect(localController.isRemeasuring, isFalse);
      expect(localController.points, hasLength(1));
      final point = localController.points.single;
      expect(point.id, 'point-1');
      expect(point.pointName, 'B1');
      expect(point.pointNumber, 1);
      expect(point.latitude, closeTo(6.14, 0.0000001));
      expect(localStore.updateCalls, 1);
      expect(localStore.addCalls, 0);
      expect(localEvents.whereType<PointUpdated>(), hasLength(1));
    });

    test('refuse de reprendre une mesure sans RTK Fixed', () async {
      localController.startRemeasure('point-1');
      await settle();

      expect(localController.isAveraging, isFalse);
      expect(localController.error, contains('recepteur GNSS'));
      expect(localEvents.whereType<SurveyError>(), hasLength(1));
    });

    test('supprime une borne existante', () async {
      final deleted = await localController.deletePoint('point-1');
      await settle();

      expect(deleted, isTrue);
      expect(localController.points, isEmpty);
      expect(localStore.removeCalls, 1);
      expect(localEvents.whereType<PointDeleted>(), hasLength(1));
    });

    test('reouvre une mission terminee apres suppression', () async {
      final completedSession = session.copyWith(
        status: SurveySessionStatus.completed,
        perimeterMeters: 12.5,
        areaSquareMeters: 8.0,
        completedAt: DateTime.utc(2026, 10, 30, 10),
      );
      final queue = FakeSyncQueueStore();
      final completedStore = FakeSurveySessionStore(
        session: completedSession,
        points: [existingPoint()],
      );
      await queue.enqueue(completedSession);
      final completed = SurveyController(
        store: completedStore,
        source: ManualGnssSource(),
        sessionId: session.id,
        queue: queue,
      );
      addTearDown(completed.dispose);
      await completed.start();
      expect(completed.session!.status, SurveySessionStatus.completed);
      expect(completed.pendingSyncCount, 1);

      expect(await completed.deletePoint('point-1'), isTrue);

      expect(completed.session!.status, SurveySessionStatus.inProgress);
      expect(completed.session!.perimeterMeters, isNull);
      expect(completed.session!.areaSquareMeters, isNull);
      expect(completed.session!.completedAt, isNull);
      expect(completed.pendingSyncCount, 0);
      expect(queue.entries, isEmpty);
    });

    test('reouvre une mission terminee apres remesure', () async {
      final completedSession = session.copyWith(
        status: SurveySessionStatus.completed,
        perimeterMeters: 12.5,
        areaSquareMeters: 8.0,
        completedAt: DateTime.utc(2026, 10, 30, 10),
      );
      final localSource = ManualGnssSource();
      final localStore = FakeSurveySessionStore(
        session: completedSession,
        points: [existingPoint()],
      );
      final completed = SurveyController(
        store: localStore,
        source: localSource,
        sessionId: session.id,
        clock: () => DateTime.utc(2026, 10, 30, 11),
      );
      addTearDown(completed.dispose);
      await completed.start();
      localSource.emit(position());
      await settle();

      completed.startRemeasure('point-1');
      for (var i = 0; i < 10; i++) {
        localSource.emit(position(latitude: 6.14));
        await settle();
      }

      expect(completed.session!.status, SurveySessionStatus.inProgress);
      expect(completed.session!.perimeterMeters, isNull);
      expect(completed.session!.areaSquareMeters, isNull);
      expect(completed.session!.completedAt, isNull);
      expect(localStore.updateCalls, 1);
    });

    test('refuse de modifier une mission synchronisee', () async {
      final synced = SurveyController(
        store: FakeSurveySessionStore(
          session: session.copyWith(status: SurveySessionStatus.synced),
          points: [existingPoint()],
        ),
        source: ManualGnssSource(),
        sessionId: session.id,
      );
      addTearDown(synced.dispose);
      await synced.start();

      expect(await synced.deletePoint('point-1'), isFalse);
      expect(synced.points, hasLength(1));
      expect(synced.error, contains('synchronisee'));
    });
  });

  group('SurveyController synchronisation manuelle', () {
    late FakeSyncQueueStore queue;
    late FakeSyncTransport transport;

    SurveyPoint point(int number) {
      return SurveyPoint.fromPosition(
        id: 'point-$number',
        clientId: 'client-point-$number',
        projectId: session.projectId,
        surveyorId: session.surveyorId,
        pointNumber: number,
        pointName: 'B$number',
        position: position(
          latitude: 6.13192 + number / 100000,
          longitude: 1.22281 + number / 100000,
        ),
      );
    }

    SurveySession completedSession() {
      return session.copyWith(
        status: SurveySessionStatus.completed,
        points: [point(1), point(2), point(3)],
        perimeterMeters: 12.5,
        areaSquareMeters: 8.0,
        completedAt: DateTime.utc(2026, 10, 30, 10),
      );
    }

    setUp(() {
      queue = FakeSyncQueueStore();
      transport = FakeSyncTransport();
    });

    test('envoie une mission terminee absente de la file', () async {
      final completed = completedSession();
      final manual = SurveyController(
        store: FakeSurveySessionStore(
          session: completed,
          points: completed.points,
        ),
        source: ManualGnssSource(),
        sessionId: session.id,
        queue: queue,
        syncTransport: transport,
      );
      addTearDown(manual.dispose);
      await manual.start();
      expect(manual.pendingSyncCount, 0);

      await manual.syncCurrentMission();
      await settle();

      expect(transport.sent, hasLength(1));
      expect(manual.session!.status, SurveySessionStatus.synced);
      expect(manual.pendingSyncCount, 0);
    });

    test('remet une mission refusee puis l envoie', () async {
      final completed = completedSession();
      queue.entries[session.id] = SyncQueueEntry(
        sessionId: session.id,
        clientId: session.clientId,
        status: SyncQueueStatus.rejected,
        attempts: 1,
        enqueuedAt: DateTime.utc(2026, 10, 30, 9, 30),
        lastError: 'refus serveur',
      );
      final manual = SurveyController(
        store: FakeSurveySessionStore(
          session: completed,
          points: completed.points,
        ),
        source: ManualGnssSource(),
        sessionId: session.id,
        queue: queue,
        syncTransport: transport,
      );
      addTearDown(manual.dispose);
      await manual.start();
      expect(manual.rejectedSyncCount, 1);

      await manual.syncCurrentMission();
      await settle();

      expect(transport.sent, hasLength(1));
      expect(manual.session!.status, SurveySessionStatus.synced);
      expect(manual.rejectedSyncCount, 0);
    });
  });

  group('SurveyController fin de mission', () {
    late FakeSyncQueueStore queue;
    late FakeSyncTransport transport;
    late SurveyController mission;
    late ManualGnssSource missionSource;
    late List<SurveyEvent> missionEvents;
    var nextId = 0;

    Future<void> recordPoint(int number) async {
      final latitude = 6.13192 + number / 100000;
      final longitude = 1.22281 + number / 100000;
      missionSource.emit(position(latitude: latitude, longitude: longitude));
      await settle();
      mission.startMeasurement();
      for (var i = 0; i < 10; i++) {
        missionSource.emit(position(latitude: latitude, longitude: longitude));
        await settle();
      }
    }

    setUp(() async {
      queue = FakeSyncQueueStore();
      transport = FakeSyncTransport();
      nextId = 0;
      missionSource = ManualGnssSource();
      mission = SurveyController(
        store: FakeSurveySessionStore(session: session),
        source: missionSource,
        sessionId: session.id,
        queue: queue,
        syncTransport: transport,
        idGenerator: () => 'mission-id-${nextId++}',
        clock: () => DateTime.utc(2026, 10, 30, 9, 45),
      );
      missionEvents = [];
      mission.events.listen(missionEvents.add);
      await mission.start();
      await settle();
    });

    tearDown(() {
      mission.dispose();
    });

    test('refuse de terminer avec moins de trois bornes', () async {
      await recordPoint(1);
      await recordPoint(2);

      expect(mission.canFinishMission, isFalse);
      expect(await mission.finishMission(), isFalse);
      expect(mission.error, contains('trois bornes'));
      expect(mission.session!.status, SurveySessionStatus.inProgress);
      expect(queue.entries, isEmpty);
    });

    test('termine la mission et calcule les mesures', () async {
      for (var number = 1; number <= 3; number++) {
        await recordPoint(number);
      }

      expect(mission.canFinishMission, isTrue);
      expect(await mission.finishMission(), isTrue);
      await settle();

      expect(mission.session!.isCompleted, isTrue);
      expect(mission.session!.perimeterMeters, greaterThan(0));
      expect(mission.session!.areaSquareMeters, greaterThan(0));
      expect(mission.measurements, isNotNull);
      expect(queue.entries, hasLength(1));
      expect(missionEvents.whereType<MissionCompleted>(), hasLength(1));
    });

    test('envoie la mission apres sa cloture', () async {
      for (var number = 1; number <= 3; number++) {
        await recordPoint(number);
      }

      await mission.finishMission();
      await settle();

      expect(transport.sent, hasLength(1));
      expect(transport.sent.single['entityType'], 'survey_session');
      expect(mission.session!.status, SurveySessionStatus.synced);
      expect(mission.pendingSyncCount, 0);
      expect(mission.syncError, isNull);
      expect(missionEvents.whereType<SyncFinished>(), hasLength(1));
    });

    test('garde la mission en attente si le serveur echoue', () async {
      transport.failure = StateError('reseau indisponible');
      for (var number = 1; number <= 3; number++) {
        await recordPoint(number);
      }

      await mission.finishMission();

      expect(transport.sent, isEmpty);
      expect(mission.session!.status, SurveySessionStatus.completed);
      expect(mission.pendingSyncCount, 1);
      expect(mission.syncError, isNotNull);
    });

    test('signale l absence de serveur configure', () async {
      final offline = SurveyController(
        store: FakeSurveySessionStore(session: session),
        source: ManualGnssSource(),
        sessionId: session.id,
        queue: FakeSyncQueueStore(),
      );
      addTearDown(offline.dispose);
      final offlineEvents = <SurveyEvent>[];
      offline.events.listen(offlineEvents.add);
      await offline.start();

      await offline.syncNow();

      expect(offline.canSyncNow, isFalse);
      expect(offline.syncError, contains('non configuree'));
      expect(offlineEvents.whereType<SyncUnavailable>(), hasLength(1));
    });

    test('relit les missions refusees au demarrage', () async {
      queue.entries[session.id] = SyncQueueEntry(
        sessionId: session.id,
        clientId: session.clientId,
        status: SyncQueueStatus.rejected,
        attempts: 1,
        enqueuedAt: DateTime.utc(2026, 10, 30, 9, 30),
        lastError: 'La mission contient moins de trois bornes.',
      );
      final reloaded = SurveyController(
        store: FakeSurveySessionStore(session: session),
        source: ManualGnssSource(),
        sessionId: session.id,
        queue: queue,
      );
      addTearDown(reloaded.dispose);

      await reloaded.start();

      expect(reloaded.rejectedSyncCount, 1);
      expect(
        reloaded.rejectedSyncEntries.single.lastError,
        contains('trois bornes'),
      );
    });

    test('remet une mission refusee en file', () async {
      queue.entries[session.id] = SyncQueueEntry(
        sessionId: session.id,
        clientId: session.clientId,
        status: SyncQueueStatus.rejected,
        attempts: 1,
        enqueuedAt: DateTime.utc(2026, 10, 30, 9, 30),
        lastError: 'La mission contient moins de trois bornes.',
      );
      final retried = SurveyController(
        store: FakeSurveySessionStore(session: session),
        source: ManualGnssSource(),
        sessionId: session.id,
        queue: queue,
      );
      addTearDown(retried.dispose);
      await retried.start();
      expect(retried.rejectedSyncCount, 1);

      await retried.retryRejected(session.id);
      await settle();

      expect(retried.rejectedSyncCount, 0);
      expect(retried.pendingSyncCount, 1);
      expect(queue.entries[session.id]!.status, SyncQueueStatus.pending);
      expect(queue.entries[session.id]!.lastError, isNull);
    });

    test('bascule de source et remet la position a zero', () async {
      missionSource.emit(position());
      await settle();
      expect(mission.position, isNotNull);

      final next = ManualGnssSource();
      addTearDown(next.stop);
      await mission.switchSource(next);

      expect(mission.source, same(next));
      expect(mission.position, isNull);
      expect(next.started, isTrue);

      next.emit(position(latitude: 6.14));
      await settle();
      expect(mission.position?.latitude, 6.14);
    });
  });
}
