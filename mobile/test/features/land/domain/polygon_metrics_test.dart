import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/domain/geometry/polygon_metrics.dart';
import 'package:geosmart_mobile/features/land/domain/geometry/utm.dart';

typedef LatLon = ({double latitude, double longitude});

List<LatLon> square(double lon, double lat, [double size = 0.001]) => [
  (latitude: lat, longitude: lon),
  (latitude: lat, longitude: lon + size),
  (latitude: lat + size, longitude: lon + size),
  (latitude: lat + size, longitude: lon),
];

void main() {
  group('toUtm31N', () {
    test('le meridien central donne un easting de 500 000 m', () {
      final p = toUtm31N(0, 3);
      expect(p.easting, closeTo(500000, 0.001));
      expect(p.northing, closeTo(0, 0.001));
    });

    test('retrouve une valeur de reference pres de Lome', () {
      // Reference PostGIS : ST_Transform(POINT(1.21 6.13), 32631).
      final p = toUtm31N(6.13, 1.21);
      expect(p.easting, closeTo(301917.445, 0.005));
      expect(p.northing, closeTo(677905.577, 0.005));
    });
  });

  group('PolygonMetrics', () {
    test('calcule surface et perimetre comme le serveur', () {
      final m = PolygonMetrics.fromWgs84(square(1.21, 6.13));
      // Memes bornes que dans les tests PostGIS du backend.
      // Reference PostGIS : ST_Area(ST_Transform(..., 32631)) = 12 242,639 m2.
      expect(m.areaM2, closeTo(12242.639, 0.01));
      expect(m.perimeterM, greaterThan(440));
      expect(m.perimeterM, lessThan(445));
      expect(m.sideLengthsM, hasLength(4));
      expect(m.isValid, isTrue);
    });

    test('ne depend pas du sens de parcours', () {
      final a = PolygonMetrics.fromWgs84(square(1.21, 6.13));
      final b = PolygonMetrics.fromWgs84(square(1.21, 6.13).reversed.toList());
      expect(b.areaM2, closeTo(a.areaM2, 1e-6));
    });

    test('detecte un noeud papillon et nomme les cotes croises', () {
      final s = square(1.21, 6.13);
      final bowtie = [s[0], s[2], s[1], s[3]];
      final m = PolygonMetrics.fromWgs84(bowtie);
      expect(m.selfIntersects, isTrue);
      expect(m.crossings, [const EdgeCrossing(0, 2)]);
      expect(m.isValid, isFalse);
    });

    test('ne compte pas les cotes voisins comme croises', () {
      final pentagon = [
        ...square(1.21, 6.13),
        (latitude: 6.1305, longitude: 1.2095),
      ];
      expect(PolygonMetrics.fromWgs84(pentagon).selfIntersects, isFalse);
    });

    test('refuse moins de 3 bornes et 3 bornes alignees', () {
      final two = PolygonMetrics.fromWgs84(square(1.21, 6.13).take(2).toList());
      expect(two.isClosed, isFalse);
      expect(two.areaM2, 0);
      final aligned = PolygonMetrics.fromWgs84([
        (latitude: 6.13, longitude: 1.21),
        (latitude: 6.13, longitude: 1.211),
        (latitude: 6.13, longitude: 1.212),
      ]);
      expect(aligned.isValid, isFalse);
    });
  });
}
