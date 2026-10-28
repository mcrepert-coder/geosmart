import 'package:flutter/material.dart';

/// Jetons du design system GeoSmart Field v1.0 utilises par le module
/// foncier. A remplacer par le theme commun de l'application quand il existera
/// (app/geosmart_app.dart).
class LandColors {
  const LandColors._({
    required this.bg,
    required this.surface,
    required this.surfaceSunken,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textMuted,
    required this.primary,
    required this.onPrimary,
    required this.primarySoft,
    required this.accent,
    required this.accentSoft,
    required this.success,
    required this.successSoft,
    required this.warning,
    required this.danger,
    required this.dangerSoft,
    required this.mapLand,
  });

  final Color bg, surface, surfaceSunken, border, borderStrong, text, textMuted;
  final Color primary, onPrimary, primarySoft, accent, accentSoft;
  final Color success, successSoft, warning, danger, dangerSoft, mapLand;

  static const light = LandColors._(
    bg: Color(0xFFF5F8FA),
    surface: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFEEF5F8),
    border: Color(0xFFD5DEE3),
    borderStrong: Color(0xFF8496A1),
    text: Color(0xFF1B2A33),
    textMuted: Color(0xFF5B6B75),
    primary: Color(0xFF115471),
    onPrimary: Color(0xFFFFFFFF),
    primarySoft: Color(0xFFDCEBF2),
    accent: Color(0xFFB4512A),
    accentSoft: Color(0xFFFBE4D8),
    success: Color(0xFF17734B),
    successSoft: Color(0xFFDDF2E7),
    warning: Color(0xFF8F5D12),
    danger: Color(0xFFA8302A),
    dangerSoft: Color(0xFFFBE1DF),
    mapLand: Color(0xFFE9EEE6),
  );

  static const dark = LandColors._(
    bg: Color(0xFF0E1A21),
    surface: Color(0xFF162630),
    surfaceSunken: Color(0xFF0A141A),
    border: Color(0xFF2A3F4C),
    borderStrong: Color(0xFF5E7684),
    text: Color(0xFFE8EEF2),
    textMuted: Color(0xFF9AAAB4),
    primary: Color(0xFF7FB8D4),
    onPrimary: Color(0xFF0E1A21),
    primarySoft: Color(0xFF173B4D),
    accent: Color(0xFFF08A5D),
    accentSoft: Color(0xFF4A2616),
    success: Color(0xFF3FBF85),
    successSoft: Color(0xFF123A2A),
    warning: Color(0xFFE7A94A),
    danger: Color(0xFFF2726A),
    dangerSoft: Color(0xFF44191A),
    mapLand: Color(0xFF16222A),
  );

  static LandColors of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? dark : light;
}

/// Police des donnees (coordonnees, identifiants). IBM Plex Mono quand le
/// socle commun l'embarquera ; police a chasse fixe du systeme en attendant.
const String landMonoFont = 'monospace';

const _nbsp = ' ';

String _frNumber(double value, int decimals) {
  final parts = value.toStringAsFixed(decimals).split('.');
  final grouped = parts[0].replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => _nbsp,
  );
  return parts.length > 1 ? '$grouped,${parts[1]}' : grouped;
}

/// 452,18 m2 ; au-dela de 10 000 m2 on ajoute ha, a, ca.
String formatArea(double m2) {
  final base = '${_frNumber(m2, 2)}${_nbsp}m²';
  if (m2 <= 10000) return base;
  final total = m2.round();
  return '$base (${total ~/ 10000}${_nbsp}ha ${(total % 10000) ~/ 100}${_nbsp}a ${total % 100}${_nbsp}ca)';
}

String formatMeters(double m) => '${_frNumber(m, 2)}${_nbsp}m';

/// Coordonnees UTM 31N, 2 decimales.
String formatUtm(double easting, double northing) =>
    '${_frNumber(easting, 2)} · ${_frNumber(northing, 2)}';

String _two(int n) => n.toString().padLeft(2, '0');

/// 24/10/2026, heure de Lome (UTC+0).
String formatDate(DateTime d) {
  final u = d.toUtc();
  return '${_two(u.day)}/${_two(u.month)}/${u.year}';
}

/// 24/10/2026 a 09:42.
String formatDateTime(DateTime d) {
  final u = d.toUtc();
  return '${formatDate(u)} à ${_two(u.hour)}:${_two(u.minute)}';
}

/// Date seule du contrat (AAAA-MM-JJ) vers JJ/MM/AAAA.
String formatPlainDate(String value) {
  final p = value.split('-');
  return p.length == 3 ? '${p[2]}/${p[1]}/${p[0]}' : value;
}
