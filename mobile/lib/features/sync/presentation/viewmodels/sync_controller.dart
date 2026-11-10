// ignore_for_file: prefer_initializing_formals

import 'package:flutter/foundation.dart';

import '../../../gnss/domain/repositories/survey_session_store.dart';
import '../../../gnss/domain/repositories/sync_queue_store.dart';
import '../../domain/sync_processor.dart';

/// Pilote l'ecran de synchronisation (EF-405) : etat de la file locale,
/// envoi manuel et reprise. Les refus sont conserves avec leur motif.
class SyncController extends ChangeNotifier {
  SyncController({
    required SyncQueueStore queue,
    required SurveySessionStore sessions,
    required SyncProcessor processor,
  }) : _queue = queue,
       _sessions = sessions,
       _processor = processor;

  final SyncQueueStore _queue;
  final SurveySessionStore _sessions;
  final SyncProcessor _processor;

  List<SyncQueueEntry> _pending = const [];
  List<SyncQueueEntry> _rejected = const [];
  Map<String, String> _titles = const {};
  bool _busy = false;
  String? _lastRunSummary;

  List<SyncQueueEntry> get pending => _pending;
  List<SyncQueueEntry> get rejected => _rejected;
  bool get busy => _busy;
  String? get lastRunSummary => _lastRunSummary;

  /// Titre d'une mission de la file, charge avec l'etat.
  String titleOf(String sessionId) => _titles[sessionId] ?? sessionId;

  Future<void> refresh() async {
    _pending = await _queue.pending();
    _rejected = await _queue.rejected();
    final titles = <String, String>{};
    for (final entry in [..._pending, ..._rejected]) {
      final session = await _sessions.loadSession(entry.sessionId);
      if (session != null) titles[entry.sessionId] = session.title;
    }
    _titles = titles;
    notifyListeners();
  }

  /// Envoie la file maintenant, puis recharge l'etat. Apres une panne reseau
  /// les entrees restent PENDING et seront reprises au prochain passage.
  Future<void> flush() async {
    _busy = true;
    notifyListeners();
    final result = await _processor.flush();
    _lastRunSummary =
        '${result.sent} envoyee(s), ${result.rejected} refusee(s), '
        '${result.failed} echec(s) reseau, ${result.remaining} en attente.';
    _busy = false;
    await refresh();
  }
}
