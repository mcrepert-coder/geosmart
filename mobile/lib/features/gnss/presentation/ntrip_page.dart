import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../../app/theme/geosmart_theme.dart';
import '../domain/entities/ntrip_caster.dart';
import '../infrastructure/method_channel_caster_credential_store.dart';
import 'viewmodels/ntrip_controller.dart';

/// Ecran de configuration du client NTRIP (EF-104).
///
/// Le mot de passe part vers le stockage natif chiffre. L'ecran ne transporte
/// jamais les octets RTCM lui-meme : le ViewModel pilote la connexion.
class NtripPage extends StatefulWidget {
  const NtripPage({super.key, this.controller});

  final NtripController? controller;

  @override
  State<NtripPage> createState() => _NtripPageState();
}

class _NtripPageState extends State<NtripPage> {
  late final NtripController _controller;
  late final bool _ownsController;
  final _host = TextEditingController();
  final _port = TextEditingController(text: '2101');
  final _mountpoint = TextEditingController();
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _useTls = false;
  bool _obscure = true;
  bool _loaded = false;
  String? _formError;

  @override
  void initState() {
    super.initState();
    _ownsController = widget.controller == null;
    _controller =
        widget.controller ??
        NtripController(credentials: MethodChannelCasterCredentialStore());
    _controller.addListener(_onChanged);
    _loadSaved();
  }

  @override
  void dispose() {
    _controller.removeListener(_onChanged);
    if (_ownsController) _controller.dispose();
    _host.dispose();
    _port.dispose();
    _mountpoint.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _loadSaved() async {
    await _controller.loadSaved();
    if (!mounted) return;
    final caster = _controller.caster;
    if (caster != null) {
      _host.text = caster.host;
      _port.text = caster.port.toString();
      _mountpoint.text = caster.mountpoint;
      _username.text = caster.username;
      _password.text = caster.password;
      _useTls = caster.useTls;
    }
    setState(() => _loaded = true);
  }

  Future<void> _connect() async {
    final host = _host.text.trim();
    final mountpoint = _mountpoint.text.trim();
    final port = int.tryParse(_port.text.trim());
    if (host.isEmpty) {
      setState(() => _formError = 'Le serveur NTRIP est obligatoire.');
      return;
    }
    if (port == null || port < 1 || port > 65535) {
      setState(
        () => _formError = 'Le port doit etre compris entre 1 et 65535.',
      );
      return;
    }
    if (mountpoint.isEmpty) {
      setState(() => _formError = 'Le mountpoint est obligatoire.');
      return;
    }
    if (_username.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _formError = 'Identifiant et mot de passe obligatoires.');
      return;
    }

    setState(() => _formError = null);
    final connected = await _controller.connect(
      NtripCaster(
        host: host,
        port: port,
        mountpoint: mountpoint,
        username: _username.text.trim(),
        password: _password.text,
        useTls: _useTls,
      ),
    );
    if (!connected && mounted) {
      setState(() {
        _formError = _controller.error ?? 'Connexion NTRIP impossible.';
      });
    }
  }

  Future<void> _disconnect() => _controller.disconnect();

