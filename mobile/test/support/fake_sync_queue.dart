import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/sync_queue_store.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/sync_transport.dart';

/// File d'envoi en memoire pour les tests.
class FakeSyncQueueStore implements SyncQueueStore {
  final Map<String, SyncQueueEntry> entries = {};
  bool failEnqueue = false;

  @override
  Future<void> enqueue(SurveySession session) async {
    if (failEnqueue) throw StateError('File indisponible');
    entries.putIfAbsent(
      session.id,
      () => SyncQueueEntry(
        sessionId: session.id,
        clientId: session.clientId,
        status: SyncQueueStatus.pending,
        attempts: 0,
        enqueuedAt: DateTime.now().toUtc(),
      ),
    );
  }

  @override
  Future<List<SyncQueueEntry>> pending() async => [
    for (final entry in entries.values)
      if (entry.status == SyncQueueStatus.pending) entry,
  ];

  @override
  Future<int> pendingCount() async => (await pending()).length;

  @override
  Future<List<SyncQueueEntry>> rejected() async => [
    for (final entry in entries.values)
      if (entry.status == SyncQueueStatus.rejected) entry,
  ];

  @override
  Future<void> markSynced(String sessionId) async {
    _replace(sessionId, SyncQueueStatus.synced, null);
  }

  @override
  Future<void> markRejected(String sessionId, String error) async {
    _replace(sessionId, SyncQueueStatus.rejected, error);
  }

  @override
  Future<void> markFailed(String sessionId, String error) async {
    final current = entries[sessionId];
    if (current == null) return;
    entries[sessionId] = SyncQueueEntry(
      sessionId: current.sessionId,
      clientId: current.clientId,
      status: SyncQueueStatus.pending,
      attempts: current.attempts + 1,
      enqueuedAt: current.enqueuedAt,
      lastError: error,
    );
  }

  @override
  Future<void> markPending(String sessionId) async {
    _replace(sessionId, SyncQueueStatus.pending, null);
  }

  @override
  Future<void> remove(String sessionId) async {
    entries.remove(sessionId);
  }

  void _replace(String sessionId, SyncQueueStatus status, String? error) {
    final current = entries[sessionId];
    if (current == null) return;
    entries[sessionId] = SyncQueueEntry(
      sessionId: current.sessionId,
      clientId: current.clientId,
      status: status,
      attempts: current.attempts,
      enqueuedAt: current.enqueuedAt,
      lastError: error,
    );
  }
}

/// Transport de test : enregistre les charges utiles ou echoue a la demande.
class FakeSyncTransport implements SyncTransport {
  final List<Map<String, dynamic>> sent = [];
  Object? failure;

  @override
  Future<void> send(Map<String, dynamic> payload) async {
    if (failure != null) throw failure!;
    sent.add(payload);
  }
}
