import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'viewmodels/sync_controller.dart';

/// Ecran de synchronisation hors ligne (EF-405) : file d'envoi locale,
/// reprise manuelle ou automatique, refus conserves avec leur motif.
class SyncPage extends StatefulWidget {
  const SyncPage({super.key, required this.controller});

  final SyncController controller;

  @override
  State<SyncPage> createState() => _SyncPageState();
}

class _SyncPageState extends State<SyncPage> {
  @override
  void initState() {
    super.initState();
    widget.controller.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Synchronisation',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
        actions: [
          IconButton(
            tooltip: 'Actualiser',
            icon: const Icon(Icons.refresh),
            onPressed: () => widget.controller.refresh(),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: widget.controller,
        builder: (context, _) {
          final controller = widget.controller;
          return ListView(
            padding: const EdgeInsets.all(GeoSmartDimens.space4),
            children: [
              FilledButton.icon(
                onPressed: controller.busy ? null : controller.flush,
                icon: controller.busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send_outlined),
                label: const Text('Envoyer la file'),
              ),
              if (controller.lastRunSummary != null) ...[
                const SizedBox(height: GeoSmartDimens.space3),
                Text(
                  controller.lastRunSummary!,
                  style: GeoSmartText.body.copyWith(color: colors.textMuted),
                ),
              ],
              const SizedBox(height: GeoSmartDimens.space4),
              Text(
                'En attente (${controller.pending.length})',
                style: GeoSmartText.h3.copyWith(color: colors.text),
              ),
              if (controller.pending.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: GeoSmartDimens.space2,
                  ),
                  child: Text(
                    'Rien a envoyer : la file est vide.',
                    style: GeoSmartText.body.copyWith(color: colors.textMuted),
                  ),
                )
              else
                for (final entry in controller.pending)
                  ListTile(
                    leading: const Icon(Icons.upload_outlined),
                    title: Text(controller.titleOf(entry.sessionId)),
                    subtitle: Text(
                      '${entry.attempts} tentative(s)',
                    ),
                  ),
              const SizedBox(height: GeoSmartDimens.space4),
              Text(
                'Refuses (${controller.rejected.length})',
                style: GeoSmartText.h3.copyWith(color: colors.danger),
              ),
              if (controller.rejected.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: GeoSmartDimens.space2,
                  ),
                  child: Text(
                    'Aucun refus conserve.',
                    style: GeoSmartText.body.copyWith(color: colors.textMuted),
                  ),
                )
              else
                for (final entry in controller.rejected)
                  ListTile(
                    leading: Icon(Icons.error_outline, color: colors.danger),
                    title: Text(controller.titleOf(entry.sessionId)),
                    subtitle: Text(entry.lastError ?? 'Motif inconnu.'),
                  ),
            ],
          );
        },
      ),
    );
  }
}
