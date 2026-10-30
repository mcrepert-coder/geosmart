import '../../domain/entities/gnss_fix_quality.dart';
import '../../domain/entities/gnss_position.dart';

/// Analyse les phrases NMEA du flux natif et produit des positions.
///
/// Le decodage reste en Dart, comme le veut le contrat : le Kotlin ne fait que
/// transporter les octets du recepteur. Une phrase dont le controle de somme
/// est faux est ignoree, et une trame incomplete ne produit rien.
class NmeaPositionDecoder {
  NmeaPositionDecoder({DateTime Function()? clock, this.instrument = 'UM982'})
    : _clock = clock ?? (() => DateTime.now().toUtc());

  final DateTime Function() _clock;

  /// Nom de l'instrument reporte sur chaque position (RG-04).
  final String instrument;

  double? _pdop;
  double? _hdopFromGsa;
  double? _vdop;
  double? _speed;

  /// Traite une phrase. Renvoie une position sur une trame GGA exploitable.
  GnssPosition? feed(String rawLine) {
    final line = rawLine.trim();
    if (!_hasValidChecksum(line)) return null;

    final withoutChecksum = line.substring(0, line.lastIndexOf('*'));
    final fields = withoutChecksum.split(',');
    final header = fields.first;
    if (header.length < 6) return null;

    switch (header.substring(3)) {
      case 'GGA':
        return _onGga(fields);
      case 'GSA':
        _onGsa(fields);
        return null;
      case 'RMC':
        _onRmc(fields);
        return null;
      default:
        return null;
    }
  }

  GnssPosition? _onGga(List<String> fields) {
    if (fields.length < 10) return null;
    final latitude = _coordinate(fields[2], fields[3], isLatitude: true);
    final longitude = _coordinate(fields[4], fields[5], isLatitude: false);
    if (latitude == null || longitude == null) return null;

    return GnssPosition(
      latitude: latitude,
      longitude: longitude,
      altitude: _decimal(fields[9]),
      fixQuality: GnssFixQuality.fromNmeaCode(_integer(fields[6])),
      satellitesCount: _integer(fields[7]) ?? 0,
      pdop: _pdop,
      hdop: _decimal(fields[8]) ?? _hdopFromGsa,
      vdop: _vdop,
      speed: _speed,
      instrument: instrument,
      recordedAt: _clock(),
    );
  }

  void _onGsa(List<String> fields) {
    if (fields.length < 18) return;
    _pdop = _decimal(fields[15]);
    _hdopFromGsa = _decimal(fields[16]);
    _vdop = _decimal(fields[17]);
  }

  void _onRmc(List<String> fields) {
    if (fields.length < 9) return;
    if (fields[2] != 'A') {
      _speed = null;
      return;
    }
    final knots = _decimal(fields[7]);
    _speed = knots == null ? null : knots * 0.514444;
  }

  double? _coordinate(
    String value,
    String hemisphere, {
    required bool isLatitude,
  }) {
    final raw = double.tryParse(value);
    if (raw == null || raw < 0) return null;
    final degrees = (raw / 100).floor();
    final minutes = raw - degrees * 100;
    if (minutes >= 60) return null;
    if (isLatitude && degrees > 90) return null;
    if (!isLatitude && degrees > 180) return null;

    var result = degrees + minutes / 60;
    if (hemisphere == 'S' || hemisphere == 'W') {
      result = -result;
    }
    return result;
  }

  int? _integer(String value) => int.tryParse(value.trim());

  double? _decimal(String value) => double.tryParse(value.trim());

  bool _hasValidChecksum(String line) {
    if (!line.startsWith(r'$')) return false;
    final star = line.lastIndexOf('*');
    if (star < 0 || star != line.length - 3) return false;

    var checksum = 0;
    for (final unit in line.substring(1, star).codeUnits) {
      checksum ^= unit;
    }
    final declared = int.tryParse(line.substring(star + 1), radix: 16);
    return declared == checksum;
  }
}