  Future<void> _forget() async {
    await _controller.forget();
    if (!mounted) return;
    _host.clear();
    _port.text = '2101';
    _mountpoint.clear();
    _username.clear();
    _password.clear();
    setState(() {
      _useTls = false;
      _formError = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Corrections NTRIP',
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            Text(
              'RTCM 3.x par internet',
              style: GeoSmartText.caption.copyWith(color: colors.textMuted),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(GeoSmartDimens.space4),
          children: [
            _StatusCard(controller: _controller, colors: colors),
            const SizedBox(height: GeoSmartDimens.space4),
            _FormCard(
              colors: colors,
              host: _host,
              port: _port,
              mountpoint: _mountpoint,
              username: _username,
              password: _password,
              obscure: _obscure,
              useTls: _useTls,
              enabled: !_controller.isBusy && !_controller.isStreaming,
              onToggleObscure: () => setState(() => _obscure = !_obscure),
              onTlsChanged: (value) => setState(() => _useTls = value),
            ),
            if (_formError != null) ...[
              const SizedBox(height: GeoSmartDimens.space2),
              _InlineError(message: _formError!, colors: colors),
            ],
            const SizedBox(height: GeoSmartDimens.space4),
            _Actions(
              controller: _controller,
              colors: colors,
              loaded: _loaded,
              onConnect: _connect,
              onDisconnect: _disconnect,
              onForget: _forget,
            ),
            const SizedBox(height: GeoSmartDimens.space4),
            _SecurityNote(colors: colors),
          ],
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.controller, required this.colors});

  final NtripController controller;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    final (color, background) = switch (controller.status) {
      NtripStatus.streaming => (colors.success, colors.successSoft),
      NtripStatus.connecting => (colors.warning, colors.warningSoft),
      NtripStatus.error => (colors.danger, colors.dangerSoft),
      NtripStatus.idle => (colors.textMuted, colors.surfaceSunken),
    };
    // Le bandeau affiche toujours une phrase simple en francais. Le detail
    // technique de l'erreur reste disponible dans le formulaire.
    final detail = _detail(controller.status);

    return Container(
      padding: const EdgeInsets.all(GeoSmartDimens.space4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: GeoSmartDimens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  controller.status.label,
                  style: GeoSmartText.h3.copyWith(color: color),
                ),
                Text(
                  detail,
                  style: GeoSmartText.caption.copyWith(color: color),
                ),
              ],
            ),
          ),
          if (controller.isBusy)
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: color),
            ),
        ],
      ),
    );
  }

  String _detail(NtripStatus status) {
    return switch (status) {
      NtripStatus.streaming =>
        'Les corrections RTCM sont recues et envoyees au recepteur.',
      NtripStatus.connecting => 'Connexion au caster en cours.',
      NtripStatus.error =>
        'La connexion a echoue. Une nouvelle tentative est lancee '
            'automatiquement.',
      NtripStatus.idle =>
        'Aucune correction RTCM recue. Renseignez le caster puis '
            'connectez-vous.',
    };
  }
}

class _FormCard extends StatelessWidget {
  const _FormCard({
    required this.colors,
    required this.host,
    required this.port,
    required this.mountpoint,
    required this.username,
    required this.password,
    required this.obscure,
    required this.useTls,
    required this.enabled,
    required this.onToggleObscure,
    required this.onTlsChanged,
  });

