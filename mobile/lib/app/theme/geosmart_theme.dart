import 'package:flutter/material.dart';

/// Jetons du design system GeoSmart Field v1.0, themes "terrain jour" et
/// "nuit". Le module terrain les utilise pour toutes ses interfaces.
class GeoSmartColors {
  const GeoSmartColors._({
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
    required this.onAccent,
    required this.accentSoft,
    required this.success,
    required this.successSoft,
    required this.warning,
    required this.warningSoft,
    required this.danger,
    required this.dangerSoft,
  });

  final Color bg;
  final Color surface;
  final Color surfaceSunken;
  final Color border;
  final Color borderStrong;
  final Color text;
  final Color textMuted;
  final Color primary;
  final Color onPrimary;
  final Color primarySoft;
  final Color accent;
  final Color onAccent;
  final Color accentSoft;
  final Color success;
  final Color successSoft;
  final Color warning;
  final Color warningSoft;
  final Color danger;
  final Color dangerSoft;

  /// Qualite GNSS, toujours montree avec un mot et une pastille.
  Color get fixFixed => success;
  Color get fixFloat => warning;
  Color get fixAuto => danger;
  Color get fixInvalid => danger;

  static const light = GeoSmartColors._(
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
    onAccent: Color(0xFFFFFFFF),
    accentSoft: Color(0xFFFBE4D8),
    success: Color(0xFF17734B),
    successSoft: Color(0xFFDDF2E7),
    warning: Color(0xFF8F5D12),
    warningSoft: Color(0xFFFBEFD9),
    danger: Color(0xFFA8302A),
    dangerSoft: Color(0xFFFBE1DF),
  );

  static const dark = GeoSmartColors._(
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
    onAccent: Color(0xFF0E1A21),
    accentSoft: Color(0xFF4A2616),
    success: Color(0xFF3FBF85),
    successSoft: Color(0xFF123A2A),
    warning: Color(0xFFE7A94A),
    warningSoft: Color(0xFF3D2C10),
    danger: Color(0xFFF2726A),
    dangerSoft: Color(0xFF44191A),
  );

  static GeoSmartColors of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? dark : light;
}

/// Tailles, espacements, rayons et cibles tactiles du design system.
class GeoSmartDimens {
  const GeoSmartDimens._();

  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 20;
  static const double space6 = 24;
  static const double space8 = 32;
  static const double space10 = 40;
  static const double space12 = 48;
  static const double space16 = 64;

  static const double radiusSm = 6;
  static const double radiusMd = 10;
  static const double radiusLg = 16;
  static const double radiusXl = 24;
  static const double radiusPill = 999;

  static const double touchMin = 48;
  static const double touchField = 56;
  static const double fab = 64;
  static const double bottomNav = 72;
}

/// Styles de texte partages. Les polices Sora, Inter et IBM Plex Mono ne sont
/// pas encore dans les assets : le systeme prend le relais, avec une chasse
/// fixe pour les donnees techniques.
class GeoSmartText {
  const GeoSmartText._();

  static const String monoFont = 'monospace';

  static TextStyle _base(double size, double lineHeight, FontWeight weight) {
    return TextStyle(
      fontSize: size,
      height: lineHeight / size,
      fontWeight: weight,
    );
  }

  static TextStyle get display => _base(40, 48, FontWeight.w700);
  static TextStyle get h1 => _base(28, 36, FontWeight.w700);
  static TextStyle get h2 => _base(22, 30, FontWeight.w600);
  static TextStyle get h3 => _base(18, 26, FontWeight.w600);
  static TextStyle get kpi => _base(32, 38, FontWeight.w700);
  static TextStyle get bodyLg => _base(17, 26, FontWeight.w400);
  static TextStyle get body => _base(15, 22, FontWeight.w400);
  static TextStyle get bodyStrong => _base(15, 22, FontWeight.w600);
  static TextStyle get button => _base(16, 20, FontWeight.w600);
  static TextStyle get label => _base(13, 18, FontWeight.w600);
  static TextStyle get caption => _base(12, 16, FontWeight.w500);

  static TextStyle data(GeoSmartColors colors) => _base(
    14,
    20,
    FontWeight.w500,
  ).copyWith(fontFamily: monoFont, color: colors.text);

  static TextStyle dataSmall(GeoSmartColors colors) => _base(
    12,
    16,
    FontWeight.w500,
  ).copyWith(fontFamily: monoFont, color: colors.textMuted);
}

/// Themes clair et sombre de l'application.
class GeoSmartTheme {
  const GeoSmartTheme._();

  static ThemeData get light => _build(GeoSmartColors.light, Brightness.light);

  static ThemeData get dark => _build(GeoSmartColors.dark, Brightness.dark);

  static ThemeData _build(GeoSmartColors c, Brightness brightness) {
    final base = ThemeData(brightness: brightness, useMaterial3: true);
    final textTheme = base.textTheme
        .copyWith(
          displayLarge: GeoSmartText.display,
          headlineLarge: GeoSmartText.h1,
          headlineMedium: GeoSmartText.h2,
          headlineSmall: GeoSmartText.h3,
          bodyLarge: GeoSmartText.bodyLg,
          bodyMedium: GeoSmartText.body,
          labelLarge: GeoSmartText.button,
          labelMedium: GeoSmartText.label,
          labelSmall: GeoSmartText.caption,
        )
        .apply(bodyColor: c.text, displayColor: c.text);

    return base.copyWith(
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: c.primary,
        onPrimary: c.onPrimary,
        secondary: c.accent,
        onSecondary: c.onAccent,
        error: c.danger,
        onError: Colors.white,
        surface: c.surface,
        onSurface: c.text,
      ),
      scaffoldBackgroundColor: c.bg,
      textTheme: textTheme,
      dividerColor: c.border,
      appBarTheme: AppBarTheme(
        backgroundColor: c.surface,
        foregroundColor: c.text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 56,
        centerTitle: false,
        titleTextStyle: GeoSmartText.h2.copyWith(color: c.text),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.text,
        contentTextStyle: GeoSmartText.body.copyWith(color: c.bg),
        actionTextColor: c.accent,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.accent,
        linearTrackColor: c.surfaceSunken,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(
            GeoSmartDimens.touchMin,
            GeoSmartDimens.touchMin,
          ),
          textStyle: GeoSmartText.button,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(
            GeoSmartDimens.touchMin,
            GeoSmartDimens.touchMin,
          ),
          textStyle: GeoSmartText.button,
          foregroundColor: c.primary,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(
            GeoSmartDimens.touchMin,
            GeoSmartDimens.touchMin,
          ),
        ),
      ),
    );
  }
}
