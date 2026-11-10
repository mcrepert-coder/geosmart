import 'dart:math';

import 'package:flutter/material.dart';

import '../../../app/theme/geosmart_theme.dart';
import '../data/leasing_api.dart';
import '../domain/entities/leasing_models.dart';
import 'widgets/signature_pad.dart';

/// Creation d'un etat des lieux (EF-306) : entree ou sortie, notes et
/// signature du locataire. Le clientId est genere une seule fois pour le
/// formulaire : un renvoi apres echec reseau ne cree pas de doublon (CA-3,
/// RG-08). Les photos horodatees attendent une dependance de capture
/// d'image dans l'application ; le serveur les accepte deja.
class InspectionPage extends StatefulWidget {
  const InspectionPage({super.key, required this.api, required this.leaseId});

  final LeasingApi api;
  final String leaseId;

  @override
  State<InspectionPage> createState() => _InspectionPageState();
}

class _InspectionPageState extends State<InspectionPage> {
  final _clientId = _newClientId();
  final _notes = TextEditingController();
  SignatureData? _signature;
  InspectionKind _kind = InspectionKind.entry;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_signature == null || _signature!.isEmpty) {
      setState(() => _error = 'La signature du locataire est obligatoire.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.createInspection(
        widget.leaseId,
        clientId: _clientId,
        kind: _kind,
        tenantSignatureBase64: _signature!.base64Png,
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      );
      if (mounted) Navigator.of(context).pop();
    } on LeasingApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Etat des lieux',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(GeoSmartDimens.space4),
        children: [
          SegmentedButton<InspectionKind>(
            segments: const [
              ButtonSegment(
                value: InspectionKind.entry,
                label: Text('Entree'),
              ),
              ButtonSegment(
                value: InspectionKind.exit,
                label: Text('Sortie'),
              ),
            ],
            selected: {_kind},
            onSelectionChanged: (selection) =>
                setState(() => _kind = selection.first),
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          TextField(
            controller: _notes,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Notes (facultatif)',
            ),
          ),
          const SizedBox(height: GeoSmartDimens.space3),
          Text(
            'Signature du locataire',
            style: GeoSmartText.label.copyWith(color: colors.text),
          ),
          const SizedBox(height: GeoSmartDimens.space2),
          SignaturePad(
            onChanged: (signature) => setState(() => _signature = signature),
          ),
          if (_error != null) ...[
            const SizedBox(height: GeoSmartDimens.space3),
            Text(
              _error!,
              style: GeoSmartText.body.copyWith(color: colors.danger),
            ),
          ],
          const SizedBox(height: GeoSmartDimens.space4),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Enregistrer'),
          ),
        ],
      ),
    );
  }
}

/// clientId au format UUID v4, sans dependance externe : un renvoi du meme
/// formulaire ne cree pas de doublon cote serveur (CA-3).
String _newClientId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}'
      '-${hex.substring(12, 16)}-${hex.substring(16, 20)}'
      '-${hex.substring(20)}';
}
