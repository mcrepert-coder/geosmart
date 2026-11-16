import 'package:material_ui/material_ui.dart';

import '../data/land_api.dart';
import '../domain/entities/land_models.dart';
import 'land_style.dart';
import 'widgets/land_badges.dart';

/// Utilisateur qui consulte la fiche : decide des actions affichees (EF-402).
class LandViewer {
  const LandViewer({required this.id, required this.role});

  final String id;

  /// ADMIN, GEOMETRE, TOPOGRAPHE, AGENT ou CLIENT.
  final String role;
}

/// Ouvre la fiche d'une parcelle par-dessus la carte (composant BottomSheet) :
/// apercu a 30 %, glisser la poignee pour la moitie ou le plein ecran.
Future<void> showParcelSheet(
  BuildContext context, {
  required String parcelId,
  required LandApi api,
  required LandViewer viewer,
  void Function(ParcelInfo parcel)? onEdit,
  void Function(ParcelInfo parcel)? onAttestation,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.45,
      minChildSize: 0.3,
      maxChildSize: 1,
      builder: (context, controller) => ParcelSheet(
        parcelId: parcelId,
        api: api,
        viewer: viewer,
        onEdit: onEdit,
        onAttestation: onAttestation,
        scrollController: controller,
      ),
    ),
  );
}

/// Contenu de la fiche : statut, certification, mesures, version, historique
/// et actions permises au role. Une action interdite n'apparait pas.
class ParcelSheet extends StatefulWidget {
  const ParcelSheet({
    super.key,
    required this.parcelId,
    required this.api,
    required this.viewer,
    this.onEdit,
    this.onAttestation,
    this.scrollController,
  });

  final String parcelId;
  final LandApi api;
  final LandViewer viewer;
  final void Function(ParcelInfo parcel)? onEdit;
  final void Function(ParcelInfo parcel)? onAttestation;
  final ScrollController? scrollController;

  @override
  State<ParcelSheet> createState() => _ParcelSheetState();
}

class _ParcelSheetState extends State<ParcelSheet> {
  ParcelInfo? _parcel;
  String? _error;
  List<ParcelVersionInfo>? _versions;
  bool _loadingVersions = false;
  String? _versionsError;

  bool get _canSeeHistory =>
      widget.viewer.role == 'ADMIN' || widget.viewer.role == 'GEOMETRE';

  // Seul le geometre auteur modifie la limite ou emet l'attestation (CA-4).
  bool _isAuthor(ParcelInfo p) =>
      widget.viewer.role == 'GEOMETRE' && p.surveyorId == widget.viewer.id;

  @override
  void initState() {
    super.initState();
    widget.api
        .getParcel(widget.parcelId)
        .then(
          (p) {
            if (mounted) setState(() => _parcel = p);
          },
          onError: (Object e) {
            if (mounted) {
              setState(
                () => _error = e is LandApiException
                    ? e.message
                    : 'Fiche indisponible.',
              );
            }
          },
        );
  }

  Future<void> _loadVersions() async {
    setState(() {
      _loadingVersions = true;
      _versionsError = null;
    });
    try {
      final versions = await widget.api.listVersions(widget.parcelId);
      if (mounted) setState(() => _versions = versions);
    } on LandApiException catch (e) {
      if (mounted) setState(() => _versionsError = e.message);
    } finally {
      if (mounted) setState(() => _loadingVersions = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final p = _parcel;
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Text(_error!, style: TextStyle(color: colors.danger)),
      );
    }
    if (p == null) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final fixed = p.boundaries.where((b) => b.isFixed).length;
    final muted = TextStyle(color: colors.textMuted, fontSize: 14);

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      children: [
        // Wrap : sur un ecran etroit, le badge de certification passe dessous.
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: 8,
          runSpacing: 8,
          children: [
            LegalStatusBadge(legalStatus: p.legalStatus),
            CertificationBadge(certified: p.certified),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          p.id,
          style: TextStyle(
            fontFamily: landMonoFont,
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: colors.text,
          ),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            Text(
              '${formatArea(p.areaM2)} · ${formatMeters(p.perimeterM)}',
              style: muted,
            ),
            Text('$fixed / ${p.boundaries.length} bornes Fixed', style: muted),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'v${p.version} · ${formatDate(p.updatedAt)}${p.locality == null ? '' : ' · ${p.locality}'}',
          style: muted,
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            if (_canSeeHistory)
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: _loadingVersions ? null : _loadVersions,
                  icon: const Icon(Icons.history),
                  label: const Text('Historique'),
                ),
              ),
            if (_canSeeHistory && _isAuthor(p) && widget.onEdit != null)
              const SizedBox(width: 8),
            if (_isAuthor(p) && widget.onEdit != null)
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: () => widget.onEdit!(p),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Modifier'),
                ),
              ),
          ],
        ),
        if (_isAuthor(p) && widget.onAttestation != null) ...[
          const SizedBox(height: 8),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              backgroundColor: colors.primary,
              foregroundColor: colors.onPrimary,
            ),
            onPressed: () => widget.onAttestation!(p),
            icon: const Icon(Icons.description_outlined),
            label: const Text('Attestation de levé'),
          ),
        ],
        if (_versionsError != null) ...[
          const SizedBox(height: 12),
          Text(_versionsError!, style: TextStyle(color: colors.danger)),
        ],
        if (_versions != null) ...[
          const SizedBox(height: 16),
          Text(
            'Historique des versions',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: colors.text,
            ),
          ),
          const SizedBox(height: 8),
          for (final v in _versions!)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(
                backgroundColor: v.version == p.version
                    ? colors.primary
                    : colors.primarySoft,
                child: Text(
                  'v${v.version}',
                  style: TextStyle(
                    fontSize: 12,
                    color: v.version == p.version
                        ? colors.onPrimary
                        : colors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              title: Text(
                '${formatArea(v.areaM2)} · ${formatDateTime(v.createdAt)}',
                style: TextStyle(color: colors.text),
              ),
              subtitle: Text(
                v.reason ?? (v.version == 1 ? 'Création' : 'Sans motif'),
                style: TextStyle(color: colors.textMuted),
              ),
            ),
        ],
        const SizedBox(height: 12),
        Text(
          'Ne vaut pas titre foncier. Statut déclaré lors du levé.',
          style: TextStyle(fontSize: 12, color: colors.textMuted),
        ),
      ],
    );
  }
}
