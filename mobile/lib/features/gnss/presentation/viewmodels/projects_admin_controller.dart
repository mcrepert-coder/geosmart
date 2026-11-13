import 'package:flutter/foundation.dart';

import '../../data/survey_projects_api.dart';
import '../../domain/entities/managed_project.dart';

/// Operations de gestion des chantiers (contracts/sync.yaml, /projects).
abstract interface class ProjectsAdminGateway {
  Future<List<ManagedProject>> listManaged();
  Future<List<ProjectTopographer>> listTopographers();
  Future<void> create(String title);
  Future<void> assign(String projectId, String accountId);
  Future<void> unassign(String projectId, String accountId);
  Future<void> close(String projectId);
}

/// SurveyProjectsApi fournit deja toutes les operations.
class ApiProjectsAdminGateway implements ProjectsAdminGateway {
  const ApiProjectsAdminGateway(this.api);

  final SurveyProjectsApi api;

  @override
  Future<List<ManagedProject>> listManaged() => api.listManaged();
  @override
  Future<List<ProjectTopographer>> listTopographers() => api.listTopographers();
  @override
  Future<void> create(String title) => api.create(title);
  @override
  Future<void> assign(String projectId, String accountId) =>
      api.assign(projectId, accountId);
  @override
  Future<void> unassign(String projectId, String accountId) =>
      api.unassign(projectId, accountId);
  @override
  Future<void> close(String projectId) => api.close(projectId);
}

/// ViewModel de l'ecran Chantiers du geometre (EF-109, CA-7) : creer un
/// chantier, y assigner ou retirer des topographes, le clore.
class ProjectsAdminController extends ChangeNotifier {
  ProjectsAdminController({required this.gateway});

  final ProjectsAdminGateway gateway;

  List<ManagedProject> _projects = const [];
  List<ProjectTopographer> _topographers = const [];
  bool _loading = false;
  bool _busy = false;
  String? _error;
  bool _disposed = false;

  List<ManagedProject> get projects => _projects;
  List<ProjectTopographer> get topographers => _topographers;
  bool get loading => _loading;
  bool get busy => _busy;
  String? get error => _error;

  /// Topographes pas encore assignes a [project].
  List<ProjectTopographer> assignableTo(ManagedProject project) => [
    for (final t in _topographers)
      if (!project.topographers.any((a) => a.id == t.id)) t,
  ];

  Future<void> load() async {
    _loading = true;
    _error = null;
    _notify();
    try {
      final results = await Future.wait([
        gateway.listManaged(),
        gateway.listTopographers(),
      ]);
      _projects = results[0] as List<ManagedProject>;
      _topographers = results[1] as List<ProjectTopographer>;
    } on Object catch (error) {
      _error = _message(error);
    } finally {
      _loading = false;
      _notify();
    }
  }

  Future<bool> create(String title) {
    final trimmed = title.trim();
    if (trimmed.isEmpty) {
      _error = 'Le nom du chantier est obligatoire.';
      _notify();
      return Future.value(false);
    }
    return _run(() => gateway.create(trimmed));
  }

  Future<bool> assign(ManagedProject project, ProjectTopographer topo) =>
      _run(() => gateway.assign(project.id, topo.id));

  Future<bool> unassign(ManagedProject project, ProjectTopographer topo) =>
      _run(() => gateway.unassign(project.id, topo.id));

  Future<bool> close(ManagedProject project) =>
      _run(() => gateway.close(project.id));

  /// Execute une modification puis recharge la liste.
  Future<bool> _run(Future<void> Function() action) async {
    if (_busy) return false;
    _busy = true;
    _error = null;
    _notify();
    try {
      await action();
      _projects = await gateway.listManaged();
      return true;
    } on Object catch (error) {
      _error = _message(error);
      return false;
    } finally {
      _busy = false;
      _notify();
    }
  }

  static String _message(Object error) => error is SurveyProjectsException
      ? error.message
      : 'L operation sur les chantiers a echoue.';

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
