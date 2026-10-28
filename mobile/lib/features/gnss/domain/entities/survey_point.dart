import 'gnss_fix_quality.dart';
import 'gnss_position.dart';

/// Borne physique de leve mesuree sur le terrain par le recepteur GNSS.
/// Defini selon le contrat contracts/survey.md.
class SurveyPoint {
  const SurveyPoint({
    required this.id,
    required this.clientId,
    required this.projectId,
    required this.surveyorId,
    required this.pointNumber,
    required this.pointName,
    required this.latitude,
    required this.longitude,
    required this.recordedAt,
    this.altitude,
    this.accuracy,
    required this.fixQuality,
    required this.satellitesCount,
    required this.pdop,
    this.hdop,
    this.vdop,
    this.instrument = 'UM982',
  });

  /// Identifiant local unique du point (UUID).
  final String id;

  /// Identifiant unique pour la file de synchronisation hors ligne (RG-08).
  final String clientId;

  /// Identifiant du chantier auquel appartient la borne (EF-109, CA-7).
  final String projectId;

  /// Identifiant de l'operateur ou topographe ayant effectue la mesure (CA-7).
  final String surveyorId;

  /// Numero sequentiel de la borne (1, 2, 3...).
  final int pointNumber;

  /// Libelle d'affichage de la borne (ex: "B1", "B2").
  final String pointName;

  /// Latitude WGS84 en degres decimaux.
  final double latitude;

  /// Longitude WGS84 en degres decimaux.
  final double longitude;

  /// Altitude en metres.
  final double? altitude;

  /// Precision horizontale estimee (sigma H) en metres.
  final double? accuracy;

  /// Qualite du fix GNSS au moment de la mesure.
  final GnssFixQuality fixQuality;

  /// Nombre de satellites utilises (RG-04).
  final int satellitesCount;

  /// Dilution de precision 3D (PDOP, RG-04).
  final double pdop;

  /// Dilution de precision horizontale (HDOP).
  final double? hdop;

  /// Dilution de precision verticale (VDOP).
  final double? vdop;

  /// Instrument utilise (ex: UM982, RG-04).
  final String instrument;

  /// Horodatage precis de la mesure (RG-04).
  final DateTime recordedAt;

  /// Regle stricte RG-01 / RG-03 :
  /// "Pas de RTK Fixed, pas de borne validee".
  /// Seul un point capture en RTK Fixed peut etre valide comme borne officielle.
  bool get isValidated => fixQuality.canRecordPoint;

  /// Cree un SurveyPoint a partir d'une GnssPosition capturee et des metadonnees du chantier.
  factory SurveyPoint.fromPosition({
    required String id,
    required String clientId,
    required String projectId,
    required String surveyorId,
    required int pointNumber,
    required String pointName,
    required GnssPosition position,
  }) {
    return SurveyPoint(
      id: id,
      clientId: clientId,
      projectId: projectId,
      surveyorId: surveyorId,
      pointNumber: pointNumber,
      pointName: pointName,
      latitude: position.latitude,
      longitude: position.longitude,
      altitude: position.altitude,
      accuracy: position.accuracy,
      fixQuality: position.fixQuality,
      satellitesCount: position.satellitesCount,
      pdop: position.pdop ?? 99.0,
      hdop: position.hdop,
      vdop: position.vdop,
      instrument: position.instrument,
      recordedAt: position.recordedAt,
    );
  }

  /// Format d'echange JSON conforme a POST /sync (contracts/survey.md).
  Map<String, dynamic> toSyncPayload() {
    return {
      'clientId': clientId,
      'entityType': 'survey_point',
      'action': 'CREATE',
      'payload': {
        'projectId': projectId,
        'pointNumber': pointNumber,
        'pointName': pointName,
        'latitude': latitude,
        'longitude': longitude,
        'altitude': altitude,
        'fixQuality': fixQuality.serialized,
        'satellitesCount': satellitesCount,
        'pdop': pdop,
        'hdop': hdop,
        'vdop': vdop,
        'instrument': instrument,
        'recordedAt': recordedAt.toIso8601String(),
        'isValidated': isValidated,
      },
    };
  }

  /// Representation sous forme de Map pour la base de donnees locale SQLite.
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'client_id': clientId,
      'project_id': projectId,
      'surveyor_id': surveyorId,
      'point_number': pointNumber,
      'point_name': pointName,
      'latitude': latitude,
      'longitude': longitude,
      'altitude': altitude,
      'accuracy': accuracy,
      'fix_quality': fixQuality.serialized,
      'satellites_count': satellitesCount,
      'pdop': pdop,
      'hdop': hdop,
      'vdop': vdop,
      'instrument': instrument,
      'recorded_at': recordedAt.toIso8601String(),
      'is_validated': isValidated ? 1 : 0,
    };
  }

  /// Reconstruction depuis la base de donnees locale SQLite.
  factory SurveyPoint.fromMap(Map<String, dynamic> map) {
    return SurveyPoint(
      id: map['id'] as String,
      clientId: map['client_id'] as String,
      projectId: map['project_id'] as String,
      surveyorId: map['surveyor_id'] as String,
      pointNumber: (map['point_number'] as num).toInt(),
      pointName: map['point_name'] as String,
      latitude: (map['latitude'] as num).toDouble(),
      longitude: (map['longitude'] as num).toDouble(),
      altitude: (map['altitude'] as num?)?.toDouble(),
      accuracy: (map['accuracy'] as num?)?.toDouble(),
      fixQuality: GnssFixQuality.fromString(map['fix_quality'] as String?),
      satellitesCount: (map['satellites_count'] as num?)?.toInt() ?? 0,
      pdop: (map['pdop'] as num?)?.toDouble() ?? 99.0,
      hdop: (map['hdop'] as num?)?.toDouble(),
      vdop: (map['vdop'] as num?)?.toDouble(),
      instrument: (map['instrument'] as String?) ?? 'UM982',
      recordedAt: DateTime.parse(map['recorded_at'] as String),
    );
  }
}
