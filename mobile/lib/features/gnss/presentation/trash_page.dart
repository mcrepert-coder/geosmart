import 'package:flutter/material.dart';

import '../../../app/format/geosmart_formats.dart';
import '../../../app/theme/geosmart_theme.dart';
import '../domain/entities/survey_session.dart';
import '../domain/entities/survey_session_status.dart';
import 'viewmodels/missions_controller.dart';

/// Page de la corbeille locale des missions.
///
/// Les missions en corbeille sont conservees pendant 7 jours avant leur purge
/// automatique. L'utilisateur peut les restaurer ou les effacer definitivement.
class TrashPage extends StatefulWidget {
  const TrashPage({super.key, required this.missions});

  final MissionsController missions;

  @override
  State<TrashPage> createState() => _TrashPageState();
}

class _TrashPageState extends State<TrashPage> {
  @override
  void initState() {
    super.initState();
    widget.missions.addListener(_onMissionsChanged);
  }

  @override
  void dispose() {
    widget.missions.removeListener(_onMissionsChanged);
    super.dispose();
  }

  void _onMissionsChanged() {
    if (mounted) setState(() {});
  }

  void _showToast(String message) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        duration: const Duration(seconds: 3),
        persist: false,
      ),
    );
  }

  Future<void> _restore(SurveySession session) async {
    final success = await widget.missions.restoreMission(session.id);
    if (!mounted) return;
    if (success) {
      _showToast('Mission "${session.title}" restauree');
    } else if (widget.missions.error != null) {
      _showToast(widget.missions.error!);
    }
  }

  Future<void> _confirmPermanentDelete(SurveySession session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Supprimer definitivement ${session.title} ?'),
        content: const Text(
          'Cette action est irreversible. La mission et ses bornes '
          'seront definitivement effacees de l\'appareil.',
        ),
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
    if (confirmed != true || !mounted) return;

    final success = await widget.missions.permanentlyDelete(session.id);
    if (!mounted) return;
    if (success) {
      _showToast('Mission supprimee definitivement');
    } else if (widget.missions.error != null) {
      _showToast(widget.missions.error!);
    }
  }

  Future<void> _confirmEmptyTrash() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Vider la corbeille ?'),
        content: const Text(
          'Toutes les missions de la corbeille seront definitivement supprimees.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Vider'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final success = await widget.missions.emptyTrash();
    if (!mounted) return;
    if (success) {
      _showToast('Corbeille videe');
    } else if (widget.missions.error != null) {
      _showToast(widget.missions.error!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    final trash = widget.missions.trash;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Corbeille'),
        actions: [
          if (trash.isNotEmpty)
            TextButton.icon(
              key: const Key('empty-trash-button'),
              onPressed: _confirmEmptyTrash,
              icon: Icon(Icons.delete_sweep_outlined, color: colors.danger),
              label: Text('Vider', style: TextStyle(color: colors.danger)),
            ),
        ],
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: GeoSmartDimens.space4,
              vertical: GeoSmartDimens.space3,
            ),
            color: colors.primarySoft,
            child: Row(
              children: [
                Icon(Icons.info_outline, size: 20, color: colors.primary),
                const SizedBox(width: GeoSmartDimens.space2),
                Expanded(
                  child: Text(
                    'Les missions en corbeille sont conservees pendant 7 jours '
                    'avant d etre definitivement supprimees.',
                    style: GeoSmartText.caption.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: trash.isEmpty
                ? _EmptyTrash(colors: colors)
                : ListView.separated(
                    padding: const EdgeInsets.all(GeoSmartDimens.space4),
                    itemCount: trash.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: GeoSmartDimens.space3),
                    itemBuilder: (context, index) {
                      final session = trash[index];
                      return _TrashItemCard(
                        session: session,
                        colors: colors,
                        onRestore: () => _restore(session),
                        onDelete: () => _confirmPermanentDelete(session),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _TrashItemCard extends StatelessWidget {
  const _TrashItemCard({
    required this.session,
    required this.colors,
    required this.onRestore,
    required this.onDelete,
  });

  final SurveySession session;
  final GeoSmartColors colors;
  final VoidCallback onRestore;
  final VoidCallback onDelete;

  int _remainingDays() {
    final deletedAt = session.deletedAt;
    if (deletedAt == null) return 7;
    final elapsed = DateTime.now().toUtc().difference(deletedAt).inDays;
    final remaining = 7 - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  @override
  Widget build(BuildContext context) {
    final points = session.points.length;
    final days = _remainingDays();

    return Material(
      color: colors.surface,
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        side: BorderSide(color: colors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(GeoSmartDimens.space3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    session.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GeoSmartText.h3.copyWith(color: colors.text),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: GeoSmartDimens.space2,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: colors.surfaceSunken,
                    borderRadius: BorderRadius.circular(
                      GeoSmartDimens.radiusPill,
                    ),
                  ),
                  child: Text(
                    session.status == SurveySessionStatus.draft
                        ? 'Brouillon'
                        : 'En cours',
                    style: GeoSmartText.caption.copyWith(
                      color: colors.textMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: GeoSmartDimens.space1),
            Text(
              points > 1 ? '$points bornes' : '$points borne',
              style: GeoSmartText.caption.copyWith(color: colors.textMuted),
            ),
            if (session.deletedAt != null) ...[
              const SizedBox(height: GeoSmartDimens.space1),
              Text(
                'Supprimee le ${formatDate(session.deletedAt!)} (reste $days j)',
                style: GeoSmartText.caption.copyWith(
                  color: days <= 1 ? colors.danger : colors.textMuted,
                  fontWeight: days <= 1 ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ],
            const SizedBox(height: GeoSmartDimens.space2),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton.icon(
                  key: Key('restore-mission-${session.id}'),
                  onPressed: onRestore,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: colors.primary,
                    side: BorderSide(color: colors.primary),
                  ),
                  icon: const Icon(Icons.restore, size: 18),
                  label: const Text('Restaurer'),
                ),
                const SizedBox(width: GeoSmartDimens.space2),
                IconButton(
                  key: Key('permanent-delete-${session.id}'),
                  icon: Icon(
                    Icons.delete_forever_outlined,
                    color: colors.danger,
                  ),
                  tooltip: 'Supprimer definitivement',
                  onPressed: onDelete,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyTrash extends StatelessWidget {
  const _EmptyTrash({required this.colors});

  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(GeoSmartDimens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.delete_outline,
              size: 56,
              color: colors.textMuted.withValues(alpha: 0.5),
            ),
            const SizedBox(height: GeoSmartDimens.space3),
            Text(
              'Corbeille vide',
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            const SizedBox(height: GeoSmartDimens.space1),
            Text(
              'Les missions supprimees apparaitront ici.',
              style: GeoSmartText.body.copyWith(color: colors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

