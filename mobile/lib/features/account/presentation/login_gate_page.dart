import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'login_page.dart';
import 'viewmodels/auth_controller.dart';

/// Ecran d'accueil de l'utilisateur non connecte (EF-401).
///
/// Un seul message et un seul bouton, centres : la connexion est la seule
/// action possible. Le formulaire complet est sur [LoginPage].
class LoginGatePage extends StatelessWidget {
  const LoginGatePage({super.key, required this.auth});

  final AuthController auth;

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Veuillez vous connecter',
              style: GeoSmartText.h2.copyWith(color: colors.text),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: GeoSmartDimens.space4),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => LoginPage(auth: auth),
                ),
              ),
              child: const Text('Connexion'),
            ),
          ],
        ),
      ),
    );
  }
}
