import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'viewmodels/auth_controller.dart';

/// Ecran d'inscription (EF-401) : numero de telephone et mot de passe, puis
/// code SMS. Le code est simule dans le journal du serveur tant qu'il n'y a
/// pas de fournisseur SMS.
class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key, required this.auth});

  final AuthController auth;

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
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
    await widget.auth.register(
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
        title: Text(
          'Creer un compte',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
      ),
      body: ListenableBuilder(
        listenable: widget.auth,
        builder: (context, _) => ListView(
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
              decoration: const InputDecoration(
                labelText: 'Mot de passe',
                helperText: 'Au moins 8 caracteres.',
              ),
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
                  : const Text("S'inscrire"),
            ),
          ],
        ),
      ),
    );
  }
}
