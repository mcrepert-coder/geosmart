/// Statut d'une mission de leve.
///
/// Une mission ne peut etre synchronisee qu'apres son passage a [completed].
enum SurveySessionStatus {
  draft('DRAFT', 'Brouillon'),
  inProgress('IN_PROGRESS', 'En cours'),
  completed('COMPLETED', 'Terminee'),
  synced('SYNCED', 'Synchronisee');

  const SurveySessionStatus(this.serialized, this.label);

  /// Valeur stockee en base locale et echangee avec l'API.
  final String serialized;

  /// Libelle affiche a l'utilisateur.
  final String label;

  /// Indique si la mission peut etre envoyee au serveur.
  bool get canSync => this == SurveySessionStatus.completed;

  /// Echec ferme : un statut absent ou inconnu devient [draft].
  static SurveySessionStatus fromString(String? value) {
    final v = value?.trim().toUpperCase();
    if (v == null || v.isEmpty) return SurveySessionStatus.draft;
    for (final status in values) {
      if (status.serialized == v) return status;
    }
    return SurveySessionStatus.draft;
  }

  String toSerializedString() => serialized;
}
