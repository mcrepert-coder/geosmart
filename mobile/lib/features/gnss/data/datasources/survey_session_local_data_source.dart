import 'package:sqflite/sqflite.dart';

import '../../domain/entities/survey_point.dart';
import '../../domain/entities/survey_session.dart';
import '../../domain/entities/survey_session_status.dart';
import '../../domain/repositories/survey_session_store.dart';

/// Stockage SQLite des missions et de leurs bornes.
///
/// Une mission et ses bornes restent dans les memes tables, et une borne
/// n'existe jamais sans sa mission (cle etrangere).
class SurveySessionLocalDataSource implements SurveySessionStore {
  SurveySessionLocalDataSource(this._database);

  final Database _database;

  @override
  Future<void> createSession(SurveySession session) async {
    await _database.insert(
      'survey_sessions',
      session.toMap(),
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  @override
  Future<SurveySession?> loadSession(String id) async {
    final rows = await _database.query(
      'survey_sessions',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return SurveySession.fromMap(rows.first, points: await pointsFor(id));
  }

  @override
  Future<List<SurveyPoint>> pointsFor(String sessionId) async {
    final rows = await _database.query(
      'survey_points',
      where: 'session_id = ?',
      whereArgs: [sessionId],
      orderBy: 'point_number ASC',
    );
    return rows.map(SurveyPoint.fromMap).toList();
  }

  @override
  Future<void> addPoint(String sessionId, SurveyPoint point) async {
    await _database.transaction((transaction) async {
      await transaction.insert('survey_points', {
        ...point.toMap(),
        'session_id': sessionId,
      });
      await transaction.update(
        'survey_sessions',
        {'status': SurveySessionStatus.inProgress.serialized},
        where: 'id = ? AND status = ?',
        whereArgs: [sessionId, SurveySessionStatus.draft.serialized],
      );
    });
  }

  @override
  Future<void> removePoint(String pointId) async {
    await _database.delete(
      'survey_points',
      where: 'id = ?',
      whereArgs: [pointId],
    );
  }
}
