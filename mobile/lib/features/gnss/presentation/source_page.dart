import 'package:flutter/material.dart';

import '../../../app/theme/geosmart_theme.dart';
import '../data/datasources/native_gnss_source.dart';
import '../data/datasources/simulated_gnss_source.dart';
import '../domain/entities/gnss_device.dart';
import '../domain/repositories/gnss_position_source.dart';
import 'viewmodels/survey_controller.dart';

typedef GnssScan = Future<List<GnssDevice>> Function();
typedef GnssSourceBuilder = GnssPositionSource Function();
typedef GnssAddressSourceBuilder = GnssPositionSource Function(String address);

/// Ecran T2 : choix du recepteur GNSS et bascule de source a chaud (EF-105).
///
/// Les donnees simulees restent annoncees comme telles. Un recepteur reel
/// n'est propose que si le natif le trouve ou si l'operateur saisit son
/// adresse.
class GnssSourcePage extends StatefulWidget {
  const GnssSourcePage({
    super.key,
    required this.controller,
    this.scanDevices,
    this.simulatedSource,
    this.nativeSource,
  });

  final SurveyController controller;
  final GnssScan? scanDevices;
  final GnssSourceBuilder? simulatedSource;
  final GnssAddressSourceBuilder? nativeSource;

  @override
  State<GnssSourcePage> createState() => _GnssSourcePageState();
}

class _GnssSourcePageState extends State<GnssSourcePage> {
  final TextEditingController _address = TextEditingController();
  List<GnssDevice> _devices = const [];
  bool _scanning = false;
  String? _connectingAddress;
  String? _error;

  SurveyController get _controller => widget.controller;

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  Future<void> _scan() async {
    setState(() {
      _scanning = true;
      _error = null;
    });
    try {
      final devices =
          await (widget.scanDevices?.call() ?? NativeGnssSource().scan());
      if (!mounted) return;
      setState(() => _devices = devices);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Recherche Bluetooth impossible sur cet appareil.';
      });
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _useSimulation() async {
    setState(() {
      _connectingAddress = null;
      _error = null;
    });
    await _controller.switchSource(
      widget.simulatedSource?.call() ?? SimulatedGnssSource(),
    );
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _connect(String address) async {
    final normalized = address.trim().toUpperCase();
    if (!_isMacAddress(normalized)) {
      setState(() {
        _error = 'Adresse Bluetooth invalide, format AA:BB:CC:DD:EE:FF.';
      });
      return;
    }
    setState(() {
      _connectingAddress = normalized;
      _error = null;
    });
    final source =
        widget.nativeSource?.call(normalized) ??
        NativeGnssSource(initialAddress: normalized);
    await _controller.switchSource(source);
    if (mounted) Navigator.of(context).pop();
  }

  bool _isMacAddress(String value) {
    return RegExp(r'^([0-9A-F]{2}:){5}[0-9A-F]{2}$').hasMatch(value);
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
              'Recepteur GNSS',
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            Text(
              'Choisir la source de position',
              style: GeoSmartText.caption.copyWith(color: colors.textMuted),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(GeoSmartDimens.space4),
          children: [
            _CurrentSourceCard(controller: _controller, colors: colors),
            const SizedBox(height: GeoSmartDimens.space6),
            _SectionTitle(title: 'Simulation', colors: colors),
            const SizedBox(height: GeoSmartDimens.space2),
            _SimulationCard(colors: colors, onUse: _useSimulation),
            const SizedBox(height: GeoSmartDimens.space6),
            _SectionTitle(title: 'Recepteur Bluetooth', colors: colors),
            const SizedBox(height: GeoSmartDimens.space2),
            _ScanCard(colors: colors, scanning: _scanning, onScan: _scan),
            if (_error != null) ...[
              const SizedBox(height: GeoSmartDimens.space2),
              _InlineError(message: _error!, colors: colors),
            ],
            if (_devices.isNotEmpty) ...[
              const SizedBox(height: GeoSmartDimens.space3),
              for (final device in _devices)
                Padding(
                  padding: const EdgeInsets.only(bottom: GeoSmartDimens.space2),
                  child: _DeviceTile(
                    device: device,
                    colors: colors,
                    busy: _connectingAddress == device.address,
                    onTap: () => _connect(device.address),
                  ),
                ),
            ] else if (!_scanning) ...[
              const SizedBox(height: GeoSmartDimens.space3),
              _EmptyDevices(colors: colors),
            ],
            const SizedBox(height: GeoSmartDimens.space6),
            _SectionTitle(title: 'Adresse manuelle', colors: colors),
            const SizedBox(height: GeoSmartDimens.space2),
            _ManualAddressCard(
              colors: colors,
              controller: _address,
              busy: _connectingAddress == _address.text.trim().toUpperCase(),
              onConnect: () => _connect(_address.text),
            ),
          ],
        ),
      ),
    );
  }
}

