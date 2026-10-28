import 'dart:math' as math;

/// Point projete en UTM, en metres.
class UtmPoint {
  const UtmPoint(this.easting, this.northing);

  final double easting;
  final double northing;
}

// Ellipsoide WGS84.
const double _a = 6378137.0;
const double _f = 1 / 298.257223563;
const double _k0 = 0.9996;
const double _falseEasting = 500000.0;

/// Meridien central de la zone UTM 31 (Togo) : 3 degres Est.
const double utm31CentralMeridian = 3.0;

/// Projection WGS84 (EPSG:4326) vers UTM zone 31 Nord (EPSG:32631), la meme
/// que le serveur (ST_Transform). Serie de Kruger a l'ordre 6 : erreur bien
/// inferieure au millimetre dans la zone.
UtmPoint toUtm31N(double latitude, double longitude) {
  final n = _f / (2 - _f);
  final n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
  final bigA = _a / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);

  final alpha = [
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
  final e = math.sqrt(_f * (2 - _f));

  final tau = math.tan(phi);
  final sigma = _sinh(e * _atanh(e * tau / math.sqrt(1 + tau * tau)));
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

  return UtmPoint(_falseEasting + _k0 * bigA * eta, _k0 * bigA * xi);
}

double _sinh(double x) => (math.exp(x) - math.exp(-x)) / 2;
double _cosh(double x) => (math.exp(x) + math.exp(-x)) / 2;
double _asinh(double x) => math.log(x + math.sqrt(x * x + 1));
double _atanh(double x) => 0.5 * math.log((1 + x) / (1 - x));
