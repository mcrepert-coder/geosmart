import '../entities/survey_session.dart';

/// Statut d'une mission dans la file d'envoi locale.
enum SyncQueueStatus {
  pending('PENDING'),
  synced('SYNCED'),
  rejected('REJECTED');

  const SyncQueueStatus(this.serialized);

  final String serialized;

  static SyncQueueStatus fromString(String? value) {
    final normalized = value?.trim().toUpperCase();
    for (final status in values) {
      if (status.serialized == normalized) return status;
    }
    return SyncQueueStatus.pending;
  }
}

/// Entree de la file d'envoi : une mission terminee, jamais une borne seule.
class SyncQueueEntry {
  const SyncQueueEntry({
    required this.sessionId,
    required this.clientId,
    required this.status,
    required this.attempts,
    required this.enqueuedAt,
    this.lastError,
  });

  final String sessionId;
  final String clientId;
  final SyncQueueStatus status;
  final int attempts;
  final DateTime enqueuedAt;
  final String? lastError;
}

/// Port local de la file d'envoi des missions terminees (RG-08).
abstract interface class SyncQueueStore {
  /// Ajoute la mission une seule fois. Un renvoi ne cree pas de doublon.
  Future<void> enqueue(SurveySession session);

  Future<List<SyncQueueEntry>> pending();

  Future<int> pendingCount();

  Future<void> markSynced(String sessionId);

  Future<void> markRejected(String sessionId, String error);

  /// Echec reseau temporaire : la mission reste en attente et sera rejouee.
  Future<void> markFailed(String sessionId, String error);

  Future<void> markPending(String sessionId);
}
