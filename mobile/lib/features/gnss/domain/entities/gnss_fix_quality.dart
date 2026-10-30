/// Qualité du fix GNSS (champ 6 de la trame NMEA GGA).
enum GnssFixQuality {
  invalid(0, 'Invalide', 'INVALIDE'),
  autonomous(1, 'Autonome', 'AUTONOME'),
  dgps(2, 'DGPS', 'DGPS'),
  fixed(4, 'RTK Fixed', 'FIXED'),
  float(5, 'RTK Float', 'FLOAT');

  const GnssFixQuality(this.nmeaCode, this.label, this.serialized);

  /// Code numérique de la trame GGA.
  final int nmeaCode;

  /// Libellé affiché à l'utilisateur.
  final String label;

  /// Valeur stockée en base locale et échangée avec l'API.
  final String serialized;

  /// RG-01 / RG-03 : seul le RTK Fixed valide une borne.
  bool get canRecordPoint => this == GnssFixQuality.fixed;

  /// Alias tolérés en lecture uniquement (jamais écrits).
  static const _aliases = <String, GnssFixQuality>{
    'RTK_FIXED': GnssFixQuality.fixed,
    'RTK_FLOAT': GnssFixQuality.float,
    'AUTONOMOUS': GnssFixQuality.autonomous,
  };

  /// Échec fermé : tout code absent ou inconnu devient [invalid].
  static GnssFixQuality fromNmeaCode(int? code) {
    for (final q in values) {
      if (q.nmeaCode == code) return q;
    }
    return GnssFixQuality.invalid;
  }

  /// Échec fermé : toute chaîne absente ou inconnue devient [invalid].
  static GnssFixQuality fromString(String? value) {
    final v = value?.trim().toUpperCase();
    if (v == null || v.isEmpty) return GnssFixQuality.invalid;
    final alias = _aliases[v];
    if (alias != null) return alias;
    for (final q in values) {
      if (q.serialized == v) return q;
    }
    return GnssFixQuality.invalid;
  }

  String toSerializedString() => serialized;
}
