import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../../app/format/geosmart_formats.dart';
import '../../../app/theme/geosmart_theme.dart';
import '../domain/entities/gnss_fix_quality.dart';
import '../domain/entities/gnss_position.dart';
import '../domain/entities/survey_point.dart';
import '../domain/entities/survey_session_status.dart';
import '../domain/repositories/sync_queue_store.dart';
import '../domain/services/survey_measurements.dart';
import '../domain/services/utm31n.dart';
import 'ntrip_page.dart';
import 'source_page.dart';
import 'viewmodels/ntrip_controller.dart';
import 'viewmodels/survey_controller.dart';

/// Ecran de mesure T3 (RTK Fixed) et T4 (RTK Float, theme nuit).
///
/// Vue MVVM : tout l'etat et les regles viennent de [SurveyController]. Cet
/// ecran ne fait qu'afficher et relayer les actions.
class GnssPage extends StatefulWidget {
  const GnssPage({
    super.key,
    required this.controller,
    this.animateQuality = true,
    this.ntripController,
  });

  final SurveyController controller;

  /// Clignotement de la pastille tant que la qualite n'est pas Fixed.
  /// Desactive dans les tests pour eviter une animation sans fin.
  final bool animateQuality;

  /// ViewModel NTRIP injecte par les tests ou par la composition.
  final NtripController? ntripController;

  @override
  State<GnssPage> createState() => _GnssPageState();
}

class _GnssPageState extends State<GnssPage> with WidgetsBindingObserver {
  late final StreamSubscription<SurveyEvent> _events;
  GnssFixQuality? _lastQuality;

