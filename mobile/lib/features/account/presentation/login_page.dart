import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'viewmodels/auth_controller.dart';

/// Ecran de connexion (EF-401, EF-407). Le blocage apres cinq echecs est
/// affiche avec le message du serveur.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.auth});

  final AuthController auth;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    await widget.auth.login(
      phone: _phone.text.trim(),
      password: _password.text,
    );
    if (!mounted) return;
    setState(() => _busy = false);

    // Le changement de statut remplace la page d'accueil du MaterialApp, mais
    // la route du formulaire reste empilee : il faut la retirer pour voir la
    // coque connectee.
    if (widget.auth.status == AuthStatus.signedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Connexion reussie.')),
      );
      Navigator.of(context).pop();
      return;
    }
    final message = widget.auth.error;
    if (message != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Connexion',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
      ),
      body: ListenableBuilder(
        listenable: widget.auth,
        builder: (context, _) {
          return ListView(
            padding: const EdgeInsets.all(GeoSmartDimens.space4),
            children: [
              if (widget.auth.error != null) ...[
                Text(
                  widget.auth.error!,
                  style: GeoSmartText.body.copyWith(color: colors.danger),
                ),
                const SizedBox(height: GeoSmartDimens.space3),
              ],
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Numero de telephone',
                  hintText: '+228 90 00 00 00',
                ),
              ),
              const SizedBox(height: GeoSmartDimens.space3),
              TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Mot de passe'),
                onSubmitted: (_) => _busy ? null : _submit(),
              ),
              const SizedBox(height: GeoSmartDimens.space4),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Se connecter'),
              ),
            ],
          );
        },
      ),
    );
  }
}