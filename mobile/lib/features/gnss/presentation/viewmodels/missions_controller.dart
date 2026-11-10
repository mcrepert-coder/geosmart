import 'package:flutter/foundation.dart';

import '../../../../app/runtime_config.dart';
import '../../domain/entities/survey_session.dart';
import '../../domain/repositories/survey_session_store.dart';

/// ViewModel de la liste des missions.
///
/// Il lit les missions locales et cree une nouvelle mission vide. La mission
/// reste l'unite de stockage : ses bornes sont chargees par le controleur de
/// mesure au moment de son ouverture.
class MissionsController extends ChangeNotifier {
  MissionsController({
    required this.store,
    this.defaultProjectId = projectId,
    this.defaultSurveyorId = surveyorId,
    String Function()? idGenerator,
    DateTime Function()? clock,
  }) : _idGenerator = idGenerator ?? _defaultId,
       _clock = clock ?? DateTime.now;

  final SurveySessionStore store;

  /// Chantier et topographe associes tant que la selection n'est pas branchee
  /// sur les donnees serveur.
  final String defaultProjectId;
  final String defaultSurveyorId;

  final String Function() _idGenerator;
  final DateTime Function() _clock;

  List<SurveySession> _missions = const [];
  List<SurveySession> _trash = const [];
  bool _loading = true;
  String? _error;
  bool _disposed = false;

  static int _idCounter = 0;

  static String _defaultId() {
    _idCounter++;
    return '${DateTime.now().toUtc().microsecondsSinceEpoch}-$_idCounter';
  }

  List<SurveySession> get missions => List.unmodifiable(_missions);

  List<SurveySession> get trash => List.unmodifiable(_trash);

  int get trashCount => _trash.length;

  bool get isLoading => _loading;

  String? get error => _error;

  /// Relit les missions locales et la corbeille, en purgeant les elements
  /// de corbeille plus vieux que sept jours.
  Future<void> load() async {
    _loading = true;
    _error = null;
    _notify();
    try {
      await store.purgeExpiredTrash(now: _clock().toUtc());
      final sessions = await store.listSessions();
      _missions = sessions
          .where((mission) => demoModeEnabled || mission.id != demoSessionId)
          .toList();
      _trash = await store.listTrashSessions();
    } catch (_) {
      _error = 'Les missions n ont pas pu etre lues.';
    } finally {
      _loading = false;
      _notify();
    }
  }

  /// Cree une mission vide et l'ajoute en tete de liste.
  ///
  /// Renvoie `null` si le nom est vide ou si l'ecriture locale echoue.
  Future<SurveySession?> createMission({required String title}) async {
    final trimmed = title.trim();
    if (trimmed.isEmpty) {
      _error = 'Le nom de la mission est obligatoire.';
      _notify();
      return null;
    }
    if (defaultProjectId.trim().isEmpty || defaultSurveyorId.trim().isEmpty) {
      _error =
          'Configurez GEOSMART_PROJECT_ID et GEOSMART_SURVEYOR_ID avant de creer une mission.';
      _notify();
      return null;
    }

    final session = SurveySession(
      id: _idGenerator(),
      clientId: _idGenerator(),
      projectId: defaultProjectId,
      surveyorId: defaultSurveyorId,
      title: trimmed,
      createdAt: _clock().toUtc(),
    );

    try {
      await store.createSession(session);
      _missions = [
        session,
        ..._missions.where((mission) => mission.id != session.id),
      ];
      _error = null;
      _notify();
      return session;
    } catch (_) {
      _error = 'La mission n a pas pu etre creee.';
      _notify();
      return null;
    }
  }

  /// Deplace une mission non synchronisee dans la corbeille locale.
  ///
  /// La mission y reste conservee sept jours avant purge automatique.
  /// Renvoie `false` et renseigne [error] si la mission ne peut pas etre
  /// deplacee ou si l'ecriture echoue.
  Future<bool> deleteMission(String sessionId) async {
    final session = _missions.where((m) => m.id == sessionId).firstOrNull;
    if (session == null) {
      _error = "Mission introuvable sur l'appareil.";
      _notify();
      return false;
    }
    if (!session.canDelete) {
      _error =
          'Seules les missions en brouillon ou en cours peuvent etre supprimees.';
      _notify();
      return false;
    }
    try {
      final now = _clock().toUtc();
      await store.moveToTrash(sessionId, deletedAt: now);
      _missions = _missions.where((m) => m.id != sessionId).toList();
      _trash = [
        session.copyWith(deletedAt: now),
        ..._trash.where((m) => m.id != sessionId),
      ];
      _error = null;
      _notify();
      return true;
    } catch (_) {
      _error = 'La mission n a pas pu etre supprimee.';
      _notify();
      return false;
    }
  }

  /// Restaure une mission placee dans la corbeille.
  Future<bool> restoreMission(String sessionId) async {
    final session = _trash.where((m) => m.id == sessionId).firstOrNull;
    if (session == null) {
      _error = 'Mission introuvable dans la corbeille.';
      _notify();
      return false;
    }
    try {
      await store.restoreSession(sessionId);
      _trash = _trash.where((m) => m.id != sessionId).toList();
      final restored = session.copyWith(deletedAt: null);
      _missions = [restored, ..._missions.where((m) => m.id != sessionId)]
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      _error = null;
      _notify();
      return true;
    } catch (_) {
      _error = 'La mission n a pas pu etre restauree.';
      _notify();
      return false;
    }
  }

  /// Supprime definitivement une mission de la corbeille.
  Future<bool> permanentlyDelete(String sessionId) async {
    try {
      await store.deleteSession(sessionId);
      _trash = _trash.where((m) => m.id != sessionId).toList();
      _error = null;
      _notify();
      return true;
    } catch (_) {
      _error = 'La suppression definitive a echoue.';
      _notify();
      return false;
    }
  }

  /// Supprime definitivement toutes les missions de la corbeille.
  Future<bool> emptyTrash() async {
    try {
      for (final session in [..._trash]) {
        await store.deleteSession(session.id);
      }
      _trash = const [];
      _error = null;
      _notify();
      return true;
    } catch (_) {
      _error = 'La corbeille n a pas pu etre videe.';
      _notify();
      return false;
    }
  }

  /// Efface le dernier message d'erreur affiche par un formulaire.
  void clearError() {
    if (_error == null) return;
    _error = null;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