  SurveyController get _controller => widget.controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _lastQuality = _controller.position?.fixQuality;
    _controller.addListener(_onControllerChanged);
    _events = _controller.events.listen(_onEvent);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.removeListener(_onControllerChanged);
    unawaited(_events.cancel());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_controller.refreshBluetoothState());
    }
  }

  void _onControllerChanged() {
    final quality = _controller.position?.fixQuality;
    if (quality == GnssFixQuality.fixed &&
        _lastQuality != GnssFixQuality.fixed) {
      // Double vibration au passage en RTK Fixed (maquette T3).
      HapticFeedback.heavyImpact();
      HapticFeedback.heavyImpact();
    }
    _lastQuality = quality;
    if (mounted) setState(() {});
  }

  /// Duree maximale d'un message en bas de l'ecran.
  static const _toastDuration = Duration(seconds: 3);

  /// Remplace le message courant pour eviter qu'une file de messages ne
  /// s'accumule, puis le referme automatiquement apres [_toastDuration].
  void _showToast(String message, {SnackBarAction? action}) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        action: action,
        duration: _toastDuration,
        persist: false,
      ),
    );
  }

  void _onEvent(SurveyEvent event) {
    if (!mounted) return;
    switch (event) {
      case PointRecorded(:final point):
        _showToast(
          "Borne ${point.pointName} enregistree sur l'appareil",
          action: SnackBarAction(
            label: 'Annuler',
            onPressed: () => unawaited(_controller.undoPoint(point.id)),
          ),
        );
      case PointUpdated(:final point):
        _showToast('Borne ${point.pointName} remise a jour sur l\'appareil');
      case PointDeleted(:final point):
        _showToast('Borne ${point.pointName} supprimee de la mission');
      case MeasurementCancelled(:final reason):
        _showToast(reason);
      case SurveyError(:final message):
        _showToast(message);
      case MissionCompleted(:final session):
        _showToast(
          'Mission terminee : perimetre '
          '${formatDecimal(session.perimeterMeters ?? 0)} m, surface '
          '${formatDecimal(session.areaSquareMeters ?? 0)} m2.',
        );
      case SyncFinished(:final result):
        _showToast(
          result.sent > 0
              ? '${result.sent} mission(s) envoyee(s).'
              : result.hasFailures
              ? 'Envoi impossible, la mission reste sur l\'appareil.'
              : 'Aucune mission en attente.',
        );
      case SyncUnavailable(:final message):
        _showToast(message);
    }
  }

  Future<void> _openSourcePage() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GnssSourcePage(controller: _controller),
      ),
    );
  }

  Future<void> _openNtripPage() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => NtripPage(controller: widget.ntripController),
      ),
    );
  }

  Future<void> _confirmFinish() async {
    final points = _controller.points;
    if (points.length < 3) return;
    final preview = SurveyMeasurements.fromPoints(points);
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GeoSmartColors.of(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(GeoSmartDimens.radiusLg),
        ),
      ),
      builder: (_) =>
          _FinishMissionSheet(preview: preview, pointsCount: points.length),
    );
    if (confirmed == true) await _controller.finishMission();
  }

  Future<void> _confirmDeletePoint(SurveyPoint point) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Supprimer la borne ${point.pointName} ?'),
        content: const Text('La borne sera retiree de la mission locale.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirmed == true) await _controller.deletePoint(point.id);
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              "Mesure d'une borne",
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            Text(
              _controller.session?.title ?? 'Mission locale',
              style: GeoSmartText.caption.copyWith(color: colors.textMuted),
            ),
          ],
        ),
        actions: [
          if (_controller.session?.canSync ?? false)
            IconButton(
              tooltip: 'Synchroniser la mission',
              icon: const Icon(Icons.cloud_upload_outlined),
              onPressed: _controller.isSyncing
                  ? null
                  : _controller.syncCurrentMission,
            ),
          IconButton(
            tooltip: 'Choisir le recepteur',
            icon: const Icon(Icons.sensors_outlined),
            onPressed: _openSourcePage,
          ),
          IconButton(
            tooltip: 'Corrections NTRIP',
            icon: const Icon(Icons.satellite_alt_outlined),
            onPressed: _openNtripPage,
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_controller.bluetoothDisabled)
              _BluetoothBanner(
                colors: colors,
                onRefresh: () => unawaited(_controller.refreshBluetoothState()),
              ),
            if (_controller.isSimulation) _SimulationBanner(colors: colors),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(GeoSmartDimens.space4),
                children: [
                  _QualityBanner(
                    position: _controller.position,
                    colors: colors,
                    animate: widget.animateQuality,
                  ),
                  const SizedBox(height: GeoSmartDimens.space3),
                  _MetricsGrid(position: _controller.position, colors: colors),
                  const SizedBox(height: GeoSmartDimens.space3),
                  _CoordinatesCard(
                    position: _controller.position,
                    colors: colors,
                  ),
                  const SizedBox(height: GeoSmartDimens.space6),
                  Text(
                    'Bornes relevees (${_controller.points.length})',
                    style: GeoSmartText.h3.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: GeoSmartDimens.space3),
                  if (_controller.points.isEmpty)
                    _EmptyPoints(colors: colors)
                  else
                    for (final point in _controller.points)
                      Padding(
                        padding: const EdgeInsets.only(
                          bottom: GeoSmartDimens.space2,
                        ),
                        child: _PointTile(
                          point: point,
                          colors: colors,
                          controller: _controller,
                          onDelete: () => _confirmDeletePoint(point),
                        ),
                      ),
                  if (_controller.session?.isCompleted ?? false) ...[
                    const SizedBox(height: GeoSmartDimens.space4),
                    _MissionSummaryCard(
                      controller: _controller,
                      colors: colors,
                    ),
                  ] else if (_controller.canFinishMission) ...[
                    const SizedBox(height: GeoSmartDimens.space4),
                    _FinishMissionCard(
                      colors: colors,
                      busy: _controller.isFinishing,
                      onFinish: _confirmFinish,
                    ),
                  ],
                  if (_controller.pendingSyncCount > 0) ...[
                    const SizedBox(height: GeoSmartDimens.space3),
                    _PendingSyncCard(controller: _controller, colors: colors),
                  ],
                  if (_controller.rejectedSyncCount > 0) ...[
                    const SizedBox(height: GeoSmartDimens.space3),
                    _RejectedSyncCard(controller: _controller, colors: colors),
                  ],
                ],
              ),
            ),
            _BottomAction(controller: _controller, colors: colors),
          ],
        ),
      ),
    );
  }
}

