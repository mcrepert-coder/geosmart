/// Reponses de l'API fonciere utilisees par les ecrans (contracts/land.yaml).
library;

class BoundaryInfo {
  const BoundaryInfo({
    required this.pointNumber,
    required this.name,
    required this.fixQuality,
    this.pdop,
    this.satellitesCount,
  });

  final int pointNumber;
  final String name;

  /// FIXED, FLOAT, AUTONOME ou INVALIDE.
  final String fixQuality;
  final double? pdop;
  final int? satellitesCount;

  bool get isFixed => fixQuality == 'FIXED';

  factory BoundaryInfo.fromJson(Map<String, dynamic> j) => BoundaryInfo(
    pointNumber: (j['pointNumber'] as num).toInt(),
    name: (j['name'] as String?) ?? 'B${j['pointNumber']}',
    fixQuality: j['fixQuality'] as String,
    pdop: (j['pdop'] as num?)?.toDouble(),
    satellitesCount: (j['satellitesCount'] as num?)?.toInt(),
  );
}

/// Parcelle telle que renvoyee par POST, PATCH et GET /parcels/:id.
class ParcelInfo {
  const ParcelInfo({
    required this.id,
    required this.version,
    required this.areaM2,
    required this.perimeterM,
    required this.legalStatus,
    required this.certified,
    required this.geometryHash,
    required this.boundaries,
    required this.updatedAt,
    this.locality,
    this.surveyorId,
  });

  final String id;
  final int version;
  final double areaM2;
  final double perimeterM;
  final String legalStatus;
  final bool certified;
  final String geometryHash;
  final List<BoundaryInfo> boundaries;
  final DateTime updatedAt;
  final String? locality;

  /// Present seulement pour ADMIN et l'auteur.
  final String? surveyorId;

  factory ParcelInfo.fromJson(Map<String, dynamic> j) => ParcelInfo(
    id: j['id'] as String,
    version: (j['version'] as num).toInt(),
    areaM2: (j['areaM2'] as num).toDouble(),
    perimeterM: (j['perimeterM'] as num).toDouble(),
    legalStatus: j['legalStatus'] as String,
    certified: j['certified'] as bool,
    geometryHash: j['geometryHash'] as String,
    boundaries: [
      for (final b in j['boundaries'] as List? ?? const [])
        BoundaryInfo.fromJson(b as Map<String, dynamic>),
    ],
    updatedAt: DateTime.parse(j['updatedAt'] as String),
    locality: j['locality'] as String?,
    surveyorId: (j['surveyor'] as Map<String, dynamic>?)?['id'] as String?,
  );
}

class ParcelVersionInfo {
  const ParcelVersionInfo({
    required this.version,
    required this.geometryHash,
    required this.areaM2,
    required this.createdAt,
    this.reason,
  });

  final int version;
  final String geometryHash;
  final double areaM2;
  final DateTime createdAt;
  final String? reason;

  factory ParcelVersionInfo.fromJson(Map<String, dynamic> j) =>
      ParcelVersionInfo(
        version: (j['version'] as num).toInt(),
        geometryHash: j['geometryHash'] as String,
        areaM2: (j['areaM2'] as num).toDouble(),
        createdAt: DateTime.parse(j['createdAt'] as String),
        reason: j['reason'] as String?,
      );
}

class AttestationInfo {
  const AttestationInfo({
    required this.number,
    required this.parcelId,
    required this.parcelVersion,
    required this.documentHash,
    required this.issuedAt,
    required this.pdfUrl,
  });

  final String number;
  final String parcelId;
  final int parcelVersion;
  final String documentHash;
  final DateTime issuedAt;
  final String pdfUrl;

  factory AttestationInfo.fromJson(Map<String, dynamic> j) => AttestationInfo(
    number: j['number'] as String,
    parcelId: j['parcelId'] as String,
    parcelVersion: (j['parcelVersion'] as num).toInt(),
    documentHash: j['documentHash'] as String,
    issuedAt: DateTime.parse(j['issuedAt'] as String),
    pdfUrl: j['pdfUrl'] as String,
  );
}

class SurveyRequestInfo {
  const SurveyRequestInfo({
    required this.id,
    required this.state,
    required this.agentId,
    required this.locality,
    required this.description,
    required this.createdAt,
    this.surveyorId,
  });

  final String id;

  /// OUVERTE, PRISE, TERMINEE ou ANNULEE.
  final String state;
  final String agentId;
  final String? surveyorId;
  final String locality;
  final String description;
  final DateTime createdAt;

  factory SurveyRequestInfo.fromJson(Map<String, dynamic> j) =>
      SurveyRequestInfo(
        id: j['id'] as String,
        state: j['state'] as String,
        agentId: j['agentId'] as String,
        surveyorId: j['surveyorId'] as String?,
        locality: j['locality'] as String,
        description: j['description'] as String,
        createdAt: DateTime.parse(j['createdAt'] as String),
      );
}
