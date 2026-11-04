import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';

void main() {
  final createdAt = DateTime.utc(2026, 10, 28, 8, 15);
  final completedAt = DateTime.utc(2026, 10, 28, 9, 42);

  SurveyPoint point(
    int number, {
    GnssFixQuality quality = GnssFixQuality.fixed,
  }) {
    return SurveyPoint(
      id: 'point-$number',
      clientId: 'point-client-$number',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      pointNumber: number,
      pointName: 'B$number',
      latitude: 6.137254 + number / 10000,
      longitude: 1.212547 + number / 10000,
      altitude: 24.35,
      accuracy: 0.012,
      fixQuality: quality,
      satellitesCount: 18,
      pdop: 1.2,
      hdop: 0.8,
      vdop: 0.9,
      instrument: 'UM982',
      recordedAt: createdAt,
    );
  }

  SurveySession session({
    SurveySessionStatus status = SurveySessionStatus.completed,
    List<SurveyPoint>? points,
    double? perimeterMeters = 128.4,
    double? areaSquareMeters = 1024.0,
    DateTime? endedAt,
  }) {
    return SurveySession(
      id: 'session-local-1',
      clientId: 'session-client-1',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      title: 'Leve parcelle Adakpame',
      status: status,
      points: points ?? [point(1), point(2), point(3)],
      perimeterMeters: perimeterMeters,
      areaSquareMeters: areaSquareMeters,
      createdAt: createdAt,
      completedAt: endedAt,
    );
  }

  group('SurveySessionStatus', () {
    test('serialise et relit les quatre statuts', () {
      for (final status in SurveySessionStatus.values) {
        expect(SurveySessionStatus.fromString(status.serialized), status);
        expect(status.toSerializedString(), status.serialized);
      }
    });

    test('un statut absent ou inconnu devient draft', () {
      expect(SurveySessionStatus.fromString(null), SurveySessionStatus.draft);
      expect(SurveySessionStatus.fromString(''), SurveySessionStatus.draft);
      expect(
        SurveySessionStatus.fromString('statut-inconnu'),
        SurveySessionStatus.draft,
      );
    });

    test('seul completed autorise la synchronisation', () {
      expect(SurveySessionStatus.completed.canSync, isTrue);
      expect(SurveySessionStatus.draft.canSync, isFalse);
      expect(SurveySessionStatus.inProgress.canSync, isFalse);
      expect(SurveySessionStatus.synced.canSync, isFalse);
    });

    test('seuls draft et inProgress autorisent la suppression locale', () {
      expect(SurveySessionStatus.draft.canDelete, isTrue);
      expect(SurveySessionStatus.inProgress.canDelete, isTrue);
      expect(SurveySessionStatus.completed.canDelete, isFalse);
      expect(SurveySessionStatus.synced.canDelete, isFalse);
    });
  });

  group('SurveySession - pret pour la synchronisation', () {
    test('une mission terminee avec trois bornes Fixed peut etre envoyee', () {
      expect(session().canSync, isTrue);
    });

    test('une mission non terminee ne peut pas etre envoyee', () {
      expect(session(status: SurveySessionStatus.inProgress).canSync, isFalse);
    });

    test('moins de trois bornes bloque la synchronisation', () {
      expect(session(points: [point(1), point(2)]).canSync, isFalse);
    });

    test('une borne non Fixed bloque la mission entiere', () {
      expect(
        session(
          points: [
            point(1),
            point(2, quality: GnssFixQuality.float),
            point(3),
          ],
        ).canSync,
        isFalse,
      );
    });

    test('un perimetre ou une surface absente bloque la synchronisation', () {
      expect(session(perimeterMeters: null).canSync, isFalse);
      expect(session(areaSquareMeters: null).canSync, isFalse);
    });

    test('une mission deja synchronisee ne peut pas etre renvoyee', () {
      expect(session(status: SurveySessionStatus.synced).canSync, isFalse);
    });
  });

  group('SurveySession - charge utile POST /sync', () {
    test('imbrique les bornes triees dans une seule mission', () {
      final payload = session(
        points: [point(3), point(1), point(2)],
      ).toSyncPayload();

      expect(payload['clientId'], 'session-client-1');
      expect(payload['entityType'], 'survey_session');
      expect(payload['action'], 'CREATE');

      final body = payload['payload'] as Map<String, dynamic>;
      expect(body['projectId'], 'project-1');
      expect(body['surveyorId'], 'surveyor-1');
      expect(body['title'], 'Leve parcelle Adakpame');
      expect(body['status'], 'COMPLETED');
      expect(body['perimeterMeters'], 128.4);
      expect(body['areaSquareMeters'], 1024.0);

      final points = body['points'] as List<dynamic>;
      expect(points, hasLength(3));
      expect((points.first as Map<String, dynamic>)['pointNumber'], 1);
      expect((points.last as Map<String, dynamic>)['pointNumber'], 3);
      expect(
        (points.first as Map<String, dynamic>).containsKey('entityType'),
        isFalse,
      );
    });

    test('refuse une mission non prete', () {
      expect(
        () => session(status: SurveySessionStatus.draft).toSyncPayload(),
        throwsStateError,
      );
    });
  });

  group('SurveySession - stockage local', () {
    test('toMap et fromMap preservent les champs de la mission', () {
      final original = session(endedAt: completedAt);

      final map = original.toMap();
      expect(map['status'], 'COMPLETED');
      expect(map['client_id'], 'session-client-1');

      final restored = SurveySession.fromMap(map, points: original.points);
      expect(restored.id, original.id);
      expect(restored.clientId, original.clientId);
      expect(restored.projectId, original.projectId);
      expect(restored.surveyorId, original.surveyorId);
      expect(restored.title, original.title);
      expect(restored.status, SurveySessionStatus.completed);
      expect(restored.points, hasLength(3));
      expect(restored.perimeterMeters, 128.4);
      expect(restored.areaSquareMeters, 1024.0);
      expect(restored.createdAt, createdAt);
      expect(restored.completedAt, completedAt);
      expect(restored.deletedAt, isNull);
      expect(restored.inTrash, isFalse);
    });

    test('toMap et fromMap preservent la date de corbeille', () {
      final inTrash = session().copyWith(deletedAt: completedAt);
      final map = inTrash.toMap();
      expect(map['deleted_at'], completedAt.toIso8601String());

      final restored = SurveySession.fromMap(map);
      expect(restored.deletedAt, completedAt);
      expect(restored.inTrash, isTrue);
      expect(restored.canRestore, isTrue);
      expect(restored.canDelete, isFalse);
      expect(restored.canSync, isFalse);
    });

    test('complete termine la mission avec les mesures calculees', () {
      final updated =
          session(
            status: SurveySessionStatus.inProgress,
            perimeterMeters: null,
            areaSquareMeters: null,
          ).complete(
            perimeterMeters: 128.4,
            areaSquareMeters: 1024.0,
            completedAt: completedAt,
          );

      expect(updated.status, SurveySessionStatus.completed);
      expect(updated.perimeterMeters, 128.4);
      expect(updated.areaSquareMeters, 1024.0);
      expect(updated.completedAt, completedAt);
      expect(updated.canSync, isTrue);
    });
  });

  group('SurveySession - fin de mission', () {
    test('completeWithMeasurements calcule perimetre et surface', () {
      final updated = session(
        status: SurveySessionStatus.inProgress,
        perimeterMeters: null,
        areaSquareMeters: null,
      ).completeWithMeasurements(completedAt: completedAt);

      expect(updated.status, SurveySessionStatus.completed);
      expect(updated.perimeterMeters, isNotNull);
      expect(updated.perimeterMeters, greaterThan(0));
      expect(updated.areaSquareMeters, isNotNull);
      expect(updated.areaSquareMeters, greaterThan(0));
      expect(updated.completedAt, completedAt);
      expect(updated.canSync, isTrue);
    });

    test('refuse moins de trois bornes', () {
      expect(
        () => session(
          status: SurveySessionStatus.inProgress,
          points: [point(1), point(2)],
          perimeterMeters: null,
          areaSquareMeters: null,
        ).completeWithMeasurements(),
        throwsStateError,
      );
    });

    test('refuse une borne non Fixed', () {
      expect(
        () => session(
          status: SurveySessionStatus.inProgress,
          points: [
            point(1),
            point(2, quality: GnssFixQuality.float),
            point(3),
          ],
          perimeterMeters: null,
          areaSquareMeters: null,
        ).completeWithMeasurements(),
        throwsStateError,
      );
    });

    test('refuse une mission deja terminee', () {
      expect(() => session().completeWithMeasurements(), throwsStateError);
    });

    test('canComplete et isCompleted decrivent l etat de la mission', () {
      final inProgress = session(
        status: SurveySessionStatus.inProgress,
        perimeterMeters: null,
        areaSquareMeters: null,
      );

      expect(inProgress.canComplete, isTrue);
      expect(inProgress.isCompleted, isFalse);
      expect(session().canComplete, isFalse);
      expect(session().isCompleted, isTrue);
      expect(session(status: SurveySessionStatus.synced).isCompleted, isTrue);
    });

    test('canDelete autorise la suppression pour draft et inProgress', () {
      expect(session(status: SurveySessionStatus.draft).canDelete, isTrue);
      expect(session(status: SurveySessionStatus.inProgress).canDelete, isTrue);
      expect(session(status: SurveySessionStatus.completed).canDelete, isFalse);
      expect(session(status: SurveySessionStatus.synced).canDelete, isFalse);
    });

    test('reopen remet une mission terminee en cours sans mesures', () {
      final reopened = session().reopen();

      expect(reopened.status, SurveySessionStatus.inProgress);
      expect(reopened.perimeterMeters, isNull);
      expect(reopened.areaSquareMeters, isNull);
      expect(reopened.completedAt, isNull);
      expect(reopened.points, hasLength(3));
      expect(reopened.canSync, isFalse);
    });
  });
}
