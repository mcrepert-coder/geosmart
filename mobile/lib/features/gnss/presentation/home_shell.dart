import 'package:flutter/material.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'missions_page.dart';
import 'settings_page.dart';
import 'viewmodels/survey_controller.dart';
import 'viewmodels/theme_controller.dart';

/// Coque de navigation de l'application.
///
/// La barre du bas separe l'accueil, a gauche, des parametres, a droite. La
/// liste des missions garde son etat quand l'operateur revient depuis les
/// parametres.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.survey, required this.theme});

  final SurveyController survey;
  final ThemeController theme;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          MissionsPage(survey: widget.survey),
          SettingsPage(theme: widget.theme),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (value) => setState(() => _index = value),
          backgroundColor: colors.surface,
          surfaceTintColor: Colors.transparent,
          indicatorColor: colors.primarySoft,
          elevation: 0,
          height: GeoSmartDimens.bottomNav,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: 'Accueil',
            ),
            NavigationDestination(
              icon: Icon(Icons.settings_outlined),
              selectedIcon: Icon(Icons.settings),
              label: 'Parametres',
            ),
          ],
        ),
      ),
    );
  }
}
