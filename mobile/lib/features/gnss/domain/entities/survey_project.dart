/// Chantier de leve cote serveur (GET /projects, contracts/sync.yaml).
///
/// Son identifiant est le projectId envoye avec chaque mission : le serveur
/// refuse les points d'un chantier qui n'est pas assigne au topographe ou qui
/// est clos (CA-7).
class SurveyProject {
  const SurveyProject({
    required this.id,
    required this.title,
    required this.open,
  });

  final String id;
  final String title;

  /// Faux si le chantier est clos : il n'accepte plus de points.
  final bool open;

  static SurveyProject? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final id = json['id'];
    final title = json['title'];
    if (id is! String || title is! String) return null;
    return SurveyProject(
      id: id,
      title: title,
      open: json['status'] == 'OUVERT',
    );
  }
}