class _CurrentSourceCard extends StatelessWidget {
  const _CurrentSourceCard({required this.controller, required this.colors});

  final SurveyController controller;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    final simulation = controller.isSimulation;
    final connected = controller.hasConnection;
    final color = simulation
        ? colors.warning
        : connected
        ? colors.success
        : colors.textMuted;
    final background = simulation
        ? colors.warningSoft
        : connected
        ? colors.successSoft
        : colors.surfaceSunken;
    final label = simulation
        ? 'Simulation Dart'
        : connected
        ? 'Recepteur Bluetooth connecte'
        : 'Recepteur Bluetooth en attente';
    final detail = simulation
        ? 'Positions simulees, aucune precision RTK annoncee.'
        : connected
        ? 'Flux NMEA actif.'
        : 'Aucune position recue pour le moment.';

    return Container(
      padding: const EdgeInsets.all(GeoSmartDimens.space4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(
            simulation ? Icons.science_outlined : Icons.sensors,
            color: color,
            size: 22,
          ),
          const SizedBox(width: GeoSmartDimens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: GeoSmartText.h3.copyWith(color: color)),
                Text(
                  detail,
                  style: GeoSmartText.caption.copyWith(color: color),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SimulationCard extends StatelessWidget {
  const _SimulationCard({required this.colors, required this.onUse});

  final GeoSmartColors colors;
  final VoidCallback onUse;

  @override
  Widget build(BuildContext context) {
    return _Card(
      colors: colors,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tester sans recepteur',
            style: GeoSmartText.bodyStrong.copyWith(color: colors.text),
          ),
          const SizedBox(height: GeoSmartDimens.space1),
          Text(
            'La simulation produit une position toutes les secondes et passe '
            'en RTK Fixed apres trois epoques. Les donnees restent simulees.',
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          SizedBox(
            width: double.infinity,
            height: GeoSmartDimens.touchMin,
            child: FilledButton(
              onPressed: onUse,
              style: FilledButton.styleFrom(
                backgroundColor: colors.primary,
                foregroundColor: colors.onPrimary,
                textStyle: GeoSmartText.button,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
                ),
              ),
              child: const Text('Utiliser la simulation'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScanCard extends StatelessWidget {
  const _ScanCard({
    required this.colors,
    required this.scanning,
    required this.onScan,
  });

  final GeoSmartColors colors;
  final bool scanning;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return _Card(
      colors: colors,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Appareils appaires et a proximite',
            style: GeoSmartText.bodyStrong.copyWith(color: colors.text),
          ),
          const SizedBox(height: GeoSmartDimens.space1),
          Text(
            'La recherche dure environ huit secondes. Autorisez le Bluetooth '
            'quand Android le demande.',
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          SizedBox(
            width: double.infinity,
            height: GeoSmartDimens.touchMin,
            child: FilledButton(
              onPressed: scanning ? null : onScan,
              style: FilledButton.styleFrom(
                backgroundColor: colors.primarySoft,
                foregroundColor: colors.primary,
                disabledBackgroundColor: colors.surfaceSunken,
                disabledForegroundColor: colors.textMuted,
                textStyle: GeoSmartText.button,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
                ),
              ),
              child: Text(
                scanning ? 'Recherche en cours...' : 'Rechercher un recepteur',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DeviceTile extends StatelessWidget {
  const _DeviceTile({
    required this.device,
    required this.colors,
    required this.busy,
    required this.onTap,
  });

  final GnssDevice device;
  final GeoSmartColors colors;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
        side: BorderSide(color: colors.border),
      ),
      child: InkWell(
        onTap: busy ? null : onTap,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
        child: Padding(
          padding: const EdgeInsets.all(GeoSmartDimens.space3),
          child: Row(
            children: [
              Icon(Icons.bluetooth, color: colors.primary),
              const SizedBox(width: GeoSmartDimens.space3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      device.name,
                      style: GeoSmartText.bodyStrong.copyWith(
                        color: colors.text,
                      ),
                    ),
                    Text(device.address, style: GeoSmartText.dataSmall(colors)),
                  ],
                ),
              ),
              if (device.isBonded)
                _Chip(
                  label: 'Appaire',
                  color: colors.success,
                  background: colors.successSoft,
                ),
              const SizedBox(width: GeoSmartDimens.space2),
              if (busy)
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.primary,
                  ),
                )
              else
                Icon(Icons.chevron_right, color: colors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _ManualAddressCard extends StatelessWidget {
  const _ManualAddressCard({
    required this.colors,
    required this.controller,
    required this.busy,
    required this.onConnect,
  });

  final GeoSmartColors colors;
  final TextEditingController controller;
  final bool busy;
  final VoidCallback onConnect;

  @override
  Widget build(BuildContext context) {
    return _Card(
      colors: colors,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Adresse MAC du recepteur',
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          const SizedBox(height: GeoSmartDimens.space1),
          TextField(
            controller: controller,
            textCapitalization: TextCapitalization.characters,
            style: GeoSmartText.data(colors),
            decoration: InputDecoration(
              hintText: 'AA:BB:CC:DD:EE:FF',
              hintStyle: GeoSmartText.dataSmall(colors),
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
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
                borderSide: BorderSide(color: colors.primary, width: 2),
              ),
            ),
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          SizedBox(
            width: double.infinity,
            height: GeoSmartDimens.touchMin,
            child: FilledButton(
              onPressed: busy ? null : onConnect,
              style: FilledButton.styleFrom(
                backgroundColor: colors.primary,
                foregroundColor: colors.onPrimary,
                disabledBackgroundColor: colors.surfaceSunken,
                disabledForegroundColor: colors.textMuted,
                textStyle: GeoSmartText.button,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
                ),
              ),
              child: Text(busy ? 'Connexion...' : 'Connecter ce recepteur'),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyDevices extends StatelessWidget {
  const _EmptyDevices({required this.colors});

  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(GeoSmartDimens.space4),
      decoration: BoxDecoration(
        color: colors.surfaceSunken,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        border: Border.all(color: colors.border),
      ),
      child: Text(
        'Aucun recepteur detecte. Verifiez l appairage Android ou saisissez '
        'son adresse MAC.',
        style: GeoSmartText.caption.copyWith(color: colors.textMuted),
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

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.colors});

  final String title;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Text(title, style: GeoSmartText.h3.copyWith(color: colors.text));
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.colors, required this.child});

  final GeoSmartColors colors;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(GeoSmartDimens.space4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        border: Border.all(color: colors.border),
      ),
      child: child,
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.color,
    required this.background,
  });

  final String label;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: GeoSmartDimens.space2,
        vertical: GeoSmartDimens.space1,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusSm),
      ),
      child: Text(label, style: GeoSmartText.caption.copyWith(color: color)),
    );
  }
}
