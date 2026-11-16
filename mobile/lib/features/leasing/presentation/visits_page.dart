import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import '../../account/domain/entities/account_user.dart';
import '../../account/presentation/viewmodels/auth_controller.dart';
import '../data/leasing_api.dart';
import '../domain/entities/leasing_models.dart';

/// Liste des visites (EF-305). Le client demande une visite et suit son
/// statut ; l'agent confirme avec rappel, marque la visite faite ou annule.
/// Le serveur refuse de toute facon les actions non autorisees (EF-402).
class VisitsPage extends StatefulWidget {
  const VisitsPage({super.key, required this.api, required this.auth});

  final LeasingApi api;
  final AuthController auth;

  @override
  State<VisitsPage> createState() => _VisitsPageState();
}

class _VisitsPageState extends State<VisitsPage> {
  List<Visit> _visits = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final visits = await widget.api.listVisits();
      if (mounted) {
        setState(() {
          _visits = visits;
          _loading = false;
        });
      }
    } on LeasingApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _loading = false;
        });
      }
    }
  }

  Future<void> _updateStatus(Visit visit, VisitStatus status) async {
    try {
      final updated = await widget.api.updateVisitStatus(visit.id, status);
      if (mounted) {
        setState(() {
          _visits = [
            for (final item in _visits) item.id == updated.id ? updated : item,
          ];
        });
      }
    } on LeasingApiException catch (error) {
      _showError(error.message);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _requestVisit() async {
    final propertyId = await showDialog<String>(
      context: context,
      builder: (_) => const _PropertyIdDialog(),
    );
    if (propertyId == null || propertyId.trim().isEmpty) return;
    try {
      await widget.api.requestVisit(propertyId.trim());
      await _load();
    } on LeasingApiException catch (error) {
      _showError(error.message);
    }
  }

  bool get _isAgentSide =>
      widget.auth.user?.role == AccountRole.agent ||
      widget.auth.user?.role == AccountRole.admin;

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Visites de biens',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
      ),
      floatingActionButton: _isAgentSide
          ? null
          : FloatingActionButton.extended(
              onPressed: _requestVisit,
              icon: const Icon(Icons.add_home_outlined),
              label: const Text('Demander une visite'),
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(GeoSmartDimens.space4),
                children: [
                  if (_error != null) ...[
                    Text(
                      _error!,
                      style: GeoSmartText.body.copyWith(color: colors.danger),
                    ),
                    const SizedBox(height: GeoSmartDimens.space3),
                  ],
                  if (_visits.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        vertical: GeoSmartDimens.space4,
                      ),
                      child: Text(
                        'Aucune visite pour le moment.',
                        style: GeoSmartText.body.copyWith(
                          color: colors.textMuted,
                        ),
                      ),
                    )
                  else
                    for (final visit in _visits)
                      Card(
                        margin: const EdgeInsets.only(
                          bottom: GeoSmartDimens.space2,
                        ),
                        child: ListTile(
                          title: Text('Bien ${visit.propertyId}'),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Statut : ${visit.status.label}'),
                              if (visit.scheduledAt != null)
                                Text(
                                  'Prevue le '
                                  '${visit.scheduledAt!.toLocal()}',
                                ),
                              if (visit.reminderAt != null)
                                Text(
                                  'Rappel le ${visit.reminderAt!.toLocal()}',
                                ),
                              if (_isAgentSide &&
                                  visit.status == VisitStatus.demandee)
                                Wrap(
                                  children: [
                                    TextButton(
                                      onPressed: () => _updateStatus(
                                        visit,
                                        VisitStatus.confirmee,
                                      ),
                                      child: const Text('Confirmer'),
                                    ),
                                    TextButton(
                                      onPressed: () => _updateStatus(
                                        visit,
                                        VisitStatus.annulee,
                                      ),
                                      child: const Text('Annuler'),
                                    ),
                                  ],
                                )
                              else if (_isAgentSide &&
                                  visit.status == VisitStatus.confirmee)
                                Wrap(
                                  children: [
                                    TextButton(
                                      onPressed: () => _updateStatus(
                                        visit,
                                        VisitStatus.faite,
                                      ),
                                      child: const Text('Marquer faite'),
                                    ),
                                    TextButton(
                                      onPressed: () => _updateStatus(
                                        visit,
                                        VisitStatus.annulee,
                                      ),
                                      child: const Text('Annuler'),
                                    ),
                                  ],
                                )
                              else if (!_isAgentSide &&
                                  visit.status != VisitStatus.annulee &&
                                  visit.status != VisitStatus.faite)
                                TextButton(
                                  onPressed: () => _updateStatus(
                                    visit,
                                    VisitStatus.annulee,
                                  ),
                                  child: const Text('Annuler ma demande'),
                                ),
                            ],
                          ),
                        ),
                      ),
                ],
              ),
            ),
    );
  }
}

class _PropertyIdDialog extends StatefulWidget {
  const _PropertyIdDialog();

  @override
  State<_PropertyIdDialog> createState() => _PropertyIdDialogState();
}

class _PropertyIdDialogState extends State<_PropertyIdDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Demander une visite'),
    content: TextField(
      controller: _controller,
      decoration: const InputDecoration(
        labelText: 'Identifiant du bien',
        helperText: 'Le bien doit etre publie.',
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Annuler'),
      ),
      FilledButton(
        onPressed: () => Navigator.of(context).pop(_controller.text),
        child: const Text('Envoyer'),
      ),
    ],
  );
}
