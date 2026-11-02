import '../entities/survey_point.dart';
import '../entities/survey_session.dart';

/// Port local des missions. La mission est l'unite de stockage : ses bornes
/// sont toujours lues avec elle, jamais separement.
abstract interface class SurveySessionStore {
  Future<void> createSession(SurveySession session);

  Future<SurveySession?> loadSession(String id);

  /// Met a jour la mission seule, sans toucher a ses bornes.
  Future<void> saveSession(SurveySession session);

  Future<List<SurveyPoint>> pointsFor(String sessionId);

  Future<void> addPoint(String sessionId, SurveyPoint point);

  /// Remplace une borne existante, par exemple apres une nouvelle mesure.
  Future<void> updatePoint(String sessionId, SurveyPoint point);

  Future<void> removePoint(String pointId);
}
