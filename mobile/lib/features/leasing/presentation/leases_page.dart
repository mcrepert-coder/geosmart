import 'package:flutter/material.dart';

import '../../../app/theme/geosmart_theme.dart';
import '../../account/domain/entities/account_user.dart';
import '../../account/presentation/viewmodels/auth_controller.dart';
import '../data/leasing_api.dart';
import 'lease_page.dart';

/// Point d'entree des baux (EF-307). Il n'y a pas de route de liste cote
/// serveur : un bail s'ouvre par son identifiant, et un agent en cree un
/// nouveau. Un client ne cree pas de bail : le bouton est masque (EF-402)
/// et le serveur refuse de toute facon.
class LeasesPage extends StatefulWidget {
  const LeasesPage({super.key, required this.api, required this.auth});

  final LeasingApi api;
  final AuthController auth;

  @override
  State<LeasesPage> createState() => _LeasesPageState();
}

class _LeasesPageState extends State<LeasesPage> {
  final _leaseIdController = TextEditingController();

  @override
  void dispose() {
    _leaseIdController.dispose();
    super.dispose();
  }

  bool get _isAgent => widget.auth.user?.role == AccountRole.agent;

  Future<void> _openLease(String leaseId) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LeasePage(
          api: widget.api,
          auth: widget.auth,
          leaseId: leaseId,
        ),
      ),
    );
  }

  Future<void> _createLease() async {
    final lease = await showDialog<LeaseDraft>(
      context: context,
      builder: (_) => const _CreateLeaseDialog(),
    );
    if (lease == null) return;
    try {
      final created = await widget.api.createLease(
        propertyId: lease.propertyId,
        monthlyRent: lease.monthlyRent,
        startDate: lease.startDate,
        months: lease.months,
        tenantName: lease.tenantName,
      );
      if (mounted) await _openLease(created.id);
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
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Baux et loyers',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(GeoSmartDimens.space4),
        children: [
          TextField(
            controller: _leaseIdController,
            decoration: const InputDecoration(
              labelText: 'Identifiant du bail',
            ),
          ),
          const SizedBox(height: GeoSmartDimens.space2),
          OutlinedButton.icon(
            onPressed: () => _openLease(_leaseIdController.text.trim()),
            icon: const Icon(Icons.search),
            label: const Text('Ouvrir le bail'),
          ),
          if (_isAgent) ...[
            const SizedBox(height: GeoSmartDimens.space4),
            FilledButton.icon(
              onPressed: _createLease,
              icon: const Icon(Icons.assignment_add),
              label: const Text('Enregistrer un nouveau bail'),
            ),
          ],
        ],
      ),
    );
  }
}

class LeaseDraft {
  const LeaseDraft({
    required this.propertyId,
    required this.monthlyRent,
    required this.startDate,
    required this.months,
    this.tenantName,
  });

  final String propertyId;
  final int monthlyRent;
  final String startDate;
  final int months;
  final String? tenantName;
}

class _CreateLeaseDialog extends StatefulWidget {
  const _CreateLeaseDialog();

  @override
  State<_CreateLeaseDialog> createState() => _CreateLeaseDialogState();
}

class _CreateLeaseDialogState extends State<_CreateLeaseDialog> {
  final _propertyId = TextEditingController();
  final _monthlyRent = TextEditingController();
  final _startDate = TextEditingController();
  final _months = TextEditingController();
  final _tenantName = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _propertyId.dispose();
    _monthlyRent.dispose();
    _startDate.dispose();
    _months.dispose();
    _tenantName.dispose();
    super.dispose();
  }

  void _submit() {
    final monthlyRent = int.tryParse(_monthlyRent.text.trim());
    final months = int.tryParse(_months.text.trim());
    if (_propertyId.text.trim().isEmpty ||
        monthlyRent == null ||
        monthlyRent < 0 ||
        months == null ||
        months < 1 ||
        months > 120 ||
        !_datePattern.hasMatch(_startDate.text.trim())) {
      setState(
        () => _error =
            'Verifiez les champs : loyer entier, duree de 1 a 120 mois, '
            'date au format AAAA-MM-JJ.',
      );
      return;
    }
    Navigator.of(context).pop(
      LeaseDraft(
        propertyId: _propertyId.text.trim(),
        monthlyRent: monthlyRent,
        startDate: _startDate.text.trim(),
        months: months,
        tenantName: _tenantName.text.trim().isEmpty
            ? null
            : _tenantName.text.trim(),
      ),
    );
  }

  static final RegExp _datePattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Nouveau bail'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_error != null) ...[
            Text(_error!, style: GeoSmartText.caption),
            const SizedBox(height: GeoSmartDimens.space2),
          ],
          TextField(
            controller: _propertyId,
            decoration: const InputDecoration(labelText: 'Identifiant du bien'),
          ),
          TextField(
            controller: _tenantName,
            decoration: const InputDecoration(
              labelText: 'Nom du locataire (facultatif)',
            ),
          ),
          TextField(
            controller: _monthlyRent,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Loyer mensuel (FCFA)',
            ),
          ),
          TextField(
            controller: _startDate,
            decoration: const InputDecoration(
              labelText: 'Date de debut',
              hintText: 'AAAA-MM-JJ',
            ),
          ),
          TextField(
            controller: _months,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Duree (mois)'),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Annuler'),
      ),
      FilledButton(onPressed: _submit, child: const Text('Enregistrer')),
    ],
  );
}
