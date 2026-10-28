import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/land_api.dart';
import '../domain/entities/land_models.dart';
import 'land_style.dart';
import 'widgets/land_badges.dart';

/// Une condition de RG-03, avec ce qu'il faut faire si elle n'est pas remplie.
class GateCondition {
  const GateCondition({
    required this.ok,
    required this.title,
    required this.detail,
  });

  final bool ok;
  final String title;
  final String detail;
}

/// Conditions d'emission (RG-03) : geometre inscrit, toutes bornes en RTK
/// Fixed, parcelle acceptee par le serveur (donc sans chevauchement).
List<GateCondition> attestationConditions({
  required bool registeredSurveyor,
  required ParcelInfo? parcel,
  required bool serverReachable,
}) {
  final boundaries = parcel?.boundaries ?? const <BoundaryInfo>[];
  final fixed = boundaries.where((b) => b.isFixed).length;
  final notFixed = boundaries.where((b) => !b.isFixed).map((b) => b.name);
  final pdops = boundaries.map((b) => b.pdop).whereType<double>();
  return [
    GateCondition(
      ok: registeredSurveyor,
      title: registeredSurveyor
          ? "Géomètre inscrit à l'Ordre"
          : "Géomètre non inscrit à l'Ordre",
      detail: registeredSurveyor
          ? 'Inscription vérifiée par l\'administrateur.'
          : 'Seul un géomètre inscrit peut émettre une attestation. Ce levé porte la mention « non certifié ».',
    ),
    GateCondition(
      ok: boundaries.isNotEmpty && fixed == boundaries.length,
      title: '$fixed / ${boundaries.length} bornes en RTK Fixed',
      detail: notFixed.isEmpty
          ? (pdops.isEmpty
                ? 'Toutes les bornes sont en RTK Fixed.'
                : 'PDOP max ${pdops.reduce((a, b) => a > b ? a : b).toStringAsFixed(1).replaceAll('.', ',')}')
          : 'Reprenez ${notFixed.join(', ')} en RTK Fixed, puis modifiez la parcelle.',
    ),
    GateCondition(
      ok: parcel != null,
      title: 'Aucun conflit serveur',
      detail: parcel != null
          ? 'Parcelle acceptée par le serveur, sans chevauchement (vérifié le ${formatDateTime(parcel.updatedAt)}).'
          : serverReachable
          ? 'Le serveur ne connaît pas cette parcelle : mettez-la en file d\'envoi et attendez sa synchronisation.'
          : 'En attente de synchronisation : connectez-vous pour vérifier.',
    ),
  ];
}

/// Ecran "Attestation de leve" (maquette T8, EF-204, RG-03, RG-09). Le bouton
/// n'est actif que si les trois conditions sont remplies ; le serveur les
/// verifie de nouveau a l'emission.
class AttestationGatePage extends StatefulWidget {
  const AttestationGatePage({
    super.key,
    required this.parcelId,
    required this.api,
    required this.registeredSurveyor,
  });

  final String parcelId;
  final LandApi api;
  final bool registeredSurveyor;

  @override
  State<AttestationGatePage> createState() => _AttestationGatePageState();
}

