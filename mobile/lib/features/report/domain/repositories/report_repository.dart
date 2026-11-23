import '../../../gnss/domain/entities/survey_session.dart';

/// Plan PDF local d'un leve (EF-108).
abstract interface class ReportRepository {
  /// Plan de la mission : dessin du polygone, bornes, distances, perimetre
  /// et surface en UTM 31N. Exige au moins trois bornes.
  Future<List<int>> createSurveyPlan(SurveySession session);
}
