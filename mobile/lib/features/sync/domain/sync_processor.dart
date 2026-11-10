// ignore_for_file: prefer_initializing_formals

import '../../gnss/domain/repositories/survey_session_store.dart';
import '../../gnss/domain/repositories/sync_queue_store.dart';
import '../data/sync_api.dart';

/// Resultat d'un passage de la file d'envoi (EF-405).
class SyncRunResult {
  const SyncRunResult({
    required this.sent,
    required this.rejected,
    required this.failed,
    required this.remaining,
  });

  final int sent;
  final int rejected;
  final int failed;
  final int remaining;
}

/// Envoie les missions en attente une par une, dans l'ordre de la file.
///
/// Difference avec le processeur du module GNSS : un refus metier du serveur
/// (400, 403, 409) passe l'entree en REJECTED avec le motif conserve, tandis
/// qu'une panne reseau ou une erreur serveur la laisse PENDING pour la
/// reprise automatique (EF-405, RG-08). Renvoyer le meme clientId ne cree pas
/// de doublon cote serveur (CA-3), la reprise est donc sans risque.
class SyncProcessor {
  SyncProcessor({
    required SurveySessionStore sessions,
    required SyncQueueStore queue,
    required SyncApi api,
  }) : _sessions = sessions,
       _queue = queue,
       _api = api;

  final SurveySessionStore _sessions;
  final SyncQueueStore _queue;
  final SyncApi _api;

  Future<SyncRunResult> flush() async {
    var sent = 0;
    var rejected = 0;
    var failed = 0;

    for (final entry in await _queue.pending()) {
      final session = await _sessions.loadSession(entry.sessionId);
      if (session == null) {
        await _queue.markRejected(entry.sessionId, 'Mission locale introuvable.');
        rejected++;
        continue;
      }
      if (!session.canSync) {
        await _queue.markRejected(
          entry.sessionId,
          'La mission n est pas prete a etre envoyee.',
        );
        rejected++;
        continue;
      }

      try {
        await _api.send(session.toSyncPayload());
        await _queue.markSynced(entry.sessionId);
        sent++;
      } on SyncApiException catch (error) {
        if (error.isBusiness) {
          await _queue.markRejected(entry.sessionId, error.message);
          rejected++;
        } else {
          await _queue.markFailed(entry.sessionId, error.message);
          failed++;
        }
      } catch (error) {
        await _queue.markFailed(entry.sessionId, error.toString());
        failed++;
      }
    }

    return SyncRunResult(
      sent: sent,
      rejected: rejected,
      failed: failed,
      remaining: await _queue.pendingCount(),
    );
  }
}
