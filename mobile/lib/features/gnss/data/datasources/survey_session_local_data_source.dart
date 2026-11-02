import 'package:sqflite/sqflite.dart';

import '../../domain/entities/survey_point.dart';
import '../../domain/entities/survey_session.dart';
import '../../domain/entities/survey_session_status.dart';
import '../../domain/repositories/survey_session_store.dart';
import '../../domain/repositories/sync_queue_store.dart';

/// Stockage SQLite des missions et de leurs bornes.
///
/// Une mission et ses bornes restent dans les memes tables, et une borne
/// n'existe jamais sans sa mission (cle etrangere).
class SurveySessionLocalDataSource
    implements SurveySessionStore, SyncQueueStore {
  SurveySessionLocalDataSource(this._database);

  final Database _database;
  bool _queueReady = false;

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
  Future<void> saveSession(SurveySession session) async {
    final updated = await _database.update(
      'survey_sessions',
      session.toMap(),
      where: 'id = ?',
      whereArgs: [session.id],
    );
    if (updated == 0) {
      throw StateError('Mission locale introuvable: ${session.id}');
    }
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
  Future<void> updatePoint(String sessionId, SurveyPoint point) async {
    final updated = await _database.update(
      'survey_points',
      point.toMap(),
      where: 'id = ? AND session_id = ?',
      whereArgs: [point.id, sessionId],
    );
    if (updated == 0) {
      throw StateError('Borne locale introuvable: ${point.id}');
    }
  }

  @override
  Future<void> removePoint(String pointId) async {
    await _database.delete(
      'survey_points',
      where: 'id = ?',
      whereArgs: [pointId],
    );
  }

  @override
  Future<void> enqueue(SurveySession session) async {
    await _ensureQueue();
    final now = DateTime.now().toUtc().toIso8601String();
    await _database.insert('survey_sync_queue', {
      'session_id': session.id,
      'client_id': session.clientId,
      'status': SyncQueueStatus.pending.serialized,
      'attempts': 0,
      'last_error': null,
      'enqueued_at': now,
      'updated_at': now,
    }, conflictAlgorithm: ConflictAlgorithm.ignore);
  }

  @override
  Future<List<SyncQueueEntry>> pending() async {
    await _ensureQueue();
    final rows = await _database.query(
      'survey_sync_queue',
      where: 'status = ?',
      whereArgs: [SyncQueueStatus.pending.serialized],
      orderBy: 'enqueued_at ASC',
    );
    return rows.map(_entryFromMap).toList();
  }

  @override
  Future<int> pendingCount() async {
    await _ensureQueue();
    final rows = await _database.rawQuery(
      'SELECT COUNT(*) AS total FROM survey_sync_queue WHERE status = ?',
      [SyncQueueStatus.pending.serialized],
    );
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  @override
  Future<List<SyncQueueEntry>> rejected() async {
    await _ensureQueue();
    final rows = await _database.query(
      'survey_sync_queue',
      where: 'status = ?',
      whereArgs: [SyncQueueStatus.rejected.serialized],
      orderBy: 'updated_at DESC',
    );
    return rows.map(_entryFromMap).toList();
  }

  @override
  Future<void> markSynced(String sessionId) async {
    await _ensureQueue();
    await _database.update(
      'survey_sync_queue',
      {
        'status': SyncQueueStatus.synced.serialized,
        'last_error': null,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'session_id = ?',
      whereArgs: [sessionId],
    );
  }

  @override
  Future<void> markRejected(String sessionId, String error) async {
    await _ensureQueue();
    await _database.update(
      'survey_sync_queue',
      {
        'status': SyncQueueStatus.rejected.serialized,
        'last_error': error,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'session_id = ?',
      whereArgs: [sessionId],
    );
  }

  @override
  Future<void> markFailed(String sessionId, String error) async {
    await _ensureQueue();
    await _database.rawUpdate(
      'UPDATE survey_sync_queue '
      'SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ? '
      'WHERE session_id = ?',
      [
        SyncQueueStatus.pending.serialized,
        error,
        DateTime.now().toUtc().toIso8601String(),
        sessionId,
      ],
    );
  }

  @override
  Future<void> markPending(String sessionId) async {
    await _ensureQueue();
    await _database.update(
      'survey_sync_queue',
      {
        'status': SyncQueueStatus.pending.serialized,
        'last_error': null,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'session_id = ?',
      whereArgs: [sessionId],
    );
  }

  @override
  Future<void> remove(String sessionId) async {
    await _ensureQueue();
    await _database.delete(
      'survey_sync_queue',
      where: 'session_id = ?',
      whereArgs: [sessionId],
    );
  }

  Future<void> _ensureQueue() async {
    if (_queueReady) return;
    await _database.execute('''
      CREATE TABLE IF NOT EXISTS survey_sync_queue (
        session_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        enqueued_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES survey_sessions (id)
          ON DELETE CASCADE
      )
    ''');
    _queueReady = true;
  }

  SyncQueueEntry _entryFromMap(Map<String, Object?> row) {
    return SyncQueueEntry(
      sessionId: row['session_id'] as String,
      clientId: row['client_id'] as String,
      status: SyncQueueStatus.fromString(row['status'] as String?),
      attempts: (row['attempts'] as num?)?.toInt() ?? 0,
      lastError: row['last_error'] as String?,
      enqueuedAt: DateTime.parse(row['enqueued_at'] as String),
    );
  }
}
