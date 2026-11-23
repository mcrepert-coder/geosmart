import '../services/survey_measurements.dart';
import 'survey_point.dart';
import 'survey_session_status.dart';

/// Mission de leve : ensemble ordonne de bornes enregistrees sur le terrain.
///
/// La mission est l'unite de stockage et de synchronisation. Les bornes sont
/// conservees localement pendant le leve, puis la mission complete est envoyee
/// au serveur apres son passage au statut [SurveySessionStatus.completed].
class SurveySession {
  const SurveySession({
    required this.id,
    required this.clientId,
    required this.projectId,
    required this.surveyorId,
    required this.title,
    required this.createdAt,
    this.status = SurveySessionStatus.draft,
    this.points = const [],
    this.perimeterMeters,
    this.areaSquareMeters,
    this.completedAt,
    this.deletedAt,
  });

  /// Identifiant local de la mission.
  final String id;

  /// Identifiant unique pour la synchronisation hors ligne (RG-08).
  final String clientId;

  /// Identifiant serveur du chantier assigne.
  final String projectId;

  /// Identifiant du topographe assigne (CA-7).
  final String surveyorId;

  /// Nom ou reference de la mission.
  final String title;

  /// Statut courant de la mission.
  final SurveySessionStatus status;

  /// Bornes de la mission, dans l'ordre du leve.
  final List<SurveyPoint> points;

  /// Perimetre calcule en metres (UTM 31N).
  final double? perimeterMeters;

  /// Surface calculee en metres carres (UTM 31N).
  final double? areaSquareMeters;

  /// Date de creation locale.
  final DateTime createdAt;

  /// Date de fin du leve, renseignee au passage a [SurveySessionStatus.completed].
  final DateTime? completedAt;

  /// Date de mise a la corbeille locale (nullable).
  final DateTime? deletedAt;

  /// Nombre minimal de bornes pour former une parcelle.
  static const minimumPoints = 3;

  /// La mission est actuellement placee dans la corbeille.
  bool get inTrash => deletedAt != null;

  /// La mission peut etre restauree depuis la corbeille.
  bool get canRestore => inTrash;

  /// Toutes les bornes sont en RTK Fixed (RG-01).
  bool get allPointsValidated =>
      points.isNotEmpty && points.every((point) => point.isValidated);

  /// La mission contient assez de bornes pour former une parcelle.
  bool get hasMinimumPoints => points.length >= minimumPoints;

  /// Le perimetre et la surface ont ete calcules avant l'envoi.
  bool get hasMeasurements =>
      perimeterMeters != null && areaSquareMeters != null;

  /// La mission peut etre envoyee au serveur.
  ///
  /// Elle doit etre terminee, contenir au moins trois bornes toutes validees,
  /// avoir son perimetre et sa surface calcules, et ne pas etre en corbeille.
  bool get canSync =>
      !inTrash &&
      status.canSync &&
      hasMinimumPoints &&
      allPointsValidated &&
      hasMeasurements;

  /// La mission est terminee, en attente d'envoi ou deja envoyee.
  bool get isCompleted =>
      status == SurveySessionStatus.completed ||
      status == SurveySessionStatus.synced;

  /// La mission peut passer a `COMPLETED` avec ses mesures calculees.
  bool get canComplete =>
      !inTrash && !isCompleted && hasMinimumPoints && allPointsValidated;

  /// La mission peut etre supprimee localement (brouillon ou en cours, hors corbeille).
  bool get canDelete => !inTrash && status.canDelete;

  /// Cree une copie de la mission avec les champs fournis.
  SurveySession copyWith({
    String? id,
    String? clientId,
    String? projectId,
    String? surveyorId,
    String? title,
    SurveySessionStatus? status,
    List<SurveyPoint>? points,
    double? perimeterMeters,
    double? areaSquareMeters,
    DateTime? createdAt,
    DateTime? completedAt,
    Object? deletedAt = _unspecified,
  }) {
    return SurveySession(
      id: id ?? this.id,
      clientId: clientId ?? this.clientId,
      projectId: projectId ?? this.projectId,
      surveyorId: surveyorId ?? this.surveyorId,
      title: title ?? this.title,
      status: status ?? this.status,
      points: points ?? this.points,
      perimeterMeters: perimeterMeters ?? this.perimeterMeters,
      areaSquareMeters: areaSquareMeters ?? this.areaSquareMeters,
      createdAt: createdAt ?? this.createdAt,
      completedAt: completedAt ?? this.completedAt,
      deletedAt: identical(deletedAt, _unspecified)
          ? this.deletedAt
          : deletedAt as DateTime?,
    );
  }

