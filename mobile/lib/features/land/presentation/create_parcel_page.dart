import 'package:material_ui/material_ui.dart';

import '../domain/entities/bornage.dart';
import '../domain/entities/parcel_draft.dart';
import 'bornage_page.dart';
import 'land_style.dart';
import 'widgets/polygon_preview.dart';

/// Ecran "Creer la parcelle" (maquette T5, EF-107, EF-201, EF-203).
///
/// Les bornes viennent du chantier (module terrain de Romuald). La mise en
/// file d'envoi est confiee a [onQueue] : la file locale appartient au module
/// synchronisation (Beni, RG-08).
class CreateParcelPage extends StatefulWidget {
  const CreateParcelPage({
    super.key,
    required this.initialDraft,
    required this.onQueue,
  });

  final ParcelDraft initialDraft;
  final Future<void> Function(ParcelDraft draft) onQueue;

  @override
  State<CreateParcelPage> createState() => _CreateParcelPageState();
}

class _CreateParcelPageState extends State<CreateParcelPage> {
  late ParcelDraft _draft = widget.initialDraft;
  late final _titleController = TextEditingController(text: _draft.titleNumber);
  bool _sending = false;

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  void _update(ParcelDraft next) => setState(() => _draft = next);

  // Bornage contradictoire (maquette T6).
  Future<void> _openBornage() async {
    final bornage = await Navigator.of(context).push<Bornage>(
      MaterialPageRoute(
        builder: (_) =>
            BornagePage(initial: _draft.bornage, locality: _draft.locality),
      ),
    );
    if (bornage != null) _update(_draft.copyWith(bornage: bornage));
  }

  Future<void> _queue() async {
    setState(() => _sending = true);
    try {
      await widget.onQueue(_draft);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Parcelle enregistrée sur l'appareil, en file d'envoi"),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("La parcelle n'a pas pu être mise en file. Réessayez."),
        ),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final m = _draft.metrics;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        title: const Text('Nouvelle parcelle'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: _Chip(
              label: 'Brouillon local',
              background: colors.accentSoft,
              foreground: colors.accent,
            ),
          ),
        ],
      ),
      body: ListView(
        children: [
          PolygonPreview(draft: _draft),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    _Metric(
                      label: 'Surface',
                      value: m.isClosed ? formatArea(m.areaM2) : '-',
                    ),
                    const SizedBox(width: 8),
                    _Metric(
                      label: 'Périmètre',
                      value: m.isClosed ? formatMeters(m.perimeterM) : '-',
                    ),
                    const SizedBox(width: 8),
                    _Metric(
                      label: 'Bornes',
                      value: '${_draft.fixedCount} Fixed',
                      valueColor: _draft.allPointsFixed
                          ? colors.success
                          : colors.warning,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Calculs en UTM 31N, comme sur le serveur.',
                  style: TextStyle(fontSize: 12, color: colors.textMuted),
                ),
                const SizedBox(height: 20),
                _label(context, 'Commune', required: true),
                DropdownButtonFormField<String>(
                  initialValue: _draft.commune,
                  decoration: _fieldDecoration(colors),
                  hint: const Text('Choisir la commune'),
                  items: [
                    for (final e in communes.entries)
                      DropdownMenuItem(
                        value: e.key,
                        child: Text('${e.value} (${e.key})'),
                      ),
                  ],
                  onChanged: (code) => _update(_draft.copyWith(commune: code)),
                ),
                const SizedBox(height: 20),
                _label(context, 'Statut juridique', required: true),
                SegmentedButton<DeclaredStatus>(
                  emptySelectionAllowed: true,
                  showSelectedIcon: false,
                  segments: [
                    for (final s in DeclaredStatus.values)
                      ButtonSegment(value: s, label: Text(s.label)),
                  ],
                  selected: {?_draft.declaredStatus},
                  onSelectionChanged: (set) {
                    if (set.isNotEmpty) {
                      _update(_draft.copyWith(declaredStatus: set.first));
                    }
                  },
                ),
                if (_draft.declaredStatus == DeclaredStatus.titre) ...[
                  const SizedBox(height: 16),
                  _label(context, 'N° de titre', required: true),
                  TextField(
                    controller: _titleController,
                    decoration: _fieldDecoration(colors, hint: 'TF 12345/RT'),
                    style: const TextStyle(
                      fontSize: 17,
                      fontFamily: landMonoFont,
                    ),
                    onChanged: (t) => _update(_draft.copyWith(titleNumber: t)),
                  ),
                ],
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Ordre des bornes',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: colors.text,
                        ),
                      ),
                    ),
                    Text(
                      'Appui long pour réordonner',
                      style: TextStyle(fontSize: 12, color: colors.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _PointList(
                  draft: _draft,
                  onMove: (a, b) => _update(_draft.reorder(a, b)),
                ),
                const SizedBox(height: 12),
                _GeometryStatus(draft: _draft),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: _BottomActions(
        draft: _draft,
        sending: _sending,
        onBornage: _openBornage,
        onQueue: _queue,
      ),
    );
  }
}

Widget _label(BuildContext context, String text, {bool required = false}) {
  final colors = LandColors.of(context);
  return Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text.rich(
      TextSpan(
        text: text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: colors.text,
        ),
        children: [
          if (required)
            TextSpan(
              text: ' *',
              style: TextStyle(color: colors.danger),
            ),
        ],
      ),
    ),
  );
}