class _AttestationGatePageState extends State<AttestationGatePage> {
  ParcelInfo? _parcel;
  bool _loading = true;
  bool _serverReachable = true;
  bool _issuing = false;
  String? _issueError;
  AttestationInfo? _issued;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final parcel = await widget.api.getParcel(widget.parcelId);
      if (!mounted) return;
      setState(() {
        _parcel = parcel;
        _serverReachable = true;
      });
    } on LandApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _parcel = null;
        _serverReachable = !e.isNetwork;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _issue() async {
    setState(() {
      _issuing = true;
      _issueError = null;
    });
    try {
      final issued = await widget.api.issueAttestation(widget.parcelId);
      if (mounted) setState(() => _issued = issued);
    } on LandApiException catch (e) {
      if (mounted) setState(() => _issueError = e.message);
    } finally {
      if (mounted) setState(() => _issuing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final conditions = attestationConditions(
      registeredSurveyor: widget.registeredSurveyor,
      parcel: _parcel,
      serverReachable: _serverReachable,
    );
    final allOk = conditions.every((c) => c.ok);
    final parcel = _parcel;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Attestation de levé'),
            Text(
              parcel == null
                  ? widget.parcelId
                  : '${parcel.id} · version ${parcel.version}',
              style: TextStyle(
                fontSize: 12,
                fontFamily: landMonoFont,
                color: colors.textMuted,
              ),
            ),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _Checklist(conditions: conditions),
                  if (parcel != null) ...[
                    const SizedBox(height: 20),
                    Text(
                      'APERÇU DU PDF',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                        color: colors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _PdfPreview(parcel: parcel),
                    const SizedBox(height: 8),
                    _HashButton(
                      label: 'Empreinte du polygone',
                      hash: parcel.geometryHash,
                    ),
                  ],
                  if (_issued != null) ...[
                    const SizedBox(height: 16),
                    _IssuedCard(attestation: _issued!),
                  ],
                  if (_issueError != null) ...[
                    const SizedBox(height: 16),
                    Text(_issueError!, style: TextStyle(color: colors.danger)),
                  ],
                  const SizedBox(height: 16),
                  const LandNotice(text: 'NE VAUT PAS TITRE FONCIER'),
                ],
              ),
            ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: double.infinity,
                height: 56,
                child: FilledButton.icon(
                  style: ButtonStyle(
                    shape: WidgetStatePropertyAll(
                      RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    textStyle: const WidgetStatePropertyAll(
                      TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
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
                  icon: const Icon(Icons.description_outlined),
                  label: Text(
                    _issuing ? 'Émission…' : "Émettre l'attestation de levé",
                  ),
                  onPressed: allOk && !_issuing && _issued == null
                      ? _issue
                      : null,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                allOk
                    ? "L'émission est journalisée. Le PDF se partage par lien ou par fichier."
                    : 'Disponible quand les trois conditions sont remplies.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: colors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Checklist extends StatelessWidget {
  const _Checklist({required this.conditions});

  final List<GateCondition> conditions;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          for (var i = 0; i < conditions.length; i++)
            Container(
              decoration: BoxDecoration(
                border: i == 0
                    ? null
                    : Border(top: BorderSide(color: colors.border)),
              ),
              padding: const EdgeInsets.all(14),
              child: Semantics(
                label:
                    '${conditions[i].ok ? 'Condition remplie' : 'Condition non remplie'} : ${conditions[i].title}',
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      conditions[i].ok ? Icons.check : Icons.close,
                      color: conditions[i].ok ? colors.success : colors.danger,
                      size: 22,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            conditions[i].title,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: colors.text,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            conditions[i].detail,
                            style: TextStyle(
                              fontSize: 13,
                              color: colors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PdfPreview extends StatelessWidget {
  const _PdfPreview({required this.parcel});

  final ParcelInfo parcel;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF1B2A33);
    const mono = TextStyle(fontFamily: landMonoFont, fontSize: 11, color: ink);
    // Apercu sur fond blanc, comme le papier, quel que soit le theme.
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1F115471),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'ATTESTATION DE LEVÉ',
                  style: TextStyle(
                    color: Color(0xFF115471),
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(border: Border.all(color: ink)),
                child: const Text(
                  'NE VAUT PAS TITRE FONCIER',
                  style: TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w700,
                    color: ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _field('Parcelle', parcel.id)),
              Expanded(child: _field('Surface', formatArea(parcel.areaM2))),
              Expanded(
                child: _field('Périmètre', formatMeters(parcel.perimeterM)),
              ),
            ],
          ),
          const Divider(height: 18),
          for (final b in parcel.boundaries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 1),
              child: Row(
                children: [
                  SizedBox(width: 36, child: Text(b.name, style: mono)),
                  Expanded(
                    child: Text(
                      b.isFixed ? 'Fixed' : b.fixQuality,
                      style: mono,
                    ),
                  ),
                  if (b.pdop != null)
                    Text('PDOP ${b.pdop!.toStringAsFixed(1)}', style: mono),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _field(String label, String value) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: const TextStyle(fontSize: 9, color: Color(0xFF5B6B75)),
      ),
      Text(
        value,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: Color(0xFF1B2A33),
        ),
      ),
    ],
  );
}

/// gs-hash : 8 + 8 caracteres, appui = copie de l'empreinte complete.
class _HashButton extends StatelessWidget {
  const _HashButton({required this.label, required this.hash});

  final String label;
  final String hash;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final short = hash.length > 16
        ? '${hash.substring(0, 8)}…${hash.substring(hash.length - 8)}'
        : hash;
    return Semantics(
      button: true,
      label: '$label : copier l\'empreinte complète',
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () async {
          await Clipboard.setData(ClipboardData(text: hash));
          if (context.mounted) {
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(const SnackBar(content: Text('Empreinte copiée')));
          }
        },
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: colors.surfaceSunken,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.copy, size: 16, color: colors.text),
              const SizedBox(width: 8),
              Text(
                'SHA-256 $short',
                style: TextStyle(
                  fontFamily: landMonoFont,
                  fontSize: 12,
                  color: colors.text,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _IssuedCard extends StatelessWidget {
  const _IssuedCard({required this.attestation});

  final AttestationInfo attestation;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.successSoft,
        border: Border.all(color: colors.success),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.check_circle_outline, color: colors.success),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Attestation ${attestation.number} émise',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: colors.text,
                    fontSize: 16,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Le ${formatDateTime(attestation.issuedAt)}, pour la version ${attestation.parcelVersion}. '
            'Conservez le PDF : son empreinte permet de le vérifier.',
            style: TextStyle(color: colors.text),
          ),
          const SizedBox(height: 8),
          _HashButton(
            label: 'Empreinte du document',
            hash: attestation.documentHash,
          ),
        ],
      ),
    );
  }
}
