/// Topographe assignable ou assigne a un chantier (identifiant et nom).
class ProjectTopographer {
  const ProjectTopographer({required this.id, this.fullName});

  final String id;
  final String? fullName;

  String get label => (fullName == null || fullName!.trim().isEmpty)
      ? 'Topographe ${id.substring(0, id.length < 8 ? id.length : 8)}'
      : fullName!;

  static ProjectTopographer? fromJson(Object? json) {
    if (json is! Map<String, dynamic> || json['id'] is! String) return null;
    final name = json['fullName'];
    return ProjectTopographer(
      id: json['id'] as String,
      fullName: name is String ? name : null,
    );
  }
}

/// Chantier vu par l'administrateur ou le geometre qui le gere (EF-109) :
/// topographes assignes et suivi des envois.
class ManagedProject {
  const ManagedProject({
    required this.id,
    required this.title,
    required this.open,
    required this.topographers,
    required this.missionsCount,
  });

  final String id;
  final String title;
  final bool open;
  final List<ProjectTopographer> topographers;
  final int missionsCount;

  static ManagedProject? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final id = json['id'];
    final title = json['title'];
    if (id is! String || title is! String) return null;
    final topographers = json['topographers'];
    final count = json['missionsCount'];
    return ManagedProject(
      id: id,
      title: title,
      open: json['status'] == 'OUVERT',
      topographers: [
        if (topographers is List)
          for (final t in topographers) ?ProjectTopographer.fromJson(t),
      ],
      missionsCount: count is int ? count : 0,
    );
  }
}