InputDecoration _fieldDecoration(LandColors colors, {String? hint}) =>
    InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: colors.surfaceSunken,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: colors.borderStrong),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: colors.borderStrong),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: colors.primary, width: 2),
      ),
    );

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, this.valueColor});

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.border),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 11,
                letterSpacing: 0.5,
                fontWeight: FontWeight.w600,
                color: colors.textMuted,
              ),
            ),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: valueColor ?? colors.text,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PointList extends StatelessWidget {
  const _PointList({required this.draft, required this.onMove});

  final ParcelDraft draft;
  // Indices au sens de ParcelDraft.reorder (newIndex avant retrait).
  final void Function(int oldIndex, int newIndex) onMove;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final vertices = draft.metrics.vertices;
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: ReorderableListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        buildDefaultDragHandles: false,
        itemCount: draft.points.length,
        // onReorderItem donne newIndex apres retrait de l'element.
        onReorderItem: (from, to) => onMove(from, to > from ? to + 1 : to),
        itemBuilder: (context, i) {
          final p = draft.points[i];
          final fixed = p.fixQuality.canRecordPoint;
          return ReorderableDelayedDragStartListener(
            key: ValueKey(p.id),
            index: i,
            child: ListTile(
              minTileHeight: 56,
              leading: CircleAvatar(
                radius: 16,
                backgroundColor: fixed ? colors.primary : colors.accent,
                child: Text(
                  p.pointName,
                  style: TextStyle(
                    color: colors.onPrimary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    fontFamily: landMonoFont,
                  ),
                ),
              ),
              title: Text(
                formatUtm(vertices[i].easting, vertices[i].northing),
                style: TextStyle(
                  fontFamily: landMonoFont,
                  fontSize: 14,
                  color: colors.text,
                ),
              ),
              trailing: _Chip(
                label: p.fixQuality.label,
                background: fixed ? colors.successSoft : colors.accentSoft,
                foreground: fixed ? colors.success : colors.accent,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _GeometryStatus extends StatelessWidget {
  const _GeometryStatus({required this.draft});

  final ParcelDraft draft;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final crossing = draft.crossingMessage();
    final (IconData icon, Color color, String text) = switch (draft) {
      _ when draft.points.length < 3 => (
        Icons.info_outline,
        colors.textMuted,
        'Relevez au moins 3 bornes pour fermer la parcelle.',
      ),
      _ when draft.blockers.contains(DraftBlocker.tooManyPoints) => (
        Icons.error_outline,
        colors.danger,
        'Une parcelle a au plus $maxParcelPoints bornes. Retirez les bornes en trop.',
      ),
      _ when crossing != null => (Icons.error_outline, colors.danger, crossing),
      _ when draft.blockers.contains(DraftBlocker.flatPolygon) => (
        Icons.error_outline,
        colors.danger,
        'Les bornes sont presque alignées : la parcelle n\'a pas de surface.',
      ),
      _ when !draft.allPointsFixed => (
        Icons.warning_amber_outlined,
        colors.warning,
        'Polygone fermé. Une borne n\'est pas en RTK Fixed : la parcelle ne sera pas certifiée et ne donnera pas d\'attestation.',
      ),
      _ => (
        Icons.check,
        colors.success,
        'Polygone fermé, aucune auto-intersection.',
      ),
    };
    return Semantics(
      liveRegion: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: color, fontSize: 14)),
          ),
        ],
      ),
    );
  }
}

class _BottomActions extends StatelessWidget {
  const _BottomActions({
    required this.draft,
    required this.sending,
    required this.onBornage,
    required this.onQueue,
  });

  final ParcelDraft draft;
  final bool sending;
  final VoidCallback? onBornage;
  final VoidCallback onQueue;

  String? _reason() {
    final b = draft.blockers;
    if (b.isEmpty) return null;
    return switch (b.first) {
      DraftBlocker.tooFewPoints => 'Il faut au moins 3 bornes.',
      DraftBlocker.tooManyPoints => 'Il faut au plus $maxParcelPoints bornes.',
      DraftBlocker.flatPolygon => 'Les bornes doivent former une surface.',
      DraftBlocker.selfIntersection => 'Corrigez l\'ordre des bornes.',
      DraftBlocker.noCommune => 'Choisissez la commune.',
      DraftBlocker.noStatus => 'Choisissez le statut juridique.',
      DraftBlocker.noTitleNumber => 'Saisissez le n° de titre.',
    };
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final reason = _reason();
    final buttonStyle = ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(Size.fromHeight(56)),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      textStyle: const WidgetStatePropertyAll(
        TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    );
    return SafeArea(
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border(top: BorderSide(color: colors.border)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: OutlinedButton(
                    style: buttonStyle,
                    onPressed: onBornage,
                    child: Text(
                      draft.bornage == null
                          ? 'Bornage'
                          : 'Bornage (${draft.bornage!.presentCount}/${draft.bornage!.neighbours.length})',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 3,
                  child: FilledButton(
                    style: buttonStyle.copyWith(
                      backgroundColor: WidgetStateProperty.resolveWith(
                        (s) => s.contains(WidgetState.disabled)
                            ? colors.surfaceSunken
                            : colors.primary,
                      ),
                      foregroundColor: WidgetStateProperty.resolveWith(
                        (s) => s.contains(WidgetState.disabled)
                            ? colors.textMuted
                            : colors.onPrimary,
                      ),
                    ),
                    onPressed: draft.canQueue && !sending ? onQueue : null,
                    child: Text(sending ? 'Envoi…' : 'Mettre en file d\'envoi'),
                  ),
                ),
              ],
            ),
            if (reason != null) ...[
              const SizedBox(height: 6),
              Text(
                reason,
                style: TextStyle(fontSize: 12, color: colors.textMuted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: foreground,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: foreground,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
