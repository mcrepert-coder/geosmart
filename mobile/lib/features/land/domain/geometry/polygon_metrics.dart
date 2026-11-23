import 'dart:math' as math;

import 'utm.dart';

/// Deux cotes du polygone qui se croisent. Les indices designent le cote qui
/// part de la borne d'indice [first] (et [second]) vers la suivante.
class EdgeCrossing {
  const EdgeCrossing(this.first, this.second);

  final int first;
  final int second;

  @override
  bool operator ==(Object other) =>
      other is EdgeCrossing && other.first == first && other.second == second;

  @override
  int get hashCode => Object.hash(first, second);

  @override
  String toString() => 'EdgeCrossing($first, $second)';
}

/// Mesures d'un polygone ferme, calculees en UTM 31N comme sur le serveur
/// (EF-107). Les sommets sont donnes dans l'ordre des bornes, sans repeter
/// le premier a la fin.
class PolygonMetrics {
  PolygonMetrics._(
    this.vertices,
    this.sideLengthsM,
    this.areaM2,
    this.perimeterM,
    this.crossings,
  );

  factory PolygonMetrics.fromWgs84(
    List<({double latitude, double longitude})> points,
  ) {
    final vertices = [
      for (final p in points) toUtm31N(p.latitude, p.longitude),
    ];
    final count = vertices.length;
    final sides = <double>[];
    var twiceArea = 0.0;
    for (var i = 0; i < count && count >= 2; i++) {
      final a = vertices[i];
      final b = vertices[(i + 1) % count];
      sides.add(
        math.sqrt(
          math.pow(b.easting - a.easting, 2) +
              math.pow(b.northing - a.northing, 2),
        ),
      );
      twiceArea += a.easting * b.northing - b.easting * a.northing;
    }
    final closed = count >= 3;
    return PolygonMetrics._(
      vertices,
      closed ? sides : sides.take(math.max(0, count - 1)).toList(),
      closed ? twiceArea.abs() / 2 : 0,
      closed ? sides.fold(0.0, (sum, s) => sum + s) : 0,
      closed ? _findCrossings(vertices) : const [],
    );
  }

  final List<UtmPoint> vertices;

  /// Longueur de chaque cote, de la borne i a la borne i + 1 (le dernier
  /// cote revient a la premiere borne).
  final List<double> sideLengthsM;
  final double areaM2;
  final double perimeterM;

  /// Cotes non voisins qui se coupent : le polygone est alors refuse (EF-201).
  final List<EdgeCrossing> crossings;

  bool get isClosed => vertices.length >= 3;
  bool get selfIntersects => crossings.isNotEmpty;

  /// Au moins 3 sommets, sans croisement, et pas un trait aplati : des bornes
  /// alignees en degres ne le sont plus tout a fait en UTM, d'ou un critere
  /// de forme (surface / perimetre au carre) plutot qu'une surface minimale.
  /// Un carre vaut 0,0625 ; une bande de 1 m sur 100 m vaut 0,0025.
  bool get isValid =>
      isClosed &&
      !selfIntersects &&
      perimeterM > 0 &&
      areaM2 / (perimeterM * perimeterM) > 1e-4;
}

List<EdgeCrossing> _findCrossings(List<UtmPoint> v) {
  final n = v.length;
  final result = <EdgeCrossing>[];
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      // Cotes voisins : ils partagent une borne, ce n'est pas un croisement.
      if (j == i + 1 || (i == 0 && j == n - 1)) continue;
      if (_segmentsIntersect(v[i], v[(i + 1) % n], v[j], v[(j + 1) % n])) {
        result.add(EdgeCrossing(i, j));
      }
    }
  }
  return result;
}

double _cross(UtmPoint o, UtmPoint a, UtmPoint b) =>
    (a.easting - o.easting) * (b.northing - o.northing) -
    (a.northing - o.northing) * (b.easting - o.easting);

bool _onSegment(UtmPoint p, UtmPoint a, UtmPoint b) =>
    math.min(a.easting, b.easting) <= p.easting &&
    p.easting <= math.max(a.easting, b.easting) &&
    math.min(a.northing, b.northing) <= p.northing &&
    p.northing <= math.max(a.northing, b.northing);

bool _segmentsIntersect(UtmPoint p1, UtmPoint p2, UtmPoint p3, UtmPoint p4) {
  // Tolerance de 1 mm pour les points presque alignes.
  const eps = 1e-3;
  final d1 = _cross(p3, p4, p1);
  final d2 = _cross(p3, p4, p2);
  final d3 = _cross(p1, p2, p3);
  final d4 = _cross(p1, p2, p4);
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
      ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
    return true;
  }
  if (d1.abs() <= eps && _onSegment(p1, p3, p4)) return true;
  if (d2.abs() <= eps && _onSegment(p2, p3, p4)) return true;
  if (d3.abs() <= eps && _onSegment(p3, p1, p2)) return true;
  if (d4.abs() <= eps && _onSegment(p4, p1, p2)) return true;
  return false;
}
