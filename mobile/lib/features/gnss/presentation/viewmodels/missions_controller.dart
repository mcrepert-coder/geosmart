import 'package:flutter/foundation.dart';

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
    this.defaultProjectId = 'demo-project',
    this.defaultSurveyorId = 'demo-surveyor',
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
  bool _loading = true;
  String? _error;
  bool _disposed = false;

  static int _idCounter = 0;

  static String _defaultId() {
    _idCounter++;
    return '${DateTime.now().toUtc().microsecondsSinceEpoch}-$_idCounter';
  }

  List<SurveySession> get missions => List.unmodifiable(_missions);

  bool get isLoading => _loading;

  String? get error => _error;

  /// Relit les missions locales, de la plus recente a la plus ancienne.
  Future<void> load() async {
    _loading = true;
    _error = null;
    _notify();
    try {
      _missions = await store.listSessions();
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
