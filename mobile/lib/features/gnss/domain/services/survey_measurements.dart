import 'dart:math' as math;

import '../entities/survey_point.dart';
import 'utm31n.dart';

/// Mesures geodesiques d'un leve, calculees en projection UTM 31N.
///
/// Les coordonnees sont stockees en WGS84 (EPSG:4326). Distance, perimetre et
/// surface sont calcules localement avant la synchronisation de la mission
/// (EF-107).
class SurveyMeasurements {
  const SurveyMeasurements({
    required this.edgeMeters,
    required this.perimeterMeters,
    required this.areaSquareMeters,
  });

  /// Distances entre bornes consecutives, sans l'arete de fermeture.
  final List<double> edgeMeters;

  /// Perimetre du polygone, arete de fermeture incluse.
  final double perimeterMeters;

  /// Surface du polygone en metres carres.
  final double areaSquareMeters;

  /// Calcule les mesures d'une mission d'au moins trois bornes.
  factory SurveyMeasurements.fromPoints(List<SurveyPoint> points) {
    if (points.length < 3) {
      throw ArgumentError.value(
        points.length,
        'points',
        'Un polygone exige au moins trois bornes.',
      );
    }

    final edges = <double>[
      for (var index = 0; index < points.length - 1; index++)
        distanceBetweenSurveyPoints(points[index], points[index + 1]),
    ];
    final closing = distanceBetweenSurveyPoints(points.last, points.first);
    final perimeter = edges.fold(0.0, (sum, edge) => sum + edge) + closing;

    return SurveyMeasurements(
      edgeMeters: List.unmodifiable(edges),
      perimeterMeters: perimeter,
      areaSquareMeters: _area(points),
    );
  }

  /// Distance entre deux bornes, en metres, dans le plan UTM 31N.
  static double distanceBetweenSurveyPoints(SurveyPoint a, SurveyPoint b) {
    final start = toUtm31N(a.latitude, a.longitude);
    final end = toUtm31N(b.latitude, b.longitude);
    final dx = end.easting - start.easting;
    final dy = end.northing - start.northing;
    return math.sqrt(dx * dx + dy * dy);
  }

  static double _area(List<SurveyPoint> points) {
    var sum = 0.0;
    for (var index = 0; index < points.length; index++) {
      final current = toUtm31N(points[index].latitude, points[index].longitude);
      final next = toUtm31N(
        points[(index + 1) % points.length].latitude,
        points[(index + 1) % points.length].longitude,
      );
      sum += current.easting * next.northing;
      sum -= next.easting * current.northing;
    }
    return sum.abs() / 2;
  }
}
