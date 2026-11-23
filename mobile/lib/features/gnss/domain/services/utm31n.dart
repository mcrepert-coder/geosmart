import 'dart:math' as math;

/// Coordonnee projetee en UTM zone 31 Nord, en metres.
class Utm31NCoordinate {
  const Utm31NCoordinate({required this.easting, required this.northing});

  final double easting;
  final double northing;

  @override
  String toString() =>
      'Utm31NCoordinate(easting: $easting, northing: $northing)';
}

// Ellipsoide WGS84.
const double _semiMajorAxis = 6378137.0;
const double _flattening = 1 / 298.257223563;
const double _scaleFactor = 0.9996;
const double _falseEasting = 500000.0;

/// Meridien central de la zone UTM 31 (Togo) : 3 degres Est.
const double utm31CentralMeridian = 3.0;

/// Projette une position WGS84 (EPSG:4326) en UTM zone 31 Nord
/// (EPSG:32631), la meme projection que le serveur PostGIS.
///
/// Serie de Kruger a l'ordre 6 : erreur inferieure au millimetre dans la
/// zone. Les coordonnees sont stockees en WGS84 et seules les mesures sont
/// calculees en UTM 31N.
Utm31NCoordinate toUtm31N(double latitude, double longitude) {
  if (latitude.isNaN || latitude < -90 || latitude > 90) {
    throw ArgumentError.value(
      latitude,
      'latitude',
      'Doit etre entre -90 et 90',
    );
  }
  if (longitude.isNaN) {
    throw ArgumentError.value(longitude, 'longitude', 'Doit etre un nombre');
  }

  final n = _flattening / (2 - _flattening);
  final n2 = n * n;
  final n3 = n2 * n;
  final n4 = n3 * n;
  final n5 = n4 * n;
  final n6 = n5 * n;
  final bigA = _semiMajorAxis / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);

  final alpha = <double>[
    n / 2 -
        2 * n2 / 3 +
        5 * n3 / 16 +
        41 * n4 / 180 -
        127 * n5 / 288 +
        7891 * n6 / 37800,
    13 * n2 / 48 -
        3 * n3 / 5 +
        557 * n4 / 1440 +
        281 * n5 / 630 -
        1983433 * n6 / 1935360,
    61 * n3 / 240 - 103 * n4 / 140 + 15061 * n5 / 26880 + 167603 * n6 / 181440,
    49561 * n4 / 161280 - 179 * n5 / 168 + 6601661 * n6 / 7257600,
    34729 * n5 / 80640 - 3418889 * n6 / 1995840,
    212378941 * n6 / 319334400,
  ];

  final phi = latitude * math.pi / 180;
  final lambda = (longitude - utm31CentralMeridian) * math.pi / 180;
  final eccentricity = math.sqrt(_flattening * (2 - _flattening));

  final tau = math.tan(phi);
  final sigma = _sinh(
    eccentricity * _atanh(eccentricity * tau / math.sqrt(1 + tau * tau)),
  );
  final tauPrime =
      tau * math.sqrt(1 + sigma * sigma) - sigma * math.sqrt(1 + tau * tau);

  final xiPrime = math.atan2(tauPrime, math.cos(lambda));
  final etaPrime = _asinh(
    math.sin(lambda) /
        math.sqrt(tauPrime * tauPrime + math.pow(math.cos(lambda), 2)),
  );

  var xi = xiPrime;
  var eta = etaPrime;
  for (var j = 1; j <= 6; j++) {
    xi += alpha[j - 1] * math.sin(2 * j * xiPrime) * _cosh(2 * j * etaPrime);
    eta += alpha[j - 1] * math.cos(2 * j * xiPrime) * _sinh(2 * j * etaPrime);
  }

  return Utm31NCoordinate(
    easting: _falseEasting + _scaleFactor * bigA * eta,
    northing: _scaleFactor * bigA * xi,
  );
}

double _sinh(double x) => (math.exp(x) - math.exp(-x)) / 2;
double _cosh(double x) => (math.exp(x) + math.exp(-x)) / 2;
double _asinh(double x) => math.log(x + math.sqrt(x * x + 1));
double _atanh(double x) => 0.5 * math.log((1 + x) / (1 - x));
