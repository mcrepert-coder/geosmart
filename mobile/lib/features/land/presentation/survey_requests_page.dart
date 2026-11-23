import 'package:material_ui/material_ui.dart';

import '../data/land_api.dart';
import '../domain/entities/land_models.dart';
import 'land_style.dart';
import 'parcel_sheet.dart';

/// Ecran des demandes de leve (EF-207).
/// AGENT actif : ses demandes et "Nouvelle demande".
/// GEOMETRE : demandes ouvertes et celles qu'il a prises, avec "Prendre".
/// Les autres roles n'ont pas cet ecran : le serveur les refuse de toute facon.
class SurveyRequestsPage extends StatefulWidget {
  const SurveyRequestsPage({
    super.key,
    required this.api,
    required this.viewer,
    this.accountActive = true,
  });

  final LandApi api;
  final LandViewer viewer;

  /// Compte valide par l'administrateur ; requis pour qu'un agent demande.
  final bool accountActive;

  @override
  State<SurveyRequestsPage> createState() => _SurveyRequestsPageState();
}

class _SurveyRequestsPageState extends State<SurveyRequestsPage> {
  List<SurveyRequestInfo>? _requests;
  String? _error;
  String? _takingId;

  bool get _isAgent => widget.viewer.role == 'AGENT';
  bool get _isSurveyor => widget.viewer.role == 'GEOMETRE';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await widget.api.listSurveyRequests();
      if (mounted) {
        setState(() {
          _requests = list;
          _error = null;
        });
      }
    } on LandApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  // Prendre, terminer ou annuler : une action a la fois, puis on recharge.
  Future<void> _act(
    SurveyRequestInfo r,
    Future<SurveyRequestInfo> Function() call,
    String success,
  ) async {
    setState(() => _takingId = r.id);
    try {
      await call();
      _toast(success);
    } on LandApiException catch (e) {
      _toast(
        e.code == 'REQUEST_ALREADY_TAKEN'
            ? 'Un autre géomètre vient de prendre cette demande.'
            : e.message,
      );
    } finally {
      if (mounted) setState(() => _takingId = null);
      await _load();
    }
  }

  // Decision 5 de #24 : prendre une demande ouverte, terminer celle qu'on a
  // prise (geometre) ; annuler la sienne tant qu'elle est ouverte (agent).
  ({String label, bool destructive, VoidCallback onPressed})? _actionFor(
    SurveyRequestInfo r,
  ) {
    if (_isSurveyor && r.state == 'OUVERTE') {
      return (
        label: 'Prendre la demande',
        destructive: false,
        onPressed: () => _act(
          r,
          () => widget.api.takeSurveyRequest(r.id),
          'Demande prise. Prévenez l\'agent pour fixer le rendez-vous.',
        ),
      );
    }
    if (_isSurveyor && r.state == 'PRISE' && r.surveyorId == widget.viewer.id) {
      return (
        label: 'Marquer comme terminée',
        destructive: false,
        onPressed: () => _act(
          r,
          () => widget.api.completeSurveyRequest(r.id),
          'Demande terminée.',
        ),
      );
    }
    if (_isAgent && r.state == 'OUVERTE' && r.agentId == widget.viewer.id) {
      return (
        label: 'Annuler la demande',
        destructive: true,
        onPressed: () => _act(
          r,
          () => widget.api.cancelSurveyRequest(r.id),
          'Demande annulée.',
        ),
      );
    }
    return null;
  }

  Future<void> _create() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RequestForm(api: widget.api),
    );
    if (created == true) {
      _toast('Demande envoyée. Un géomètre inscrit pourra la prendre.');
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final canCreate = _isAgent && widget.accountActive;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        title: Text(_isSurveyor ? 'Demandes de levé' : 'Mes demandes de levé'),
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              backgroundColor: colors.accent,
              foregroundColor: colors.onPrimary,
              onPressed: _create,
              icon: const Icon(Icons.add),
              label: const Text('Nouvelle demande'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          children: [
            if (_isAgent && !widget.accountActive)
              _Banner(
                color: colors.warning,
                text:
                    'Votre compte est en attente de validation : vous pourrez demander un levé une fois activé.',
              ),
            if (_error != null) _Banner(color: colors.danger, text: _error!),
            if (_requests == null && _error == null)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (_requests != null && _requests!.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _isSurveyor
                      ? 'Aucune demande ouverte pour le moment.'
                      : 'Vous n\'avez encore demandé aucun levé.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: colors.textMuted),
                ),
              ),
            for (final r in _requests ?? const <SurveyRequestInfo>[])
              _RequestCard(
                request: r,
                mine: r.surveyorId == widget.viewer.id,
                action: _actionFor(r),
                busy: _takingId == r.id,
              ),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.color, required this.text});

  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.12),
      border: Border.all(color: color),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Text(text, style: TextStyle(color: LandColors.of(context).text)),
  );
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({
    required this.request,
    required this.mine,
    required this.action,
    required this.busy,
  });

  final SurveyRequestInfo request;
  final bool mine;
  final ({String label, bool destructive, VoidCallback onPressed})? action;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final (String label, Color fg, Color bg) = switch (request.state) {
      'OUVERTE' => ('Ouverte', colors.warning, colors.accentSoft),
      'PRISE' => (
        mine ? 'Prise par vous' : 'Prise',
        colors.primary,
        colors.primarySoft,
      ),
      'TERMINEE' => ('Terminée', colors.success, colors.successSoft),
      _ => ('Annulée', colors.textMuted, colors.surfaceSunken),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  request.locality,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: colors.text,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  label,
                  style: TextStyle(
                    color: fg,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(request.description, style: TextStyle(color: colors.text)),
          const SizedBox(height: 6),
          Text(
            'Demandée le ${formatDateTime(request.createdAt)}',
            style: TextStyle(fontSize: 12, color: colors.textMuted),
          ),
          if (action != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: action!.destructive
                  ? OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: colors.danger,
                        side: BorderSide(color: colors.danger),
                      ),
                      onPressed: busy ? null : action!.onPressed,
                      child: Text(busy ? 'Envoi…' : action!.label),
                    )
                  : FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: colors.primary,
                        foregroundColor: colors.onPrimary,
                      ),
                      onPressed: busy ? null : action!.onPressed,
                      child: Text(busy ? 'Envoi…' : action!.label),
                    ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RequestForm extends StatefulWidget {
  const _RequestForm({required this.api});

  final LandApi api;

  @override
  State<_RequestForm> createState() => _RequestFormState();
}

