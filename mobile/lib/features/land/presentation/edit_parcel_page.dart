import 'package:flutter/material.dart';

import '../data/land_api.dart';
import '../domain/entities/land_models.dart';
import '../domain/entities/parcel_draft.dart';
import 'land_errors.dart';
import 'land_style.dart';
import 'widgets/polygon_preview.dart';

/// Ecran "Modifier la limite" (EF-205, CA-4). Le geometre auteur reprend des
/// bornes ; le serveur cree une nouvelle version et garde l'ancienne.
/// Renvoie la parcelle mise a jour par Navigator.pop.
class EditParcelPage extends StatefulWidget {
  const EditParcelPage({
    super.key,
    required this.parcel,
    required this.draft,
    required this.api,
  });

  /// Version actuelle, telle que le geometre l'a ouverte.
  final ParcelInfo parcel;

  /// Nouvelles bornes, dans l'ordre du tour de la parcelle.
  final ParcelDraft draft;
  final LandApi api;

  @override
  State<EditParcelPage> createState() => _EditParcelPageState();
}

class _EditParcelPageState extends State<EditParcelPage> {
  late final ParcelDraft _draft = widget.draft;
  final _reason = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final updated = await widget.api.updateParcel(
        widget.parcel.id,
        _draft,
        expectedVersion: widget.parcel.version,
        reason: _reason.text,
      );
      if (mounted) Navigator.of(context).pop(updated);
    } on LandApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = landErrorMessage(e, action: LandAction.update);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final m = _draft.metrics;
    final blockers = _draft.geometryBlockers;
    final diff = m.isClosed ? m.areaM2 - widget.parcel.areaM2 : 0.0;
    final crossing = _draft.crossingMessage();

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Modifier la limite'),
            Text(
              '${widget.parcel.id} · version ${widget.parcel.version}',
              style: TextStyle(
                fontSize: 12,
                fontFamily: landMonoFont,
                color: colors.textMuted,
              ),
            ),
          ],
        ),
      ),
      body: ListView(
        children: [
          PolygonPreview(draft: _draft),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Compare(
                  label: 'Surface',
                  before: formatArea(widget.parcel.areaM2),
                  after: m.isClosed ? formatArea(m.areaM2) : '-',
                  delta: m.isClosed
                      ? '${diff >= 0 ? '+' : '−'}${formatArea(diff.abs())}'
                      : null,
                ),
                const SizedBox(height: 8),
                _Compare(
                  label: 'Périmètre',
                  before: formatMeters(widget.parcel.perimeterM),
                  after: m.isClosed ? formatMeters(m.perimeterM) : '-',
                ),
                const SizedBox(height: 8),
                Text(
                  '${_draft.fixedCount} / ${_draft.points.length} bornes en RTK Fixed'
                  '${_draft.allPointsFixed ? '' : ' : la nouvelle version ne sera pas certifiée.'}',
                  style: TextStyle(
                    color: _draft.allPointsFixed
                        ? colors.success
                        : colors.warning,
                  ),
                ),
                if (crossing != null) ...[
                  const SizedBox(height: 8),
                  Text(crossing, style: TextStyle(color: colors.danger)),
                ],
                if (blockers.contains(DraftBlocker.tooManyPoints)) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Une parcelle a au plus $maxParcelPoints bornes. Retirez les bornes en trop.',
                    style: TextStyle(color: colors.danger),
                  ),
                ],
                const SizedBox(height: 20),
                TextField(
                  controller: _reason,
                  maxLength: 500,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: 'Motif de la modification',
                    hintText: 'Reprise de la borne B3 après bornage',
                    floatingLabelBehavior: FloatingLabelBehavior.always,
                    filled: true,
                    fillColor: colors.surfaceSunken,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
                Text(
                  'L\'ancienne version reste consultable dans l\'historique. La modification est journalisée.',
                  style: TextStyle(fontSize: 12, color: colors.textMuted),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: colors.dangerSoft,
                      border: Border.all(color: colors.danger),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        _error!,
                        style: TextStyle(color: colors.text),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: SizedBox(
            height: 56,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: colors.primary,
                foregroundColor: colors.onPrimary,
                disabledBackgroundColor: colors.surfaceSunken,
                disabledForegroundColor: colors.textMuted,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                textStyle: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              onPressed: blockers.isEmpty && !_sending ? _send : null,
              child: Text(
                _sending
                    ? 'Envoi…'
                    : 'Enregistrer la version ${widget.parcel.version + 1}',
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Compare extends StatelessWidget {
  const _Compare({
    required this.label,
    required this.before,
    required this.after,
    this.delta,
  });

  final String label;
  final String before;
  final String after;
  final String? delta;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 84,
            child: Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: colors.textMuted,
              ),
            ),
          ),
          Expanded(
            child: Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  before,
                  style: TextStyle(
                    color: colors.textMuted,
                    decoration: TextDecoration.lineThrough,
                  ),
                ),
                Icon(Icons.arrow_forward, size: 16, color: colors.textMuted),
                Text(
                  after,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: colors.text,
                  ),
                ),
                if (delta != null)
                  Text(
                    '($delta)',
                    style: TextStyle(fontSize: 12, color: colors.textMuted),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
