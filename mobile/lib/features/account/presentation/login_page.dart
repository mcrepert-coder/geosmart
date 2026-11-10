import 'package:flutter/material.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'register_page.dart';
import 'verification_page.dart';
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
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text('Connexion', style: GeoSmartText.h2.copyWith(color: colors.text)),
      ),
      body: ListenableBuilder(
        listenable: widget.auth,
        builder: (context, _) {
          // Apres inscription, le code SMS est demande (EF-401).
          if (widget.auth.status == AuthStatus.pendingVerification) {
            return VerificationPage(auth: widget.auth);
          }
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
              const SizedBox(height: GeoSmartDimens.space3),
              TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => RegisterPage(auth: widget.auth),
                  ),
                ),
                child: const Text('Creer un compte'),
              ),
            ],
          );
        },
      ),
    );
  }
}
