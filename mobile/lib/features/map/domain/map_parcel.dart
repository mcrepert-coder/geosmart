/// Point WGS84 d'un contour de parcelle (latitude, longitude en degres).
class GeoPoint {
  const GeoPoint(this.latitude, this.longitude);

  final double latitude;
  final double longitude;

  @override
  bool operator ==(Object other) =>
      other is GeoPoint &&
      other.latitude == latitude &&
      other.longitude == longitude;

  @override
  int get hashCode => Object.hash(latitude, longitude);

  @override
  String toString() => 'GeoPoint($latitude, $longitude)';
}

/// Zone affichee, au format du parametre bbox de GET /parcels :
/// minLon,minLat,maxLon,maxLat en WGS84.
class MapBounds {
  const MapBounds({
    required this.minLon,
    required this.minLat,
    required this.maxLon,
    required this.maxLat,
  });

  final double minLon;
  final double minLat;
  final double maxLon;
  final double maxLat;

  String toQuery() => [
    minLon,
    minLat,
    maxLon,
    maxLat,
  ].map((value) => value.toStringAsFixed(6)).join(',');

  /// Vrai si [other] est entierement dans cette zone : inutile de recharger.
  bool contains(MapBounds other) =>
      other.minLon >= minLon &&
      other.minLat >= minLat &&
      other.maxLon <= maxLon &&
      other.maxLat <= maxLat;

  /// Zone elargie de [ratio] de chaque cote, pour charger un peu au-dela de
  /// l'ecran et ne pas recharger au moindre deplacement.
  MapBounds expand(double ratio) {
    final dLon = (maxLon - minLon) * ratio;
    final dLat = (maxLat - minLat) * ratio;
    return MapBounds(
      minLon: (minLon - dLon).clamp(-180, 180).toDouble(),
      minLat: (minLat - dLat).clamp(-90, 90).toDouble(),
      maxLon: (maxLon + dLon).clamp(-180, 180).toDouble(),
      maxLat: (maxLat + dLat).clamp(-90, 90).toDouble(),
    );
  }
}

/// Statuts juridiques de contracts/land.yaml (LegalStatus).
enum MapLegalStatus {
  titre('TITRE', 'Titré'),
  coutumier('COUTUMIER_NON_TITRE', 'Coutumier non titré'),
  litige('EN_LITIGE', 'En litige'),
  inconnu('INCONNU', 'Statut non renseigné');

  const MapLegalStatus(this.serialized, this.label);

  final String serialized;
  final String label;

  static MapLegalStatus parse(Object? value) => MapLegalStatus.values
      .firstWhere((s) => s.serialized == value, orElse: () => inconnu);
}

/// Parcelle affichee sur la carte : une Feature de ParcelFeatureCollection.
/// Aucune donnee personnelle (contrat GET /parcels).
class MapParcel {
  const MapParcel({
    required this.id,
    required this.outline,
    required this.legalStatus,
    required this.certified,
    this.areaM2,
  });

  final String id;

  /// Contour exterieur, sans le point de fermeture repete.
  final List<GeoPoint> outline;
  final MapLegalStatus legalStatus;
  final bool certified;
  final double? areaM2;

  /// Centre approximatif (moyenne des sommets), pour l'etiquette.
  GeoPoint get center {
    var lat = 0.0;
    var lon = 0.0;
    for (final p in outline) {
      lat += p.latitude;
      lon += p.longitude;
    }
    return GeoPoint(lat / outline.length, lon / outline.length);
  }

  /// Vrai si [point] est a l'interieur du contour (lancer de rayon), pour
  /// retrouver la parcelle touchee sur la carte.
  bool contains(GeoPoint point) {
    var inside = false;
    for (var i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      final a = outline[i];
      final b = outline[j];
      final crosses =
          (a.latitude > point.latitude) != (b.latitude > point.latitude);
      if (crosses &&
          point.longitude <
              (b.longitude - a.longitude) *
                      (point.latitude - a.latitude) /
                      (b.latitude - a.latitude) +
                  a.longitude) {
        inside = !inside;
      }
    }
    return inside;
  }

  /// Lit une Feature GeoJSON. Les coordonnees sont [longitude, latitude].
  /// Renvoie null si la geometrie n'est pas un polygone exploitable.
  static MapParcel? fromFeature(Map<String, dynamic> feature) {
    final id = feature['id'];
    final geometry = feature['geometry'];
    if (id is! String || geometry is! Map<String, dynamic>) return null;
    if (geometry['type'] != 'Polygon') return null;
    final rings = geometry['coordinates'];
    if (rings is! List || rings.isEmpty || rings.first is! List) return null;

    final outline = <GeoPoint>[];
    for (final position in rings.first as List) {
      if (position is! List || position.length < 2) return null;
      final lon = position[0];
      final lat = position[1];
      if (lon is! num || lat is! num) return null;
      outline.add(GeoPoint(lat.toDouble(), lon.toDouble()));
    }
    if (outline.length > 1 && outline.first == outline.last) {
      outline.removeLast();
    }
    if (outline.length < 3) return null;

    final props = feature['properties'] is Map<String, dynamic>
        ? feature['properties'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final area = props['areaM2'];
    return MapParcel(
      id: id,
      outline: List.unmodifiable(outline),
      legalStatus: MapLegalStatus.parse(props['legalStatus']),
      certified: props['certified'] == true,
      areaM2: area is num ? area.toDouble() : null,
    );
  }

  /// Lit une ParcelFeatureCollection ; ignore les elements illisibles.
  static List<MapParcel> fromCollection(Map<String, dynamic> collection) {
    final features = collection['features'];
    if (features is! List) return const [];
    return [
      for (final f in features)
        if (f is Map<String, dynamic>) ?MapParcel.fromFeature(f),
    ];
  }
}

/// Filtres de la carte (EF-406) : statuts affiches et parcelles certifiees.
class MapFilter {
  const MapFilter({
    this.statuses = const {
      MapLegalStatus.titre,
      MapLegalStatus.coutumier,
      MapLegalStatus.litige,
      MapLegalStatus.inconnu,
    },
    this.certifiedOnly = false,
  });

  final Set<MapLegalStatus> statuses;
  final bool certifiedOnly;

  bool accepts(MapParcel parcel) =>
      statuses.contains(parcel.legalStatus) &&
      (!certifiedOnly || parcel.certified);

  MapFilter toggle(MapLegalStatus status) {
    final next = {...statuses};
    if (!next.remove(status)) next.add(status);
    return MapFilter(statuses: next, certifiedOnly: certifiedOnly);
  }

  MapFilter withCertifiedOnly(bool value) =>
      MapFilter(statuses: statuses, certifiedOnly: value);
}
