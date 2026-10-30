/// Statut public d'une parcelle (GET /parcels/:id/status, contracts/land.yaml).
/// Aucune donnee personnelle : ni geometre, ni voisins, ni coordonnees.
class ParcelPublicStatus {
  const ParcelPublicStatus({
    required this.id,
    required this.legalStatus,
    required this.statusSource,
    required this.statusDate,
    required this.titleNumber,
    required this.disputeNote,
    required this.certified,
    required this.areaM2,
    required this.version,
    required this.versionsCount,
    required this.lastSurveyAt,
    required this.bornage,
    required this.warnings,
  });

  final String id;

  /// TITRE, COUTUMIER_NON_TITRE, EN_LITIGE ou INCONNU.
  final String legalStatus;
  final String? statusSource;

  /// Date du document source, AAAA-MM-JJ.
  final String? statusDate;
  final String? titleNumber;
  final String? disputeNote;
  final bool certified;
  final double areaM2;
  final int version;
  final int versionsCount;
  final DateTime lastSurveyAt;
  final ({int neighboursTotal, int neighboursPresent})? bornage;
  final List<String> warnings;

  bool get inDispute => legalStatus == 'EN_LITIGE';

  factory ParcelPublicStatus.fromJson(Map<String, dynamic> json) {
    final bornage = json['bornage'] as Map<String, dynamic>?;
    return ParcelPublicStatus(
      id: json['id'] as String,
      legalStatus: json['legalStatus'] as String,
      statusSource: json['statusSource'] as String?,
      statusDate: json['statusDate'] as String?,
      titleNumber: json['titleNumber'] as String?,
      disputeNote: json['disputeNote'] as String?,
      certified: json['certified'] as bool,
      areaM2: (json['areaM2'] as num).toDouble(),
      version: (json['version'] as num).toInt(),
      versionsCount:
          (json['versionsCount'] as num?)?.toInt() ??
          (json['version'] as num).toInt(),
      lastSurveyAt: DateTime.parse(json['lastSurveyAt'] as String),
      bornage: bornage == null
          ? null
          : (
              neighboursTotal: (bornage['neighboursTotal'] as num).toInt(),
              neighboursPresent: (bornage['neighboursPresent'] as num).toInt(),
            ),
      warnings: [
        for (final w in json['warnings'] as List? ?? const []) w as String,
      ],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'legalStatus': legalStatus,
    'statusSource': statusSource,
    'statusDate': statusDate,
    'titleNumber': titleNumber,
    'disputeNote': disputeNote,
    'certified': certified,
    'areaM2': areaM2,
    'version': version,
    'versionsCount': versionsCount,
    'lastSurveyAt': lastSurveyAt.toUtc().toIso8601String(),
    'bornage': bornage == null
        ? null
        : {
            'neighboursTotal': bornage!.neighboursTotal,
            'neighboursPresent': bornage!.neighboursPresent,
          },
    'warnings': warnings,
  };
}

/// Identifiant `TG-<commune>-<numero>`, comme le serveur.
final parcelIdPattern = RegExp(r'^TG-[A-Z0-9]{3}-\d{5,6}$');
