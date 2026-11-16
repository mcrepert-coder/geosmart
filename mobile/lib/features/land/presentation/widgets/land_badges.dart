import 'package:material_ui/material_ui.dart';

import '../land_style.dart';

/// Couleurs des statuts juridiques (jetons parcel-* du design system).
({String label, Color fg, Color bg}) _status(String legalStatus, bool dark) =>
    switch (legalStatus) {
      'TITRE' => (
        label: 'Titré',
        fg: dark ? const Color(0xFF4CC3BB) : const Color(0xFF0B6D69),
        bg: dark ? const Color(0xFF123634) : const Color(0xFFDDF3F1),
      ),
      'COUTUMIER_NON_TITRE' => (
        label: 'Coutumier non titré',
        fg: dark ? const Color(0xFFD9AE5C) : const Color(0xFF7A5712),
        bg: dark ? const Color(0xFF38290F) : const Color(0xFFF6ECD6),
      ),
      'EN_LITIGE' => (
        label: 'En litige',
        fg: dark ? const Color(0xFFF2726A) : const Color(0xFFA8302A),
        bg: dark ? const Color(0xFF44191A) : const Color(0xFFFBE1DF),
      ),
      _ => (
        label: 'Statut non renseigné',
        fg: const Color(0xFF8496A1),
        bg: Colors.transparent,
      ),
    };

/// ParcelStatus : le statut est toujours ecrit ; le litige porte un contour.
class LegalStatusBadge extends StatelessWidget {
  const LegalStatusBadge({super.key, required this.legalStatus});

  final String legalStatus;

  @override
  Widget build(BuildContext context) {
    final s = _status(
      legalStatus,
      Theme.of(context).brightness == Brightness.dark,
    );
    final outlined = legalStatus == 'EN_LITIGE' || legalStatus == 'INCONNU';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: s.bg,
        borderRadius: BorderRadius.circular(999),
        border: outlined ? Border.all(color: s.fg) : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: s.fg, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            s.label,
            style: TextStyle(
              color: s.fg,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// CertBadge : seulement ce que le serveur confirme ; "non certifiée" en clair.
class CertificationBadge extends StatelessWidget {
  const CertificationBadge({super.key, required this.certified});

  final bool certified;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: certified ? colors.primarySoft : Colors.transparent,
        borderRadius: BorderRadius.circular(999),
        border: certified ? null : Border.all(color: colors.borderStrong),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (certified) ...[
            Icon(Icons.verified_outlined, size: 16, color: colors.primary),
            const SizedBox(width: 4),
          ],
          Text(
            certified ? 'Parcelle certifiée' : 'Non certifiée',
            style: TextStyle(
              color: certified ? colors.primary : colors.textMuted,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// gs-notice : mention obligatoire (RG-09), jamais abregee.
class LandNotice extends StatelessWidget {
  const LandNotice({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        border: Border.all(color: colors.text, width: 1.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_outlined, size: 16, color: colors.text),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
                color: colors.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
