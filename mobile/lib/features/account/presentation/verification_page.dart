import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'viewmodels/auth_controller.dart';

/// Saisie du code SMS recu apres l'inscription (EF-401). Le code est simule
/// dans le journal du serveur tant qu'il n'y a pas de fournisseur SMS.
class VerificationPage extends StatefulWidget {
  const VerificationPage({super.key, required this.auth});

  final AuthController auth;

  @override
  State<VerificationPage> createState() => _VerificationPageState();
}

class _VerificationPageState extends State<VerificationPage> {
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    await widget.auth.verifyCode(_code.text.trim());
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    final phone = widget.auth.pendingPhone ?? '';
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Code de verification',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
      ),
      body: ListenableBuilder(
        listenable: widget.auth,
        builder: (context, _) {
          if (widget.auth.status == AuthStatus.pendingApproval) {
            return ListView(
              padding: const EdgeInsets.all(GeoSmartDimens.space4),
              children: [
                Icon(
                  Icons.hourglass_top,
                  size: 48,
                  color: colors.warning,
                ),
                const SizedBox(height: GeoSmartDimens.space3),
                Text(
                  'Telephone verifie. Votre demande attend la validation '
                  "d'un administrateur avant la connexion.",
                  style: GeoSmartText.body.copyWith(color: colors.text),
                ),
                const SizedBox(height: GeoSmartDimens.space4),
                OutlinedButton(
                  onPressed: () => widget.auth.logout(),
                  child: const Text('Retour a la connexion'),
                ),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.all(GeoSmartDimens.space4),
            children: [
              Text(
                'Saisissez le code a 6 chiffres envoye au $phone.',
                style: GeoSmartText.body.copyWith(color: colors.textMuted),
              ),
              const SizedBox(height: GeoSmartDimens.space3),
              if (widget.auth.error != null) ...[
                Text(
                  widget.auth.error!,
                  style: GeoSmartText.body.copyWith(color: colors.danger),
                ),
                const SizedBox(height: GeoSmartDimens.space3),
              ],
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(labelText: 'Code SMS'),
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
                    : const Text('Verifier'),
              ),
            ],
          );
        },
      ),
    );
  }
}