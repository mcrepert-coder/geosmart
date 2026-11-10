import 'package:flutter/material.dart';

import '../../../app/theme/geosmart_theme.dart';
import '../../account/domain/entities/account_user.dart';
import '../../account/presentation/viewmodels/auth_controller.dart';
import '../data/leasing_api.dart';
import '../domain/entities/leasing_models.dart';
import 'inspection_page.dart';

/// Detail d'un bail (EF-307) : echeances, retards et etats des lieux.
/// L'agent du bail ou un administrateur marque un loyer paye ; le locataire
/// ne le peut pas. Le paiement mobile (Flooz, T-Money) reste une interface
/// vide prevue en phase 3 (EF-309).
class LeasePage extends StatefulWidget {
  const LeasePage({
    super.key,
    required this.api,
    required this.auth,
    required this.leaseId,
  });

  final LeasingApi api;
  final AuthController auth;
  final String leaseId;

  @override
  State<LeasePage> createState() => _LeasePageState();
}

class _LeasePageState extends State<LeasePage> {
  Lease? _lease;
  List<Inspection> _inspections = const [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final lease = await widget.api.getLease(widget.leaseId);
      final inspections = await widget.api.listInspections(widget.leaseId);
      if (mounted) {
        setState(() {
          _lease = lease;
          _inspections = inspections;
        });
      }
    } on LeasingApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  bool get _isAgentSide =>
      _lease?.agentId == widget.auth.user?.id ||
      widget.auth.user?.role == AccountRole.admin;

  Future<void> _markPaid(Rent rent) async {
    try {
      await widget.api.markRentPaid(widget.leaseId, rent.id);
      await _load();
    } on LeasingApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    final lease = _lease;
    return Scaffold(
      appBar: AppBar(
        title: Text('Bail', style: GeoSmartText.h2.copyWith(color: colors.text)),
      ),
      body: _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(GeoSmartDimens.space4),
                child: Text(
                  _error!,
                  style: GeoSmartText.body.copyWith(color: colors.danger),
                ),
              ),
            )
          : lease == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(GeoSmartDimens.space4),
                children: [
                  Text(
                    'Bien ${lease.propertyId}',
                    style: GeoSmartText.h3.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: GeoSmartDimens.space1),
                  Text(
                    lease.tenantName == null
                        ? 'Locataire non renseigne'
                        : 'Locataire : ${lease.tenantName}',
                    style: GeoSmartText.body.copyWith(color: colors.textMuted),
                  ),
                  Text(
                    'Loyer mensuel : ${lease.monthlyRent} FCFA, '
                    'a partir du ${lease.startDate}, ${lease.months} mois.',
                    style: GeoSmartText.body.copyWith(color: colors.textMuted),
                  ),
                  const SizedBox(height: GeoSmartDimens.space4),
                  Text(
                    'Echeances',
                    style: GeoSmartText.h3.copyWith(color: colors.text),
                  ),
                  for (final rent in lease.rents)
                    ListTile(
                      dense: true,
                      title: Text('${rent.dueDate} - ${rent.amount} FCFA'),
                      subtitle: Text(rent.status.label),
                      trailing: _isAgentSide && rent.status != RentStatus.payee
                          ? TextButton(
                              onPressed: () => _markPaid(rent),
                              child: const Text('Marquer paye'),
                            )
                          : rent.status == RentStatus.payee
                          ? Icon(Icons.check_circle, color: colors.success)
                          : null,
                    ),
                  const SizedBox(height: GeoSmartDimens.space4),
                  Text(
                    'Etats des lieux',
                    style: GeoSmartText.h3.copyWith(color: colors.text),
                  ),
                  if (_inspections.isEmpty)
                    Text(
                      'Aucun etat des lieux enregistre.',
                      style: GeoSmartText.body.copyWith(color: colors.textMuted),
                    )
                  else
                    for (final inspection in _inspections)
                      ListTile(
                        dense: true,
                        leading: const Icon(Icons.fact_check_outlined),
                        title: Text(inspection.kind.label),
                        subtitle: Text(
                          '${inspection.photos.length} photo(s)'
                          '${inspection.notes == null ? '' : ' - ${inspection.notes}'}',
                        ),
                      ),
                  if (_isAgentSide) ...[
                    const SizedBox(height: GeoSmartDimens.space3),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context)
                          .push(
                            MaterialPageRoute<void>(
                              builder: (_) => InspectionPage(
                                api: widget.api,
                                leaseId: lease.id,
                              ),
                            ),
                          )
                          .then((_) => _load()),
                      icon: const Icon(Icons.draw_outlined),
                      label: const Text('Nouvel etat des lieux'),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