  final GeoSmartColors colors;
  final TextEditingController host;
  final TextEditingController port;
  final TextEditingController mountpoint;
  final TextEditingController username;
  final TextEditingController password;
  final bool obscure;
  final bool useTls;
  final bool enabled;
  final VoidCallback onToggleObscure;
  final ValueChanged<bool> onTlsChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(GeoSmartDimens.space4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _field(
            label: 'Serveur',
            controller: host,
            hint: 'caster.ntrip.example',
            enabled: enabled,
            keyboardType: TextInputType.url,
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _field(
                  label: 'Port',
                  controller: port,
                  hint: '2101',
                  enabled: enabled,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
              ),
              const SizedBox(width: GeoSmartDimens.space3),
              Expanded(
                flex: 2,
                child: _field(
                  label: 'Mountpoint',
                  controller: mountpoint,
                  hint: 'RTK31N',
                  enabled: enabled,
                ),
              ),
            ],
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          _field(
            label: 'Identifiant',
            controller: username,
            hint: 'operateur',
            enabled: enabled,
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          _field(
            label: 'Mot de passe',
            controller: password,
            hint: '********',
            enabled: enabled,
            obscure: obscure,
            suffix: IconButton(
              tooltip: obscure
                  ? 'Afficher le mot de passe'
                  : 'Masquer le mot de passe',
              onPressed: onToggleObscure,
              icon: Icon(
                obscure
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
                color: colors.textMuted,
              ),
            ),
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Connexion TLS',
                      style: GeoSmartText.bodyStrong.copyWith(
                        color: colors.text,
                      ),
                    ),
                    Text(
                      'Chiffre le transport vers le caster.',
                      style: GeoSmartText.caption.copyWith(
                        color: colors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Switch(
                value: useTls,
                onChanged: enabled ? onTlsChanged : null,
                activeThumbColor: colors.onPrimary,
                activeTrackColor: colors.primary,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _field({
    required String label,
    required TextEditingController controller,
    required String hint,
    required bool enabled,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    bool obscure = false,
    Widget? suffix,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GeoSmartText.caption.copyWith(color: colors.textMuted),
        ),
        const SizedBox(height: GeoSmartDimens.space1),
        TextField(
          controller: controller,
          enabled: enabled,
          obscureText: obscure,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          style: GeoSmartText.data(colors),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: GeoSmartText.dataSmall(colors),
            suffixIcon: suffix,
            filled: true,
            fillColor: colors.surfaceSunken,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: GeoSmartDimens.space3,
              vertical: GeoSmartDimens.space3,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
              borderSide: BorderSide(color: colors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
              borderSide: BorderSide(color: colors.border),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
              borderSide: BorderSide(color: colors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
              borderSide: BorderSide(color: colors.primary, width: 2),
            ),
          ),
        ),
      ],
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({
    required this.controller,
    required this.colors,
    required this.loaded,
    required this.onConnect,
    required this.onDisconnect,
    required this.onForget,
  });

  final NtripController controller;
  final GeoSmartColors colors;
  final bool loaded;
  final VoidCallback onConnect;
  final VoidCallback onDisconnect;
  final VoidCallback onForget;

  @override
  Widget build(BuildContext context) {
    final streaming = controller.isStreaming;
    final busy = controller.isBusy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: GeoSmartDimens.touchField,
          child: FilledButton(
            onPressed: busy || !loaded
                ? null
                : streaming
                ? onDisconnect
                : onConnect,
            style: FilledButton.styleFrom(
              backgroundColor: streaming ? colors.danger : colors.accent,
              foregroundColor: streaming ? Colors.white : colors.onAccent,
              disabledBackgroundColor: colors.surfaceSunken,
              disabledForegroundColor: colors.textMuted,
              textStyle: GeoSmartText.button,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
              ),
            ),
            child: Text(
              streaming
                  ? 'Deconnecter'
                  : busy
                  ? 'Connexion en cours...'
                  : 'Connecter',
            ),
          ),
        ),
        const SizedBox(height: GeoSmartDimens.space2),
        TextButton(
          onPressed: busy ? null : onForget,
          child: const Text('Oublier la configuration'),
        ),
      ],
    );
  }
}

class _SecurityNote extends StatelessWidget {
  const _SecurityNote({required this.colors});

  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(GeoSmartDimens.space3),
      decoration: BoxDecoration(
        color: colors.primarySoft,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.lock_outline, size: 18, color: colors.primary),
          const SizedBox(width: GeoSmartDimens.space2),
          Expanded(
            child: Text(
              'Le mot de passe est conserve par le stockage securise de '
              'l appareil. Les corrections RTCM passent par le recepteur '
              'Bluetooth, jamais par un stockage en clair.',
              style: GeoSmartText.caption.copyWith(color: colors.primary),
            ),
          ),
        ],
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.colors});

  final String message;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(GeoSmartDimens.space3),
      decoration: BoxDecoration(
        color: colors.dangerSoft,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
        border: Border.all(color: colors.danger.withValues(alpha: 0.35)),
      ),
      child: Text(
        message,
        style: GeoSmartText.caption.copyWith(color: colors.danger),
      ),
    );
  }
}
