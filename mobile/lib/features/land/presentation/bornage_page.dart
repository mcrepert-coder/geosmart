import 'package:flutter/material.dart';

import '../domain/entities/bornage.dart';
import 'land_style.dart';

/// Ecran "Bornage contradictoire" (maquette T6, EF-208). Renvoie le bornage
/// saisi par Navigator.pop, ou null si l'utilisateur revient sans enregistrer.
class BornagePage extends StatefulWidget {
  const BornagePage({
    super.key,
    this.initial,
    this.locality,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final Bornage? initial;
  final String? locality;
  final DateTime Function() _clock;

  @override
  State<BornagePage> createState() => _BornagePageState();
}

class _BornagePageState extends State<BornagePage> {
  late final List<Neighbour> _neighbours = [...?widget.initial?.neighbours];
  late final DateTime _heldAt = widget.initial?.heldAt ?? widget._clock();
  String? _error;

  Future<void> _edit([int? index]) async {
    final result = await showModalBottomSheet<Neighbour>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _NeighbourForm(initial: index == null ? null : _neighbours[index]),
    );
    if (result == null) return;
    setState(() {
      if (index == null) {
        _neighbours.add(result);
      } else {
        _neighbours[index] = result;
      }
      _error = null;
    });
  }

  void _save() {
    final bornage = Bornage(
      neighbours: List.unmodifiable(_neighbours),
      heldAt: _heldAt,
    );
    final problem = bornage.validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    Navigator.of(context).pop(bornage);
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.surface,
        foregroundColor: colors.text,
        title: const Text('Bornage contradictoire'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Le ${formatDateTime(_heldAt)}${widget.locality == null ? '' : ' · ${widget.locality}'}',
            style: TextStyle(color: colors.textMuted, fontSize: 15),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Voisins présents',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: colors.text,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: _neighbours.length >= Bornage.maxNeighbours
                    ? null
                    : () => _edit(),
                icon: const Icon(Icons.add),
                label: const Text('Ajouter'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (_neighbours.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                border: Border.all(color: colors.border),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                'Ajoutez chaque voisin, présent ou non, avec le côté de la parcelle qu\'il borde.',
                style: TextStyle(color: colors.textMuted),
              ),
            )
          else
            // Material plutot que Container : l'effet d'appui des ListTile
            // reste visible.
            Material(
              color: colors.surface,
              clipBehavior: Clip.antiAlias,
              shape: RoundedRectangleBorder(
                side: BorderSide(color: colors.border),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < _neighbours.length; i++)
                    _NeighbourTile(
                      neighbour: _neighbours[i],
                      divider: i > 0,
                      onTap: () => _edit(i),
                      onDelete: () => setState(() => _neighbours.removeAt(i)),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 20),
          Text(
            'Photos horodatées',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: colors.text,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surfaceSunken,
              border: Border.all(color: colors.borderStrong),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                Icon(Icons.photo_camera_outlined, color: colors.textMuted),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Les photos seront stockées sur le serveur dans une prochaine version.',
                    style: TextStyle(color: colors.textMuted, fontSize: 14),
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: colors.danger)),
          ],
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: SizedBox(
            height: 56,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: colors.primary,
                foregroundColor: colors.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                textStyle: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              onPressed: _save,
              child: const Text('Enregistrer le bornage'),
            ),
          ),
        ),
      ),
    );
  }
}

class _NeighbourTile extends StatelessWidget {
  const _NeighbourTile({
    required this.neighbour,
    required this.divider,
    required this.onTap,
    required this.onDelete,
  });

  final Neighbour neighbour;
  final bool divider;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final n = neighbour;
    final meta = [
      if (n.phone != null && n.phone!.isNotEmpty) n.phone!,
      'côté ${n.side.label}',
      if (!n.present && n.representedBy != null && n.representedBy!.isNotEmpty)
        'représenté par ${n.representedBy}',
    ].join(' · ');
    return Container(
      decoration: BoxDecoration(
        border: divider ? Border(top: BorderSide(color: colors.border)) : null,
      ),
      child: ListTile(
        minTileHeight: 64,
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: colors.primarySoft,
          child: Text(
            n.side.code,
            style: TextStyle(
              color: colors.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        title: Text(
          n.name,
          style: TextStyle(fontWeight: FontWeight.w600, color: colors.text),
        ),
        subtitle: Text(
          meta,
          style: TextStyle(
            fontSize: 12,
            color: colors.textMuted,
            fontFamily: landMonoFont,
          ),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: n.present ? colors.successSoft : colors.accentSoft,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                n.present ? 'Présent' : 'Absent',
                style: TextStyle(
                  color: n.present ? colors.success : colors.warning,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
            IconButton(
              tooltip: 'Retirer ${n.name}',
              icon: const Icon(Icons.delete_outline),
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

class _NeighbourForm extends StatefulWidget {
  const _NeighbourForm({this.initial});

  final Neighbour? initial;

  @override
  State<_NeighbourForm> createState() => _NeighbourFormState();
}

class _NeighbourFormState extends State<_NeighbourForm> {
  late final _name = TextEditingController(text: widget.initial?.name);
  late final _phone = TextEditingController(
    text: widget.initial?.phone ?? '+228 ',
  );
  late final _rep = TextEditingController(text: widget.initial?.representedBy);
  late NeighbourSide _side = widget.initial?.side ?? NeighbourSide.n;
  late bool _present = widget.initial?.present ?? true;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _rep.dispose();
    super.dispose();
  }

  void _submit() {
    final phone = _phone.text.trim();
    final neighbour = Neighbour(
      name: _name.text,
      side: _side,
      present: _present,
      phone: phone == '+228' || phone.isEmpty ? null : phone,
      representedBy: _present ? null : _rep.text,
    );
    final problem = neighbour.validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    Navigator.of(context).pop(neighbour);
  }

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    InputDecoration deco(String label) => InputDecoration(
      labelText: label,
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
            widget.initial == null ? 'Ajouter un voisin' : 'Modifier le voisin',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: colors.text,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _name,
            decoration: deco('Nom *'),
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            decoration: deco('Téléphone'),
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: 12),
          Text(
            'Côté de la parcelle',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: colors.text,
            ),
          ),
          const SizedBox(height: 6),
          SegmentedButton<NeighbourSide>(
            showSelectedIcon: false,
            segments: [
              for (final s in NeighbourSide.values)
                ButtonSegment(value: s, label: Text(s.code)),
            ],
            selected: {_side},
            onSelectionChanged: (set) => setState(() => _side = set.first),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Présent au bornage'),
            value: _present,
            onChanged: (v) => setState(() => _present = v),
          ),
          if (!_present)
            TextField(controller: _rep, decoration: deco('Représenté par')),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: colors.danger)),
          ],
          const SizedBox(height: 16),
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
              onPressed: _submit,
              child: const Text('Valider'),
            ),
          ),
        ],
      ),
    );
  }
}