  static const Object _unspecified = Object();

  /// Termine le leve et enregistre les mesures calculees.
  SurveySession complete({
    required double perimeterMeters,
    required double areaSquareMeters,
    DateTime? completedAt,
  }) {
    return copyWith(
      status: SurveySessionStatus.completed,
      perimeterMeters: perimeterMeters,
      areaSquareMeters: areaSquareMeters,
      completedAt: completedAt ?? DateTime.now().toUtc(),
    );
  }

  /// Rouvre une mission terminee pour corriger ses bornes.
  ///
  /// Les mesures calculees et la date de fin sont effacees : elles seront
  /// recalculees a la prochaine cloture. Une mission deja synchronisee ne
  /// doit pas etre rouverte.
  SurveySession reopen() {
    return SurveySession(
      id: id,
      clientId: clientId,
      projectId: projectId,
      surveyorId: surveyorId,
      title: title,
      status: SurveySessionStatus.inProgress,
      points: points,
      createdAt: createdAt,
    );
  }

  /// Termine le leve en calculant perimetre et surface en UTM 31N (EF-107).
  ///
  /// Leve une [StateError] si la mission ne contient pas au moins trois
  /// bornes toutes validees en RTK Fixed.
  SurveySession completeWithMeasurements({DateTime? completedAt}) {
    if (!canComplete) {
      throw StateError(
        'La mission doit contenir au moins $minimumPoints bornes RTK Fixed '
        'et ne pas etre deja terminee.',
      );
    }
    final measurements = SurveyMeasurements.fromPoints(points);
    return complete(
      perimeterMeters: measurements.perimeterMeters,
      areaSquareMeters: measurements.areaSquareMeters,
      completedAt: completedAt,
    );
  }

  /// Represente la mission seule, sans ses bornes, pour la table locale.
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'client_id': clientId,
      'project_id': projectId,
      'surveyor_id': surveyorId,
      'title': title,
      'status': status.serialized,
      'perimeter_meters': perimeterMeters,
      'area_square_meters': areaSquareMeters,
      'created_at': createdAt.toIso8601String(),
      'completed_at': completedAt?.toIso8601String(),
      'deleted_at': deletedAt?.toIso8601String(),
    };
  }

  /// Reconstruit une mission depuis la table locale et ses bornes.
  factory SurveySession.fromMap(
    Map<String, dynamic> map, {
    List<SurveyPoint> points = const [],
  }) {
    final completedAt = map['completed_at'] as String?;
    final deletedAt = map['deleted_at'] as String?;
    return SurveySession(
      id: map['id'] as String,
      clientId: map['client_id'] as String,
      projectId: map['project_id'] as String,
      surveyorId: map['surveyor_id'] as String,
      title: map['title'] as String,
      status: SurveySessionStatus.fromString(map['status'] as String?),
      points: points,
      perimeterMeters: (map['perimeter_meters'] as num?)?.toDouble(),
      areaSquareMeters: (map['area_square_meters'] as num?)?.toDouble(),
      createdAt: DateTime.parse(map['created_at'] as String),
      completedAt: completedAt == null ? null : DateTime.parse(completedAt),
      deletedAt: deletedAt == null ? null : DateTime.parse(deletedAt),
    );
  }

  /// Charge utile d'une mission pour `POST /sync` (contracts/survey.md).
  ///
  /// Leve une [StateError] si la mission n'est pas prete a etre synchronisee.
  Map<String, dynamic> toSyncPayload() {
    if (!canSync) {
      throw StateError(
        'La mission doit etre terminee, contenir au moins '
        '$minimumPoints bornes RTK Fixed et avoir son perimetre et sa surface.',
      );
    }

    final orderedPoints = [...points]
      ..sort((a, b) => a.pointNumber.compareTo(b.pointNumber));

    return {
      'clientId': clientId,
      'entityType': 'survey_session',
      'action': 'CREATE',
      'payload': {
        'projectId': projectId,
        'surveyorId': surveyorId,
        'title': title,
        'status': status.serialized,
        'perimeterMeters': perimeterMeters,
        'areaSquareMeters': areaSquareMeters,
        'createdAt': createdAt.toIso8601String(),
        'completedAt': completedAt?.toIso8601String(),
        'points': orderedPoints.map((point) => point.toPayload()).toList(),
      },
    };
  }
}
