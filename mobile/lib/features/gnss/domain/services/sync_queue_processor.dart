import '../entities/survey_session.dart';
import '../entities/survey_session_status.dart';
import '../repositories/survey_session_store.dart';
import '../repositories/sync_queue_store.dart';
import '../repositories/sync_transport.dart';

/// Resultat d'un passage de la file d'envoi.
class SyncQueueResult {
  const SyncQueueResult({
    required this.sent,
    required this.rejected,
    required this.failed,
    required this.remaining,
  });

  final int sent;
  final int rejected;
  final int failed;
  final int remaining;

  bool get hasFailures => rejected > 0 || failed > 0;
}

/// Envoie les missions terminees une par une, dans l'ordre de la file.
///
/// Une mission refusee pour une raison metier passe a `REJECTED`. Une panne
/// reseau laisse la mission `PENDING` avec une tentative supplementaire.
class SyncQueueProcessor {
  SyncQueueProcessor({
    required this.sessions,
    required this.queue,
    required this.transport,
  });

  final SurveySessionStore sessions;
  final SyncQueueStore queue;
  final SyncTransport transport;

  Future<SyncQueueResult> flush() async {
    var sent = 0;
    var rejected = 0;
    var failed = 0;

    for (final entry in await queue.pending()) {
      final session = await sessions.loadSession(entry.sessionId);
      if (session == null) {
        await queue.markRejected(
          entry.sessionId,
          'Mission locale introuvable.',
        );
        rejected++;
        continue;
      }
      if (!session.canSync) {
        await queue.markRejected(entry.sessionId, _blockingReason(session));
        rejected++;
        continue;
      }

      try {
        await transport.send(session.toSyncPayload());
        await sessions.saveSession(
          session.copyWith(status: SurveySessionStatus.synced),
        );
        await queue.markSynced(entry.sessionId);
        sent++;
      } catch (error) {
        await queue.markFailed(entry.sessionId, error.toString());
        failed++;
      }
    }

    return SyncQueueResult(
      sent: sent,
      rejected: rejected,
      failed: failed,
      remaining: await queue.pendingCount(),
    );
  }

  String _blockingReason(SurveySession session) {
    if (!session.status.canSync) {
      return 'La mission n\'est pas terminee.';
    }
    if (!session.hasMinimumPoints) {
      return 'La mission contient moins de trois bornes.';
    }
    if (!session.allPointsValidated) {
      return 'Une borne n\'est pas en RTK Fixed.';
    }
    if (!session.hasMeasurements) {
      return 'Le perimetre et la surface ne sont pas calcules.';
    }
    return 'La mission n\'est pas prete a etre envoyee.';
  }
}
