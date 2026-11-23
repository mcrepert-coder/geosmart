import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/survey_session_store.dart';

/// Faux depot local capable de contenir plusieurs missions.
///
/// Les missions sont triees de la plus recente a la plus ancienne, comme le
/// depot SQLite, pour verifier la liste et la bascule de mission.
class FakeMultiSessionStore implements SurveySessionStore {
  FakeMultiSessionStore({List<SurveySession> sessions = const []}) {
    for (final session in sessions) {
      _sessions[session.id] = session.copyWith(points: [...session.points]);
    }
  }

  final Map<String, SurveySession> _sessions = {};
  bool failCreate = false;
  bool failDelete = false;
  int createCalls = 0;
  int deleteCalls = 0;
  int trashCalls = 0;
  int restoreCalls = 0;
  int purgeCalls = 0;

  List<SurveySession> get stored => List.unmodifiable(_sessions.values);

  @override
  Future<void> createSession(SurveySession session) async {
    createCalls++;
    if (failCreate) throw StateError('Ecriture refusee');
    _sessions[session.id] = session.copyWith(points: [...session.points]);
  }

  @override
  Future<SurveySession?> loadSession(String id) async {
    final session = _sessions[id];
    if (session == null) return null;
    return session.copyWith(points: [...session.points]);
  }

  @override
  Future<List<SurveySession>> listSessions() async {
    final sorted = _sessions.values.where((s) => !s.inTrash).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return [
      for (final session in sorted)
        session.copyWith(points: [...session.points]),
    ];
  }

  @override
  Future<void> saveSession(SurveySession session) async {
    _sessions[session.id] = session.copyWith(points: [...session.points]);
  }

  @override
  Future<List<SurveyPoint>> pointsFor(String sessionId) async {
    final session = _sessions[sessionId];
    if (session == null) return const [];
    return [...session.points];
  }

  @override
  Future<void> addPoint(String sessionId, SurveyPoint point) async {
    final session = _sessions[sessionId];
    if (session == null) throw StateError('Mission introuvable');
    _sessions[sessionId] = session.copyWith(points: [...session.points, point]);
  }

  @override
  Future<void> updatePoint(String sessionId, SurveyPoint point) async {
    final session = _sessions[sessionId];
    if (session == null) throw StateError('Mission introuvable');
    final index = session.points.indexWhere(
      (existing) => existing.id == point.id,
    );
    if (index < 0) throw StateError('Borne introuvable');
    final points = [...session.points]..[index] = point;
    _sessions[sessionId] = session.copyWith(points: points);
  }

  @override
  Future<void> removePoint(String pointId) async {
    for (final entry in _sessions.entries.toList()) {
      final points = [
        for (final point in entry.value.points)
          if (point.id != pointId) point,
      ];
      _sessions[entry.key] = entry.value.copyWith(points: points);
    }
  }

  @override
  Future<void> deleteSession(String sessionId) async {
    deleteCalls++;
    if (failDelete) throw StateError('Suppression refusee');
    if (!_sessions.containsKey(sessionId)) {
      throw StateError('Mission locale introuvable: $sessionId');
    }
    _sessions.remove(sessionId);
  }

  @override
  Future<void> moveToTrash(String sessionId, {DateTime? deletedAt}) async {
    trashCalls++;
    if (failDelete) throw StateError('Suppression refusee');
    final session = _sessions[sessionId];
    if (session == null || session.inTrash) {
      throw StateError('Mission introuvable ou deja en corbeille: $sessionId');
    }
    _sessions[sessionId] = session.copyWith(
      deletedAt: deletedAt ?? DateTime.now().toUtc(),
    );
  }

  @override
  Future<void> restoreSession(String sessionId) async {
    restoreCalls++;
    final session = _sessions[sessionId];
    if (session == null || !session.inTrash) {
      throw StateError('Mission introuvable dans la corbeille: $sessionId');
    }
    _sessions[sessionId] = session.copyWith(deletedAt: null);
  }

  @override
  Future<List<SurveySession>> listTrashSessions() async {
    final sorted = _sessions.values.where((s) => s.inTrash).toList()
      ..sort(
        (a, b) =>
            (b.deletedAt ?? b.createdAt).compareTo(a.deletedAt ?? a.createdAt),
      );
    return [
      for (final session in sorted)
        session.copyWith(points: [...session.points]),
    ];
  }

  @override
  Future<int> purgeExpiredTrash({
    Duration maxAge = const Duration(days: 7),
    DateTime? now,
  }) async {
    purgeCalls++;
    final reference = now ?? DateTime.now().toUtc();
    final expiredIds = [
      for (final session in _sessions.values)
        if (session.inTrash &&
            session.deletedAt != null &&
            reference.difference(session.deletedAt!) > maxAge)
          session.id,
    ];
    for (final id in expiredIds) {
      _sessions.remove(id);
    }
    return expiredIds.length;
  }
}
