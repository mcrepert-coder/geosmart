import 'gnss_fix_quality.dart';

/// Position GNSS temps reel issue du decodeur de trames NMEA.
class GnssPosition {
  const GnssPosition({
    required this.latitude,
    required this.longitude,
    required this.recordedAt,
    this.altitude,
    this.accuracy,
    this.fixQuality = GnssFixQuality.invalid,
    this.satellitesCount = 0,
    this.pdop,
    this.hdop,
    this.vdop,
    this.speed,
    this.instrument = 'UM982',
  });

  /// Latitude en degres decimaux (WGS84).
  final double latitude;

  /// Longitude en degres decimaux (WGS84).
  final double longitude;

  /// Altitude ellipsoïdale ou niveau de la mer en metres.
  final double? altitude;

  /// Precision horizontale estimee (sigma H) en metres.
  final double? accuracy;

  /// Qualite du positionnement (Fixed, Float, Autonome, Invalide).
  final GnssFixQuality fixQuality;

  /// Nombre de satellites visibles et utilises dans la solution (RG-04).
  final int satellitesCount;

  /// Dilution de precision 3D (PDOP, RG-04).
  final double? pdop;

  /// Dilution de precision horizontale (HDOP).
  final double? hdop;

  /// Dilution de precision verticale (VDOP).
  final double? vdop;

  /// Vitesse au sol en metres par seconde.
  final double? speed;

  /// Identifiant ou nom de l'instrument de mesure (ex: UM982).
  final String instrument;

  /// Horodatage UTC de la trame de position.
  final DateTime recordedAt;

  /// Regle RG-01 / RG-03 : seul un point en RTK Fixed peut valider une mesure.
  bool get isRtkFixed => fixQuality.canRecordPoint;

  /// Indique si la position actuelle autorise la saisie d'une borne.
  bool get canRecordPoint => fixQuality.canRecordPoint;

  /// Cree une copie de l'objet avec des champs modifies.
  GnssPosition copyWith({
    double? latitude,
    double? longitude,
    DateTime? recordedAt,
    double? altitude,
    double? accuracy,
    GnssFixQuality? fixQuality,
    int? satellitesCount,
    double? pdop,
    double? hdop,
    double? vdop,
    double? speed,
    String? instrument,
  }) {
    return GnssPosition(
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      recordedAt: recordedAt ?? this.recordedAt,
      altitude: altitude ?? this.altitude,
      accuracy: accuracy ?? this.accuracy,
      fixQuality: fixQuality ?? this.fixQuality,
      satellitesCount: satellitesCount ?? this.satellitesCount,
      pdop: pdop ?? this.pdop,
      hdop: hdop ?? this.hdop,
      vdop: vdop ?? this.vdop,
      speed: speed ?? this.speed,
      instrument: instrument ?? this.instrument,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      'altitude': altitude,
      'accuracy': accuracy,
      'fix_quality': fixQuality.serialized,
      'satellites_count': satellitesCount,
      'pdop': pdop,
      'hdop': hdop,
      'vdop': vdop,
      'speed': speed,
      'instrument': instrument,
      'recorded_at': recordedAt.toIso8601String(),
    };
  }

  factory GnssPosition.fromMap(Map<String, dynamic> map) {
    return GnssPosition(
      latitude: (map['latitude'] as num).toDouble(),
      longitude: (map['longitude'] as num).toDouble(),
      altitude: (map['altitude'] as num?)?.toDouble(),
      accuracy: (map['accuracy'] as num?)?.toDouble(),
      fixQuality: GnssFixQuality.fromString(map['fix_quality'] as String?),
      satellitesCount: (map['satellites_count'] as num?)?.toInt() ?? 0,
      pdop: (map['pdop'] as num?)?.toDouble(),
      hdop: (map['hdop'] as num?)?.toDouble(),
      vdop: (map['vdop'] as num?)?.toDouble(),
      speed: (map['speed'] as num?)?.toDouble(),
      instrument: (map['instrument'] as String?) ?? 'UM982',
      recordedAt: DateTime.parse(map['recorded_at'] as String),
    );
  }
}
