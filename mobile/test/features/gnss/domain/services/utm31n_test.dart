import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/services/utm31n.dart';

void main() {
  group('toUtm31N', () {
    test('place le meridien central a 500 000 m', () {
      final point = toUtm31N(0, utm31CentralMeridian);
      expect(point.easting, closeTo(500000, 0.001));
      expect(point.northing, closeTo(0, 0.001));
    });

    test('projette un point de Lome en zone 31N', () {
      final point = toUtm31N(6.13192, 1.22281);
      expect(point.easting, closeTo(303336.16, 0.05));
      expect(point.northing, closeTo(678113.20, 0.05));
    });

    test('reste symetrique de part et d autre du meridien', () {
      final ouest = toUtm31N(6.13192, 1.22281);
      final est = toUtm31N(6.13192, 4.77719);
      expect(ouest.easting - 500000, closeTo(500000 - est.easting, 0.5));
    });

    test('refuse une latitude hors limites', () {
      expect(() => toUtm31N(91, 1), throwsArgumentError);
    });
  });
}