class _RequestFormState extends State<_RequestForm> {
  final _locality = TextEditingController();
  final _description = TextEditingController();
  String? _error;
  bool _sending = false;

  @override
  void dispose() {
    _locality.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final locality = _locality.text.trim();
    final description = _description.text.trim();
    if (locality.isEmpty || description.isEmpty) {
      setState(
        () => _error = 'La localité et la description sont obligatoires.',
      );
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.api.createSurveyRequest(
        locality: locality,
        description: description,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on LandApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _sending = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    InputDecoration deco(String label, {String? hint}) => InputDecoration(
      labelText: label,
      hintText: hint,
      floatingLabelBehavior: FloatingLabelBehavior.always,
      filled: true,
      fillColor: colors.surfaceSunken,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
    );
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        0,
        16,
        16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Demander un levé',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: colors.text,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _locality,
            maxLength: 120,
            decoration: deco('Localité *', hint: 'Baguida, lot 12'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _description,
            maxLength: 1000,
            maxLines: 4,
            decoration: deco(
              'Description *',
              hint: 'Terrain de 600 m² à borner avant vente.',
            ),
          ),
          if (_error != null)
            Text(_error!, style: TextStyle(color: colors.danger)),
          const SizedBox(height: 12),
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
              onPressed: _sending ? null : _submit,
              child: Text(_sending ? 'Envoi…' : 'Envoyer la demande'),
            ),
          ),
        ],
      ),
    );
  }
}
