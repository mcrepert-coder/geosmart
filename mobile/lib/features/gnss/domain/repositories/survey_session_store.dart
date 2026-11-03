import '../entities/survey_point.dart';
import '../entities/survey_session.dart';

/// Port local des missions. La mission est l'unite de stockage : ses bornes
/// sont toujours lues avec elle, jamais separement.
abstract interface class SurveySessionStore {
  Future<void> createSession(SurveySession session);

  Future<SurveySession?> loadSession(String id);

  /// Liste les missions locales, de la plus recente a la plus ancienne.
  Future<List<SurveySession>> listSessions();

  /// Met a jour la mission seule, sans toucher a ses bornes.
  Future<void> saveSession(SurveySession session);

  Future<List<SurveyPoint>> pointsFor(String sessionId);

  Future<void> addPoint(String sessionId, SurveyPoint point);

  /// Remplace une borne existante, par exemple apres une nouvelle mesure.
  Future<void> updatePoint(String sessionId, SurveyPoint point);

  Future<void> removePoint(String pointId);

  /// Supprime definitivement une mission et toutes ses bornes associees.
  Future<void> deleteSession(String sessionId);

  /// Deplace une mission dans la corbeille.
  Future<void> moveToTrash(String sessionId, {DateTime? deletedAt});

  /// Restaure une mission placee dans la corbeille.
  Future<void> restoreSession(String sessionId);

  /// Liste les missions placees dans la corbeille.
  Future<List<SurveySession>> listTrashSessions();

  /// Supprime definitivement les missions en corbeille depuis plus de [maxAge].
  ///
  /// Par defaut 7 jours. Renvoie le nombre de missions purgees.
  Future<int> purgeExpiredTrash({
    Duration maxAge = const Duration(days: 7),
    DateTime? now,
  });
}
