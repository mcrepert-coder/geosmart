import '../../../gnss/domain/entities/gnss_fix_quality.dart';
import '../../../gnss/domain/entities/survey_point.dart';
import '../geometry/polygon_metrics.dart';
import 'bornage.dart';

/// Communes de l'identifiant `TG-<commune>-<numero>`. Liste PROVISOIRE, la
/// meme que le serveur, en attendant la liste officielle (issue #24).
const Map<String, String> communes = {'AGO': 'Agoe-Nyive', 'LOM': 'Lome'};

/// Statut juridique declare lors du leve (maquette T5).
enum DeclaredStatus {
  titre('Titré', 'TITRE'),
  coutumier('Coutumier', 'COUTUMIER_NON_TITRE'),
  litige('En litige', 'EN_LITIGE');

  const DeclaredStatus(this.label, this.serialized);

  final String label;
  final String serialized;
}

/// Ce qui empeche de mettre la parcelle en file d'envoi.
enum DraftBlocker {
  tooFewPoints,
  flatPolygon,
  selfIntersection,
  noCommune,
  noStatus,
  noTitleNumber,
}

/// Parcelle en cours de construction sur le telephone, avant la file d'envoi
/// (RG-08). Immuable : chaque modification renvoie un nouveau brouillon.
class ParcelDraft {
  ParcelDraft({
    required this.surveySessionId,
    required List<SurveyPoint> points,
    this.commune,
    this.locality,
    this.declaredStatus,
    this.titleNumber,
    this.bornage,
  }) : points = List.unmodifiable(points),
       metrics = PolygonMetrics.fromWgs84([
         for (final p in points) (latitude: p.latitude, longitude: p.longitude),
       ]);

  final String surveySessionId;

  /// Bornes dans l'ordre du tour de la parcelle.
  final List<SurveyPoint> points;
  final String? commune;
  final String? locality;
  final DeclaredStatus? declaredStatus;
  final String? titleNumber;

  /// Bornage contradictoire, facultatif (EF-208).
  final Bornage? bornage;
  final PolygonMetrics metrics;

  int get fixedCount => points.where((p) => p.fixQuality.canRecordPoint).length;

  /// RG-03 : une borne hors RTK Fixed n'empeche pas l'envoi, mais la parcelle
  /// ne sera pas certifiee et ne donnera pas d'attestation.
  bool get allPointsFixed => points.isNotEmpty && fixedCount == points.length;

  List<DraftBlocker> get blockers => [
    if (points.length < 3) DraftBlocker.tooFewPoints,
    if (metrics.selfIntersects) DraftBlocker.selfIntersection,
    if (points.length >= 3 && !metrics.selfIntersects && !metrics.isValid)
      DraftBlocker.flatPolygon,
    if (commune == null) DraftBlocker.noCommune,
    if (declaredStatus == null) DraftBlocker.noStatus,
    if (declaredStatus == DeclaredStatus.titre &&
        (titleNumber?.trim().isEmpty ?? true))
      DraftBlocker.noTitleNumber,
  ];

  bool get canQueue => blockers.isEmpty;

  ParcelDraft copyWith({
    List<SurveyPoint>? points,
    String? commune,
    String? locality,
    DeclaredStatus? declaredStatus,
    String? titleNumber,
    Bornage? bornage,
  }) {
    return ParcelDraft(
      surveySessionId: surveySessionId,
      points: points ?? this.points,
      commune: commune ?? this.commune,
      locality: locality ?? this.locality,
      declaredStatus: declaredStatus ?? this.declaredStatus,
      titleNumber: titleNumber ?? this.titleNumber,
      bornage: bornage ?? this.bornage,
    );
  }

  /// Deplace une borne dans la liste (appui long puis glisser).
  ParcelDraft reorder(int oldIndex, int newIndex) {
    final list = [...points];
    final moved = list.removeAt(oldIndex);
    list.insert(newIndex > oldIndex ? newIndex - 1 : newIndex, moved);
    return copyWith(points: list);
  }

  /// Message de la maquette : "Les cotes B2-B3 et B4-B5 se croisent."
  String? crossingMessage() {
    if (!metrics.selfIntersects) return null;
    String side(int i) =>
        '${points[i].pointName}-${points[(i + 1) % points.length].pointName}';
    final c = metrics.crossings.first;
    return 'Les côtés ${side(c.first)} et ${side(c.second)} se croisent. Réordonnez les bornes.';
  }

  /// Corps de POST /parcels (contracts/land.yaml, ParcelCreate).
  /// Le statut declare n'y figure pas encore : le serveur ne l'accepte que de
  /// l'administrateur avec sa source (question 3 de l'issue #24).
  Map<String, dynamic> toCreatePayload() {
    assert(canQueue, 'Brouillon incomplet : $blockers');
    final ring = [
      for (final p in points) [p.longitude, p.latitude],
      [points.first.longitude, points.first.latitude],
    ];
    return {
      'surveySessionId': surveySessionId,
      'commune': commune,
      if (locality != null && locality!.trim().isNotEmpty)
        'locality': locality!.trim(),
      'geometry': {
        'type': 'Polygon',
        'coordinates': [ring],
      },
      'boundaries': [
        for (final p in points)
          {
            'pointNumber': p.pointNumber,
            'surveyPointId': p.id,
            'name': p.pointName,
            'fixQuality': _serverFixQuality(p.fixQuality),
            'pdop': p.pdop,
            'satellitesCount': p.satellitesCount,
            'instrument': p.instrument,
            'recordedAt': p.recordedAt.toUtc().toIso8601String(),
          },
      ],
      if (bornage != null) 'bornage': bornage!.toJson(),
    };
  }
}

// Le serveur connait FIXED, FLOAT, AUTONOME et INVALIDE : un point DGPS est
// envoye comme AUTONOME (non certifiable dans les deux cas).
String _serverFixQuality(GnssFixQuality quality) =>
    quality == GnssFixQuality.dgps ? 'AUTONOME' : quality.serialized;