class _BluetoothBanner extends StatelessWidget {
  const _BluetoothBanner({required this.colors, required this.onRefresh});

  final GeoSmartColors colors;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: colors.warningSoft,
      padding: const EdgeInsets.symmetric(
        horizontal: GeoSmartDimens.space4,
        vertical: GeoSmartDimens.space1,
      ),
      child: Row(
        children: [
          Icon(Icons.bluetooth_disabled, size: 18, color: colors.warning),
          const SizedBox(width: GeoSmartDimens.space2),
          Expanded(
            child: Text(
              'Bluetooth desactive. Activez-le pour recevoir les positions '
              'du recepteur.',
              style: GeoSmartText.caption.copyWith(color: colors.warning),
            ),
          ),
          TextButton(
            onPressed: onRefresh,
            style: TextButton.styleFrom(
              foregroundColor: colors.warning,
              textStyle: GeoSmartText.button,
            ),
            child: const Text('Reverifier'),
          ),
        ],
      ),
    );
  }
}

class _SimulationBanner extends StatelessWidget {
  const _SimulationBanner({required this.colors});

  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: colors.warningSoft,
      padding: const EdgeInsets.symmetric(
        horizontal: GeoSmartDimens.space4,
        vertical: GeoSmartDimens.space2,
      ),
      child: Row(
        children: [
          Icon(Icons.science_outlined, size: 18, color: colors.warning),
          const SizedBox(width: GeoSmartDimens.space2),
          Expanded(
            child: Text(
              'Donnees simulees, pas de precision RTK annoncee.',
              style: GeoSmartText.caption.copyWith(color: colors.warning),
            ),
          ),
        ],
      ),
    );
  }
}

class _QualityBanner extends StatelessWidget {
  const _QualityBanner({
    required this.position,
    required this.colors,
    required this.animate,
  });

  final GnssPosition? position;
  final GeoSmartColors colors;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final quality = position?.fixQuality;
    final (background, foreground) = switch (quality) {
      GnssFixQuality.fixed => (colors.successSoft, colors.success),
      GnssFixQuality.float => (colors.warningSoft, colors.warning),
      GnssFixQuality.dgps => (colors.warningSoft, colors.warning),
      GnssFixQuality.autonomous => (colors.dangerSoft, colors.danger),
      GnssFixQuality.invalid => (colors.dangerSoft, colors.danger),
      null => (colors.surfaceSunken, colors.textMuted),
    };
    final label = quality?.label ?? 'En attente';
    final detail = position == null
        ? 'Recherche du recepteur GNSS (assurez vous que le Bluetooth est actif et que le recepteur est allume)'
        : '${position!.satellitesCount} satellites, ${position!.instrument}';

    return Container(
      padding: const EdgeInsets.all(GeoSmartDimens.space4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        border: Border.all(color: foreground.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          _QualityDot(
            color: foreground,
            pulsing: animate && quality != GnssFixQuality.fixed,
          ),
          const SizedBox(width: GeoSmartDimens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: GeoSmartText.h2.copyWith(color: foreground)),
                Text(
                  detail,
                  style: GeoSmartText.caption.copyWith(color: foreground),
                ),
              ],
            ),
          ),
          if (position?.accuracy != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'Sigma H',
                  style: GeoSmartText.caption.copyWith(color: foreground),
                ),
                Text(
                  formatSigma(position!.accuracy),
                  style: GeoSmartText.data(colors).copyWith(color: foreground),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _QualityDot extends StatefulWidget {
  const _QualityDot({required this.color, required this.pulsing});

  final Color color;
  final bool pulsing;

  @override
  State<_QualityDot> createState() => _QualityDotState();
}

class _QualityDotState extends State<_QualityDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
    value: 1,
  );

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(covariant _QualityDot oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _sync() {
    if (widget.pulsing) {
      if (!_controller.isAnimating) _controller.repeat(reverse: true);
    } else {
      _controller.stop();
      _controller.value = 1;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.3, end: 1).animate(_controller),
      child: Container(
        width: 16,
        height: 16,
        decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
      ),
    );
  }
}

