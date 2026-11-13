import 'package:flutter/foundation.dart';

import '../../../../app/runtime_config.dart';
import '../../domain/entities/survey_project.dart';
import '../../domain/entities/survey_session.dart';
import '../../domain/repositories/survey_session_store.dart';
import '../../domain/services/uuid_v4.dart';

/// Charge les chantiers du compte connecte (GET /projects).
typedef SurveyProjectsLoader = Future<List<SurveyProject>> Function();

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
    this.projectsLoader,
    this.surveyorIdProvider,
    String Function()? idGenerator,
    DateTime Function()? clock,
  }) : _idGenerator = idGenerator ?? _defaultId,
       _clock = clock ?? DateTime.now;

  final SurveySessionStore store;

  /// Chantier et topographe associes tant que la selection n'est pas branchee
  /// sur les donnees serveur.
  final String defaultProjectId;
  final String defaultSurveyorId;

  /// Avec un compte connecte : chantiers assignes au topographe (CA-7). La
  /// mission est alors creee sur le chantier choisi, pas sur
  /// GEOSMART_PROJECT_ID.
  final SurveyProjectsLoader? projectsLoader;

  /// Identifiant du compte connecte, auteur de la mission.
  final String? Function()? surveyorIdProvider;

  List<SurveyProject> _projects = const [];
  bool _projectsLoading = false;
  String? _projectsError;

  /// Vrai si la mission doit etre creee sur un chantier choisi.
  bool get choosesProject => projectsLoader != null;

  /// Chantiers ouverts assignes, dans l'ordre du serveur.
  List<SurveyProject> get projects => _projects;
  bool get projectsLoading => _projectsLoading;
  String? get projectsError => _projectsError;

  /// Recharge les chantiers ouverts du compte connecte.
  Future<void> loadProjects() async {
    final loader = projectsLoader;
    if (loader == null) return;
    _projectsLoading = true;
    _projectsError = null;
    _notify();
    try {
      _projects = (await loader()).where((p) => p.open).toList();
    } on Object catch (error) {
      _projectsError = error.toString().isEmpty
          ? 'Les chantiers ne peuvent pas etre charges.'
          : error.toString();
    } finally {
      _projectsLoading = false;
      _notify();
    }
  }

  final String Function() _idGenerator;
  final DateTime Function() _clock;

  List<SurveySession> _missions = const [];
  List<SurveySession> _trash = const [];
  bool _loading = true;
  String? _error;
  bool _disposed = false;

  // UUID v4 : POST /sync refuse un clientId qui n'est pas un UUID (RG-08).
  static String _defaultId() => uuidV4();

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
  Future<SurveySession?> createMission({
    required String title,
    String? projectId,
  }) async {
    final trimmed = title.trim();
    if (trimmed.isEmpty) {
      _error = 'Le nom de la mission est obligatoire.';
      _notify();
      return null;
    }
    final String chosenProject;
    final String chosenSurveyor;
    if (choosesProject) {
      if (projectId == null || !_projects.any((p) => p.id == projectId)) {
        _error = 'Choisissez un chantier qui vous est assigne.';
        _notify();
        return null;
      }
      chosenProject = projectId;
      chosenSurveyor = surveyorIdProvider?.call() ?? defaultSurveyorId;
    } else {
      chosenProject = defaultProjectId;
      chosenSurveyor = defaultSurveyorId;
    }
    if (chosenProject.trim().isEmpty || chosenSurveyor.trim().isEmpty) {
      _error =
          'Configurez GEOSMART_PROJECT_ID et GEOSMART_SURVEYOR_ID avant de creer une mission.';
      _notify();
      return null;
    }

    final session = SurveySession(
      id: _idGenerator(),
      clientId: _idGenerator(),
      projectId: chosenProject,
      surveyorId: chosenSurveyor,
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
