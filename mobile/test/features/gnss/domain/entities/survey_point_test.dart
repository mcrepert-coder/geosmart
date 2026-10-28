import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';

void main() {
  group('SurveyPoint - Regle RG-01', () {
    final now = DateTime.utc(2026, 10, 25, 14, 30);

    test(
      'RG-01 : Une borne en RTK Fixed est validee (isValidated == true)',
      () {
        final point = SurveyPoint(
          id: 'point-1',
          clientId: 'client-uuid-1',
          projectId: 'project-10',
          surveyorId: 'surveyor-romuald',
          pointNumber: 1,
          pointName: 'B1',
          latitude: 6.137254,
          longitude: 1.212547,
          altitude: 24.35,
          accuracy: 0.012,
          fixQuality: GnssFixQuality.fixed,
          satellitesCount: 18,
          pdop: 1.2,
          hdop: 0.8,
          vdop: 0.9,
          instrument: 'UM982',
          recordedAt: now,
        );

        expect(point.isValidated, isTrue);
      },
    );

    test(
      'RG-01 : Une borne en RTK Float est refusee (isValidated == false)',
      () {
        final point = SurveyPoint(
          id: 'point-2',
          clientId: 'client-uuid-2',
          projectId: 'project-10',
          surveyorId: 'surveyor-romuald',
          pointNumber: 2,
          pointName: 'B2',
          latitude: 6.137254,
          longitude: 1.212547,
          altitude: 24.35,
          accuracy: 0.184,
          fixQuality: GnssFixQuality.float,
          satellitesCount: 11,
          pdop: 3.6,
          instrument: 'UM982',
          recordedAt: now,
        );

        expect(point.isValidated, isFalse);
      },
    );

    test(
      'RG-01 : Une borne en mode Autonome est refusee (isValidated == false)',
      () {
        final point = SurveyPoint(
          id: 'point-3',
          clientId: 'client-uuid-3',
          projectId: 'project-10',
          surveyorId: 'surveyor-romuald',
          pointNumber: 3,
          pointName: 'B3',
          latitude: 6.137254,
          longitude: 1.212547,
          fixQuality: GnssFixQuality.autonomous,
          satellitesCount: 8,
          pdop: 4.5,
          instrument: 'UM982',
          recordedAt: now,
        );

        expect(point.isValidated, isFalse);
      },
    );

    test(
      'RG-01 : Une borne en mode Invalide est refusee (isValidated == false)',
      () {
        final point = SurveyPoint(
          id: 'point-4',
          clientId: 'client-uuid-4',
          projectId: 'project-10',
          surveyorId: 'surveyor-romuald',
          pointNumber: 4,
          pointName: 'B4',
          latitude: 0.0,
          longitude: 0.0,
          fixQuality: GnssFixQuality.invalid,
          satellitesCount: 0,
          pdop: 99.0,
          recordedAt: now,
        );

        expect(point.isValidated, isFalse);
      },
    );
  });

  group('SurveyPoint - Traçabilite RG-04 et Conversion fromPosition', () {
    final now = DateTime.utc(2026, 10, 25, 14, 30);

    test('Conversion depuis GnssPosition conserve les metadonnees RG-04', () {
      final position = GnssPosition(
        latitude: 6.137254,
        longitude: 1.212547,
        altitude: 25.10,
        accuracy: 0.015,
        fixQuality: GnssFixQuality.fixed,
        satellitesCount: 20,
        pdop: 1.3,
        hdop: 0.7,
        vdop: 1.0,
        instrument: 'UM982_TEST',
        recordedAt: now,
      );

      final point = SurveyPoint.fromPosition(
        id: 'p-100',
        clientId: 'c-uuid-100',
        projectId: 'proj-1',
        surveyorId: 'surv-1',
        pointNumber: 5,
        pointName: 'B5',
        position: position,
      );

      expect(point.pointNumber, 5);
      expect(point.pointName, 'B5');
      expect(point.latitude, 6.137254);
      expect(point.longitude, 1.212547);
      expect(point.altitude, 25.10);
      expect(point.accuracy, 0.015);
      expect(point.fixQuality, GnssFixQuality.fixed);
      expect(point.satellitesCount, 20);
      expect(point.pdop, 1.3);
      expect(point.instrument, 'UM982_TEST');
      expect(point.isValidated, isTrue);
    });
  });

  group('SurveyPoint - Payload Sync (RG-08 / contracts/survey.md)', () {
    final now = DateTime.utc(2026, 10, 25, 14, 32);

    test('toSyncPayload genere la structure attendue par POST /sync', () {
      final point = SurveyPoint(
        id: 'local-1',
        clientId: 'uuid-sync-1',
        projectId: 'proj-1',
        surveyorId: 'surv-1',
        pointNumber: 1,
        pointName: 'B1',
        latitude: 6.137254,
        longitude: 1.212547,
        altitude: 24.35,
        accuracy: 0.012,
        fixQuality: GnssFixQuality.fixed,
        satellitesCount: 18,
        pdop: 1.2,
        hdop: 0.8,
        vdop: 0.9,
        instrument: 'UM982',
        recordedAt: now,
      );

      final syncPayload = point.toSyncPayload();

      expect(syncPayload['clientId'], 'uuid-sync-1');
      expect(syncPayload['entityType'], 'survey_point');
      expect(syncPayload['action'], 'CREATE');

      final payload = syncPayload['payload'] as Map<String, dynamic>;
      expect(payload['projectId'], 'proj-1');
      expect(payload['pointNumber'], 1);
      expect(payload['pointName'], 'B1');
      expect(payload['latitude'], 6.137254);
      expect(payload['longitude'], 1.212547);
      expect(payload['altitude'], 24.35);
      expect(payload['fixQuality'], 'FIXED');
      expect(payload['satellitesCount'], 18);
      expect(payload['pdop'], 1.2);
      expect(payload['isValidated'], true);
    });

    test('toMap et fromMap pour SQLite sont symetriques', () {
      final original = SurveyPoint(
        id: 'local-1',
        clientId: 'uuid-sync-1',
        projectId: 'proj-1',
        surveyorId: 'surv-1',
        pointNumber: 1,
        pointName: 'B1',
        latitude: 6.137254,
        longitude: 1.212547,
        altitude: 24.35,
        accuracy: 0.012,
        fixQuality: GnssFixQuality.fixed,
        satellitesCount: 18,
        pdop: 1.2,
        hdop: 0.8,
        vdop: 0.9,
        instrument: 'UM982',
        recordedAt: now,
      );

      final map = original.toMap();
      final restored = SurveyPoint.fromMap(map);

      expect(restored.id, original.id);
      expect(restored.clientId, original.clientId);
      expect(restored.latitude, original.latitude);
      expect(restored.longitude, original.longitude);
      expect(restored.fixQuality, original.fixQuality);
      expect(restored.isValidated, isTrue);
    });
  });
}