class _MetricsGrid extends StatelessWidget {
  const _MetricsGrid({required this.position, required this.colors});

  final GnssPosition? position;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _MetricTile(
                label: 'Satellites',
                value: position == null
                    ? 'n.d.'
                    : '${position!.satellitesCount}',
                colors: colors,
              ),
            ),
            const SizedBox(width: GeoSmartDimens.space2),
            Expanded(
              child: _MetricTile(
                label: 'PDOP',
                value: formatDop(position?.pdop),
                colors: colors,
              ),
            ),
          ],
        ),
        const SizedBox(height: GeoSmartDimens.space2),
        Row(
          children: [
            Expanded(
              child: _MetricTile(
                label: 'HDOP',
                value: formatDop(position?.hdop),
                colors: colors,
              ),
            ),
            const SizedBox(width: GeoSmartDimens.space2),
            Expanded(
              child: _MetricTile(
                label: 'VDOP',
                value: formatDop(position?.vdop),
                colors: colors,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
    required this.colors,
  });

  final String label;
  final String value;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: GeoSmartDimens.space3,
        vertical: GeoSmartDimens.space2,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          Text(
            value,
            style: GeoSmartText.data(
              colors,
            ).copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _CoordinatesCard extends StatelessWidget {
  const _CoordinatesCard({required this.position, required this.colors});

  final GnssPosition? position;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    final value = position;
    if (value == null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(GeoSmartDimens.space4),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
          border: Border.all(color: colors.border),
        ),
        child: Text(
          'En attente du recepteur GNSS.',
          style: GeoSmartText.body.copyWith(color: colors.textMuted),
        ),
      );
    }

    final utm = toUtm31N(value.latitude, value.longitude);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(GeoSmartDimens.space4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'UTM 31N',
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          const SizedBox(height: GeoSmartDimens.space1),
          Text(
            'E ${formatUtm(utm.easting)}',
            style: GeoSmartText.data(
              colors,
            ).copyWith(fontSize: 17, fontWeight: FontWeight.w700),
          ),
          Text(
            'N ${formatUtm(utm.northing)}',
            style: GeoSmartText.data(
              colors,
            ).copyWith(fontSize: 17, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          Divider(color: colors.border, height: 1),
          const SizedBox(height: GeoSmartDimens.space3),
          Text(
            'WGS84',
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          const SizedBox(height: GeoSmartDimens.space1),
          Text(
            '${formatLatitude(value.latitude)}  ${formatLongitude(value.longitude)}',
            style: GeoSmartText.dataSmall(colors),
          ),
        ],
      ),
    );
  }
}

class _EmptyPoints extends StatelessWidget {
  const _EmptyPoints({required this.colors});

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
      child: Column(
        children: [
          Text(
            'Aucune borne enregistree',
            style: GeoSmartText.bodyStrong.copyWith(color: colors.text),
          ),
          const SizedBox(height: GeoSmartDimens.space1),
          Text(
            'Posez la canne a plomb et attendez le RTK Fixed.',
            textAlign: TextAlign.center,
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
        ],
      ),
    );
  }
}

enum _PointAction { remeasure, delete }

class _PointTile extends StatelessWidget {
  const _PointTile({
    required this.point,
    required this.colors,
    required this.controller,
    required this.onDelete,
  });

