import 'package:material_ui/material_ui.dart';

/// Choix du theme applique a toute l'application.
///
/// Le theme clair est le defaut : l'application ne passe jamais en sombre
/// sans une action explicite de l'operateur depuis les parametres.
class ThemeController extends ChangeNotifier {
  ThemeController({ThemeMode initialMode = ThemeMode.light})
    : _mode = initialMode;

  ThemeMode _mode;

  ThemeMode get mode => _mode;

  bool get isDark => _mode == ThemeMode.dark;

  void setMode(ThemeMode mode) {
    if (mode == _mode) return;
    _mode = mode;
    notifyListeners();
  }

  void selectLight() => setMode(ThemeMode.light);

  void selectDark() => setMode(ThemeMode.dark);

  void toggle() => setMode(isDark ? ThemeMode.light : ThemeMode.dark);
}
