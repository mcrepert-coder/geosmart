/// Bornage contradictoire (EF-208, maquette T6) : voisins presents et date.
/// Memes regles que le serveur (normalizeBornage). Les photos attendent la
/// decision de LGR sur leur stockage (issue #24).
library;

enum NeighbourSide {
  n('N', 'Nord'),
  s('S', 'Sud'),
  e('E', 'Est'),
  o('O', 'Ouest');

  const NeighbourSide(this.code, this.label);

  final String code;
  final String label;
}

/// Telephone togolais, ex. +228 90 12 34 56.
final togoPhonePattern = RegExp(r'^\+228 ?\d{2} ?\d{2} ?\d{2} ?\d{2}$');

class Neighbour {
  const Neighbour({
    required this.name,
    required this.side,
    required this.present,
    this.phone,
    this.representedBy,
  });

  final String name;
  final NeighbourSide side;
  final bool present;
  final String? phone;

  /// Personne qui represente un voisin absent.
  final String? representedBy;

  /// Message d'erreur, ou null si le voisin est valide.
  String? validate() {
    final n = name.trim();
    if (n.isEmpty) return 'Le nom du voisin est obligatoire.';
    if (n.length > 120) return 'Le nom ne doit pas dépasser 120 caractères.';
    final p = phone?.trim() ?? '';
    if (p.isNotEmpty && !togoPhonePattern.hasMatch(p)) {
      return 'Téléphone attendu au format +228 90 12 34 56.';
    }
    if ((representedBy?.trim().length ?? 0) > 120) {
      return 'Le nom du représentant ne doit pas dépasser 120 caractères.';
    }
    return null;
  }

  Map<String, dynamic> toJson() => {
    'name': name.trim(),
    if (phone != null && phone!.trim().isNotEmpty) 'phone': phone!.trim(),
    'side': side.code,
    'present': present,
    if (!present && representedBy != null && representedBy!.trim().isNotEmpty)
      'representedBy': representedBy!.trim(),
  };
}

class Bornage {
  const Bornage({required this.neighbours, required this.heldAt});

  static const maxNeighbours = 20;

  final List<Neighbour> neighbours;
  final DateTime heldAt;

  int get presentCount => neighbours.where((n) => n.present).length;

  String? validate() {
    if (neighbours.isEmpty) return 'Ajoutez au moins un voisin.';
    if (neighbours.length > maxNeighbours) {
      return 'Au plus $maxNeighbours voisins.';
    }
    for (final n in neighbours) {
      final problem = n.validate();
      if (problem != null) return problem;
    }
    // Petite marge pour l'horloge du telephone, comme le serveur.
    if (heldAt.isAfter(DateTime.now().add(const Duration(minutes: 5)))) {
      return 'Le bornage ne peut pas être daté dans le futur.';
    }
    return null;
  }

  Map<String, dynamic> toJson() => {
    'neighbours': [for (final n in neighbours) n.toJson()],
    'heldAt': heldAt.toUtc().toIso8601String(),
  };
}
