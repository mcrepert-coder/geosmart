import 'package:flutter/material.dart';

import '../features/gnss/presentation/home_shell.dart';
import '../features/gnss/presentation/viewmodels/survey_controller.dart';
import '../features/gnss/presentation/viewmodels/theme_controller.dart';
import 'theme/geosmart_theme.dart';

/// Application GeoSmart Field (MVVM).
///
/// La composition est faite dans `main.dart` : la base locale, la mission et
/// la source GNSS sont injectees dans [SurveyController]. La coque d'accueil
/// separe la liste des missions et les parametres, ou l'operateur choisit le
/// theme applique a toutes les pages.
class GeoSmartApp extends StatefulWidget {
  const GeoSmartApp({
    super.key,
    required this.controller,
    this.themeController,
  });

  final SurveyController controller;

  /// Controleur de theme injecte par les tests. Par defaut, l'application en
  /// cree un sur le theme clair.
  final ThemeController? themeController;

  @override
  State<GeoSmartApp> createState() => _GeoSmartAppState();
}

class _GeoSmartAppState extends State<GeoSmartApp> {
  late final ThemeController _theme;
  late final bool _ownsTheme;

  @override
  void initState() {
    super.initState();
    _ownsTheme = widget.themeController == null;
    _theme = widget.themeController ?? ThemeController();
  }

  @override
  void dispose() {
    if (_ownsTheme) _theme.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _theme,
      builder: (context, _) => MaterialApp(
        title: 'GeoSmart Field',
        theme: GeoSmartTheme.light,
        darkTheme: GeoSmartTheme.dark,
        themeMode: _theme.mode,
        debugShowCheckedModeBanner: false,
        home: HomeShell(survey: widget.controller, theme: _theme),
      ),
    );
  }
}
