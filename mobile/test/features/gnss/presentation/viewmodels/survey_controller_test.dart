import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';

import '../../../../support/fake_survey_store.dart';

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
}
