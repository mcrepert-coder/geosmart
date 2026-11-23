import 'package:material_ui/material_ui.dart';

import '../data/parcel_status_api.dart';
import '../data/parcel_status_cache.dart';
import '../domain/entities/parcel_public_status.dart';
import '../domain/usecases/check_parcel.dart';
import 'land_style.dart';
import 'widgets/land_badges.dart';

/// Ecran "Verifier avant d'acheter" (maquette C1, EF-206), pour le client.
/// Le dernier resultat consulte reste affiche hors ligne avec sa date.
class VerifyParcelPage extends StatefulWidget {
  const VerifyParcelPage({
    super.key,
    required this.checkParcel,
    required this.cache,
  });

  final CheckParcel checkParcel;
  final ParcelStatusCache cache;

  @override
  State<VerifyParcelPage> createState() => _VerifyParcelPageState();
}

class _VerifyParcelPageState extends State<VerifyParcelPage> {
  final _controller = TextEditingController();
  String? _error;
  bool _loading = false;
  CheckOutcome? _outcome;

  @override
  void initState() {
    super.initState();
    widget.cache.latest().then((cached) {
      if (mounted && cached != null && _outcome == null) {
        setState(() {
          _outcome = OfflineResult(cached);
          _controller.text = cached.status.id;
        });
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String? _validate(String id) {
    if (id.isEmpty) return "Saisissez l'identifiant de la parcelle.";
    if (!parcelIdPattern.hasMatch(id)) {
      return 'Format attendu : TG, la commune et le numéro, par exemple TG-AG3-00457.';
    }
    return null;
  }

  Future<void> _submit() async {
    final id = _controller.text.trim().toUpperCase();
    final problem = _validate(id);
    setState(() => _error = problem);
    if (problem != null) return;
    _controller.text = id;
    setState(() => _loading = true);
    final outcome = await widget.checkParcel(id);
    if (!mounted) return;
    setState(() {
      _outcome = outcome;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              "Vérifier avant d'acheter",
              style: TextStyle(
                fontSize: 28,
                height: 36 / 28,
                fontWeight: FontWeight.w700,
                color: colors.text,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    textCapitalization: TextCapitalization.characters,
                    autocorrect: false,
                    style: TextStyle(
                      fontSize: 17,
                      fontFamily: landMonoFont,
                      color: colors.text,
                    ),
                    decoration: InputDecoration(
                      labelText: 'Identifiant de parcelle',
                      floatingLabelBehavior: FloatingLabelBehavior.always,
                      hintText: 'TG-AG3-00457',
                      errorText: _error,
                      errorMaxLines: 3,
                      filled: true,
                      fillColor: colors.surfaceSunken,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onSubmitted: (_) => _submit(),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 56,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.primary,
                      foregroundColor: colors.onPrimary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: _loading ? null : _submit,
                    child: Text(_loading ? 'Recherche…' : 'Vérifier'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              "L'identifiant figure sur l'annonce et sur l'attestation de levé.",
              style: TextStyle(fontSize: 12, color: colors.textMuted),
            ),
            const SizedBox(height: 20),
            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else
              ..._result(context),
          ],
        ),
      ),
    );
  }

  List<Widget> _result(BuildContext context) {
    final colors = LandColors.of(context);
    return switch (_outcome) {
      null => const [],
      CheckFailed(:final kind, :final message) => [
        _Alert(
          icon: Icons.warning_amber_outlined,
          color: kind == ParcelStatusFailure.notFound
              ? colors.warning
              : colors.danger,
          title: kind == ParcelStatusFailure.notFound
              ? 'Aucune parcelle enregistrée sous cet identifiant'
              : 'Vérification impossible',
          body: kind == ParcelStatusFailure.notFound
              ? "Vérifiez l'identifiant. Une parcelle absente de GeoSmart n'est ni bonne ni mauvaise : renseignez-vous auprès de l'ANDF."
              : '$message Aucun résultat gardé sur l\'appareil pour cette parcelle.',
        ),
      ],
      FreshResult(:final status, :final consultedAt) => _statusWidgets(
        context,
        status,
        consultedAt,
        offline: false,
      ),
      OfflineResult(:final cached) => _statusWidgets(
        context,
        cached.status,
        cached.consultedAt,
        offline: true,
      ),
    };
  }

  List<Widget> _statusWidgets(
    BuildContext context,
    ParcelPublicStatus s,
    DateTime consultedAt, {
    required bool offline,
  }) {
    final colors = LandColors.of(context);
    return [
      if (offline)
        _Alert(
          icon: Icons.cloud_off_outlined,
          color: colors.warning,
          title: 'Résultat gardé sur l\'appareil',
          body:
              'Consulté le ${formatDateTime(consultedAt)}. Il a pu changer depuis : vérifiez à nouveau avec une connexion.',
        ),
      if (offline) const SizedBox(height: 12),
      _StatusCard(status: s),
      if (s.inDispute) ...[
        const SizedBox(height: 12),
        _Alert(
          icon: Icons.balance_outlined,
          color: colors.warning,
          title:
              'Litige signalé${s.statusDate != null ? ' le ${formatPlainDate(s.statusDate!)}' : ''}',
          body:
              s.disputeNote ??
              'Renseignez-vous auprès des autorités compétentes avant tout versement.',
        ),
      ],
      const SizedBox(height: 12),
      const LandNotice(text: "NE VAUT PAS TITRE FONCIER · CONSULTEZ L'ANDF"),
      if (!offline) ...[
        const SizedBox(height: 10),
        Row(
          children: [
            Icon(
              Icons.download_done_outlined,
              size: 16,
              color: colors.textMuted,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Résultat gardé sur l\'appareil · consulté le ${formatDateTime(consultedAt)}',
                style: TextStyle(fontSize: 12, color: colors.textMuted),
              ),
            ),
          ],
        ),
      ],
    ];
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.status});

  final ParcelPublicStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final s = status;
    Widget row(String label, Widget value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: colors.textMuted, fontSize: 15),
            ),
          ),
          value,
        ],
      ),
    );
    TextStyle strong = TextStyle(
      fontWeight: FontWeight.w600,
      fontSize: 15,
      color: colors.text,
    );
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  s.id,
                  style: TextStyle(
                    fontFamily: landMonoFont,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: colors.text,
                  ),
                ),
              ),
              LegalStatusBadge(legalStatus: s.legalStatus),
            ],
          ),
          const SizedBox(height: 8),
          row('Surface levée', Text(formatArea(s.areaM2), style: strong)),
          row(
            'Dernier levé',
            Text(
              '${formatDate(s.lastSurveyAt)} · v${s.version}',
              style: strong,
            ),
          ),
          row('Certification', CertificationBadge(certified: s.certified)),
          row(
            'Bornage contradictoire',
            Text(
              s.bornage == null
                  ? 'Non renseigné'
                  : '${s.bornage!.neighboursPresent} voisin${s.bornage!.neighboursPresent > 1 ? 's' : ''} sur ${s.bornage!.neighboursTotal}',
              style: strong,
            ),
          ),
          if (s.titleNumber != null)
            row(
              'N° de titre',
              Text(
                s.titleNumber!,
                style: strong.copyWith(fontFamily: landMonoFont),
              ),
            ),
          row(
            'Source du statut',
            Flexible(
              child: Text(
                s.statusSource == null
                    ? 'Aucune source autorisée'
                    : '${s.statusSource}${s.statusDate != null ? ', ${formatPlainDate(s.statusDate!)}' : ''}',
                textAlign: TextAlign.right,
                style: strong,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Alert extends StatelessWidget {
  const _Alert({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: colors.text,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    body,
                    style: TextStyle(color: colors.text, fontSize: 15),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