  final SurveyPoint point;
  final GeoSmartColors colors;
  final SurveyController controller;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final utm = toUtm31N(point.latitude, point.longitude);
    return Container(
      padding: const EdgeInsets.all(GeoSmartDimens.space3),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: GeoSmartDimens.space2,
              vertical: GeoSmartDimens.space1,
            ),
            decoration: BoxDecoration(
              color: colors.accentSoft,
              borderRadius: BorderRadius.circular(GeoSmartDimens.radiusSm),
            ),
            child: Text(
              point.pointName,
              style: GeoSmartText.label.copyWith(color: colors.accent),
            ),
          ),
          const SizedBox(width: GeoSmartDimens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'E ${formatUtm(utm.easting)}  N ${formatUtm(utm.northing)}',
                  style: GeoSmartText.dataSmall(colors),
                ),
                Text(
                  '${point.fixQuality.label}, ${point.satellitesCount} sat, PDOP ${formatDop(point.pdop)}',
                  style: GeoSmartText.caption.copyWith(color: colors.textMuted),
                ),
              ],
            ),
          ),
          Text(
            formatTime(point.recordedAt),
            style: GeoSmartText.dataSmall(colors),
          ),
          PopupMenuButton<_PointAction>(
            tooltip: 'Actions sur ${point.pointName}',
            onSelected: (action) {
              switch (action) {
                case _PointAction.remeasure:
                  controller.startRemeasure(point.id);
                case _PointAction.delete:
                  onDelete();
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: _PointAction.remeasure,
                child: Text('Reprendre la mesure'),
              ),
              PopupMenuItem(
                value: _PointAction.delete,
                child: Text('Supprimer la borne'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FinishMissionCard extends StatelessWidget {
  const _FinishMissionCard({
    required this.colors,
    required this.busy,
    required this.onFinish,
  });

  final GeoSmartColors colors;
  final bool busy;
  final VoidCallback onFinish;

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Terminer la mission',
            style: GeoSmartText.h3.copyWith(color: colors.text),
          ),
          const SizedBox(height: GeoSmartDimens.space1),
          Text(
            'Le perimetre et la surface seront calcules en UTM 31N, puis la '
            'mission sera enregistree sur l appareil avant son envoi.',
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          SizedBox(
            width: double.infinity,
            height: GeoSmartDimens.touchMin,
            child: FilledButton(
              onPressed: busy ? null : onFinish,
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
              child: Text(
                busy ? 'Calcul en cours...' : 'Terminer et enregistrer',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MissionSummaryCard extends StatelessWidget {
  const _MissionSummaryCard({required this.controller, required this.colors});

  final SurveyController controller;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    final session = controller.session;
    if (session == null) return const SizedBox.shrink();
    final synced = session.status == SurveySessionStatus.synced;
    final color = synced ? colors.success : colors.warning;
    final background = synced ? colors.successSoft : colors.warningSoft;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(GeoSmartDimens.space4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                synced
                    ? Icons.cloud_done_outlined
                    : Icons.cloud_upload_outlined,
                size: 20,
                color: color,
              ),
              const SizedBox(width: GeoSmartDimens.space2),
              Expanded(
                child: Text(
                  session.status.label,
                  style: GeoSmartText.h3.copyWith(color: color),
                ),
              ),
            ],
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          _InfoRow(
            label: 'Perimetre',
            value: '${formatDecimal(session.perimeterMeters ?? 0)} m',
            colors: colors,
          ),
          _InfoRow(
            label: 'Surface',
            value: '${formatDecimal(session.areaSquareMeters ?? 0)} m2',
            colors: colors,
          ),
          _InfoRow(
            label: 'Bornes',
            value: '${session.points.length}',
            colors: colors,
          ),
          if (session.canSync || controller.pendingSyncCount > 0) ...[
            const SizedBox(height: GeoSmartDimens.space3),
            SizedBox(
              width: double.infinity,
              height: GeoSmartDimens.touchMin,
              child: FilledButton(
                onPressed: controller.isSyncing || !controller.canSyncNow
                    ? null
                    : controller.syncCurrentMission,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.primary,
                  foregroundColor: colors.onPrimary,
                  disabledBackgroundColor: colors.surfaceSunken,
                  disabledForegroundColor: colors.textMuted,
                  textStyle: GeoSmartText.button,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(
                      GeoSmartDimens.radiusMd,
                    ),
                  ),
                ),
                child: Text(
                  controller.isSyncing
                      ? 'Synchronisation...'
                      : controller.canSyncNow
                      ? 'Synchroniser maintenant'
                      : 'Serveur non configure',
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PendingSyncCard extends StatelessWidget {
  const _PendingSyncCard({required this.controller, required this.colors});

  final SurveyController controller;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    final count = controller.pendingSyncCount;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(GeoSmartDimens.space3),
      decoration: BoxDecoration(
        color: colors.warningSoft,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
        border: Border.all(color: colors.warning.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.sync_outlined, size: 18, color: colors.warning),
          const SizedBox(width: GeoSmartDimens.space2),
          Expanded(
            child: Text(
              count == 1
                  ? '1 mission en attente d envoi.'
                  : '$count missions en attente d envoi.',
              style: GeoSmartText.caption.copyWith(color: colors.warning),
            ),
          ),
          if (controller.canSyncNow)
            TextButton(
              onPressed: controller.isSyncing ? null : controller.syncNow,
              child: Text(controller.isSyncing ? 'Envoi...' : 'Envoyer'),
            ),
        ],
      ),
    );
  }
}

class _RejectedSyncCard extends StatelessWidget {
  const _RejectedSyncCard({required this.controller, required this.colors});

  final SurveyController controller;
  final GeoSmartColors colors;

  String _titleFor(SyncQueueEntry entry) {
    final session = controller.session;
    return session?.id == entry.sessionId ? session!.title : entry.sessionId;
  }

  @override
  Widget build(BuildContext context) {
    final entries = controller.rejectedSyncEntries;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(GeoSmartDimens.space3),
      decoration: BoxDecoration(
        color: colors.dangerSoft,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
        border: Border.all(color: colors.danger.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.error_outline, size: 18, color: colors.danger),
              const SizedBox(width: GeoSmartDimens.space2),
              Expanded(
                child: Text(
                  entries.length == 1
                      ? '1 mission refusee par la file d envoi.'
                      : '${entries.length} missions refusees par la file '
                            'd envoi.',
                  style: GeoSmartText.caption.copyWith(color: colors.danger),
                ),
              ),
            ],
          ),
          const SizedBox(height: GeoSmartDimens.space1),
          Text(
            'Corrigez la mission puis remettez-la en file.',
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          for (final entry in entries) ...[
            const SizedBox(height: GeoSmartDimens.space2),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _RejectedEntryLabel(
                    title: _titleFor(entry),
                    entry: entry,
                    colors: colors,
                  ),
                ),
                const SizedBox(width: GeoSmartDimens.space2),
                TextButton(
                  onPressed: controller.isSyncing
                      ? null
                      : () => unawaited(
                          controller.retryRejected(entry.sessionId),
                        ),
                  child: const Text('Remettre en file'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _RejectedEntryLabel extends StatelessWidget {
  const _RejectedEntryLabel({
    required this.title,
    required this.entry,
    required this.colors,
  });

  final String title;
  final SyncQueueEntry entry;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: GeoSmartText.caption.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (entry.lastError != null)
          Text(
            entry.lastError!,
            style: GeoSmartText.caption.copyWith(color: colors.danger),
          ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    required this.colors,
  });

  final String label;
  final String value;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: GeoSmartDimens.space1),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
          Text(
            value,
            style: GeoSmartText.data(
              colors,
            ).copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _FinishMissionSheet extends StatelessWidget {
  const _FinishMissionSheet({required this.preview, required this.pointsCount});

  final SurveyMeasurements preview;
  final int pointsCount;

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(GeoSmartDimens.space5),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.borderStrong,
                  borderRadius: BorderRadius.circular(
                    GeoSmartDimens.radiusPill,
                  ),
                ),
              ),
            ),
            const SizedBox(height: GeoSmartDimens.space4),
            Text(
              'Terminer la mission',
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            const SizedBox(height: GeoSmartDimens.space2),
            Text(
              'Verifiez les mesures calculees en UTM 31N avant de fermer le '
              'leve. Les bornes restent sur l appareil.',
              style: GeoSmartText.body.copyWith(color: colors.textMuted),
            ),
            const SizedBox(height: GeoSmartDimens.space4),
            _InfoRow(label: 'Bornes', value: '$pointsCount', colors: colors),
            _InfoRow(
              label: 'Perimetre',
              value: '${formatDecimal(preview.perimeterMeters)} m',
              colors: colors,
            ),
            _InfoRow(
              label: 'Surface',
              value: '${formatDecimal(preview.areaSquareMeters)} m2',
              colors: colors,
            ),
            const SizedBox(height: GeoSmartDimens.space5),
            SizedBox(
              width: double.infinity,
              height: GeoSmartDimens.touchField,
              child: FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                style: FilledButton.styleFrom(
                  backgroundColor: colors.accent,
                  foregroundColor: colors.onAccent,
                  textStyle: GeoSmartText.button,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(
                      GeoSmartDimens.radiusMd,
                    ),
                  ),
                ),
                child: const Text('Confirmer la fin du leve'),
              ),
            ),
            const SizedBox(height: GeoSmartDimens.space2),
            SizedBox(
              width: double.infinity,
              height: GeoSmartDimens.touchMin,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Continuer la mesure'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomAction extends StatelessWidget {
  const _BottomAction({required this.controller, required this.colors});

  final SurveyController controller;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(
        GeoSmartDimens.space4,
        GeoSmartDimens.space3,
        GeoSmartDimens.space4,
        GeoSmartDimens.space4,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: controller.isAveraging
          ? _measurementInProgress(colors)
          : _recordButton(context, colors),
    );
  }

  Widget _measurementInProgress(GeoSmartColors colors) {
    final target = controller.remeasuringPoint;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Text(
              target == null
                  ? 'Mesure en cours'
                  : 'Reprise de ${target.pointName}',
              style: GeoSmartText.bodyStrong.copyWith(color: colors.text),
            ),
            const Spacer(),
            Text(
              '${controller.epochsCollected} / ${controller.epochsRequired}',
              style: GeoSmartText.data(colors),
            ),
          ],
        ),
        const SizedBox(height: GeoSmartDimens.space2),
        ClipRRect(
          borderRadius: BorderRadius.circular(GeoSmartDimens.radiusPill),
          child: LinearProgressIndicator(
            value: controller.measurementProgress,
            minHeight: 8,
            color: colors.accent,
            backgroundColor: colors.surfaceSunken,
          ),
        ),
        const SizedBox(height: GeoSmartDimens.space2),
        SizedBox(
          width: double.infinity,
          height: GeoSmartDimens.touchMin,
          child: TextButton(
            onPressed: controller.cancelMeasurement,
            child: const Text('Annuler la mesure'),
          ),
        ),
      ],
    );
  }

  Widget _recordButton(BuildContext context, GeoSmartColors colors) {
    final reason = controller.disabledReason;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: GeoSmartDimens.touchField,
          child: FilledButton(
            onPressed: controller.canRecord
                ? controller.startMeasurement
                : null,
            style: FilledButton.styleFrom(
              backgroundColor: colors.accent,
              foregroundColor: colors.onAccent,
              disabledBackgroundColor: colors.surfaceSunken,
              disabledForegroundColor: colors.textMuted,
              textStyle: GeoSmartText.button,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
              ),
            ),
            child: const Text('Enregistrer la borne'),
          ),
        ),
        if (reason != null) ...[
          const SizedBox(height: GeoSmartDimens.space2),
          Text(
            reason,
            textAlign: TextAlign.center,
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
        ],
      ],
    );
  }
}
