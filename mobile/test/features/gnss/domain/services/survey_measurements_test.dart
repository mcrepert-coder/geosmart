import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/services/survey_measurements.dart';

void main() {
  SurveyPoint point(int number, double latitude, double longitude) {
    return SurveyPoint(
      id: 'point-$number',
      clientId: 'client-$number',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      pointNumber: number,
      pointName: 'B$number',
      latitude: latitude,
      longitude: longitude,
      fixQuality: GnssFixQuality.fixed,
      satellitesCount: 18,
      pdop: 1.2,
      instrument: 'UM982',
      recordedAt: DateTime.utc(2026, 10, 30, 9),
    );
  }

  final southWest = point(1, 6.13192, 1.22281);
  final southEast = point(2, 6.13192, 1.22291);
  final northEast = point(3, 6.13202, 1.22291);
  final northWest = point(4, 6.13202, 1.22281);

  group('SurveyMeasurements', () {
    test('calcule la distance entre deux bornes en UTM 31N', () {
      final distance = SurveyMeasurements.distanceBetweenSurveyPoints(
        southWest,
        southEast,
      );

      expect(distance, closeTo(11.07, 0.2));
    });

    test('calcule le perimetre d un carre', () {
      final measurements = SurveyMeasurements.fromPoints([
        southWest,
        southEast,
        northEast,
        northWest,
      ]);

      expect(measurements.edgeMeters, hasLength(3));
      expect(measurements.perimeterMeters, closeTo(44.4, 0.6));
    });

    test('calcule la surface d un carre', () {
      final measurements = SurveyMeasurements.fromPoints([
        southWest,
        southEast,
        northEast,
        northWest,
      ]);

      expect(measurements.areaSquareMeters, closeTo(123, 3));
    });

    test('donne le meme resultat dans les deux sens de parcours', () {
      final direct = SurveyMeasurements.fromPoints([
        southWest,
        southEast,
        northEast,
        northWest,
      ]);
      final reverse = SurveyMeasurements.fromPoints([
        northWest,
        northEast,
        southEast,
        southWest,
      ]);

      expect(reverse.areaSquareMeters, closeTo(direct.areaSquareMeters, 0.001));
      expect(reverse.perimeterMeters, closeTo(direct.perimeterMeters, 0.001));
    });

    test('refuse un polygone de moins de trois bornes', () {
      expect(
        () => SurveyMeasurements.fromPoints([southWest, southEast]),
        throwsArgumentError,
      );
    });
  });
}
