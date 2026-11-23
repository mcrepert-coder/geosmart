import 'package:material_ui/material_ui.dart';

import '../domain/map_parcel.dart';

/// Couleur d'un statut juridique sur la carte : memes teintes que les badges
/// du foncier (jetons parcel-* du design system).
Color parcelStatusColor(MapLegalStatus status, {required bool dark}) =>
    switch (status) {
      MapLegalStatus.titre =>
        dark ? const Color(0xFF4CC3BB) : const Color(0xFF0B6D69),
      MapLegalStatus.coutumier =>
        dark ? const Color(0xFFD9AE5C) : const Color(0xFF7A5712),
      MapLegalStatus.litige =>
        dark ? const Color(0xFFF2726A) : const Color(0xFFA8302A),
      MapLegalStatus.inconnu => const Color(0xFF8496A1),
    };

/// Remplissage : plus leger pour une parcelle non certifiee, qui a aussi un
/// contour en tirets (voir ParcelMapPage).
Color parcelFillColor(MapParcel parcel, {required bool dark}) =>
    parcelStatusColor(
      parcel.legalStatus,
      dark: dark,
    ).withValues(alpha: parcel.certified ? 0.35 : 0.12);

/// Surface lisible : m2 sous un hectare, sinon hectares.
String formatArea(double? areaM2) {
  if (areaM2 == null) return 'Surface inconnue';
  if (areaM2 < 10000) return '${areaM2.toStringAsFixed(0)} m²';
  return '${(areaM2 / 10000).toStringAsFixed(2)} ha';
}
