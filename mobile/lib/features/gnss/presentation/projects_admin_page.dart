import 'dart:async';

import 'package:flutter/material.dart';

import '../domain/entities/managed_project.dart';
import 'viewmodels/projects_admin_controller.dart';

/// Ecran Chantiers du geometre ou de l'administrateur (EF-109, CA-7).
///
/// Un topographe ne peut envoyer des points que sur un chantier ouvert qui
/// lui est assigne : cet ecran gere ces assignations.
class ProjectsAdminPage extends StatefulWidget {
  const ProjectsAdminPage({super.key, required this.controller});

  final ProjectsAdminController controller;

  @override
  State<ProjectsAdminPage> createState() => _ProjectsAdminPageState();
}

class _ProjectsAdminPageState extends State<ProjectsAdminPage> {
  ProjectsAdminController get _c => widget.controller;

  @override
  void initState() {
    super.initState();
    unawaited(_c.load());
  }

  Future<void> _create() async {
    final title = await showDialog<String>(
      context: context,
      builder: (context) => const _TitleDialog(),
    );
    if (title != null) await _c.create(title);
  }

  Future<void> _assign(ManagedProject project) async {
    final choices = _c.assignableTo(project);
    final topo = await showDialog<ProjectTopographer>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Assigner un topographe'),
        children: [
          if (choices.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Aucun autre topographe actif.'),
            ),
          for (final t in choices)
            SimpleDialogOption(
              key: ValueKey('assigner-${t.id}'),
              onPressed: () => Navigator.of(context).pop(t),
              child: Text(t.label),
            ),
        ],
      ),
    );
    if (topo != null) await _c.assign(project, topo);
  }

  Future<void> _close(ManagedProject project) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clore le chantier ?'),
        content: Text(
          'Les topographes ne pourront plus envoyer de points sur « ${project.title} ».',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Clore'),
          ),
        ],
      ),
    );
    if (ok == true) await _c.close(project);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          title: const Text('Chantiers'),
          actions: [
            IconButton(
              tooltip: 'Actualiser',
              icon: const Icon(Icons.refresh),
              onPressed: _c.loading ? null : () => unawaited(_c.load()),
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _c.busy ? null : _create,
          icon: const Icon(Icons.add),
          label: const Text('Nouveau chantier'),
        ),
        body: _body(context),
      ),
    );
  }

  Widget _body(BuildContext context) {
    if (_c.loading && _c.projects.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
      children: [
        if (_c.busy) const LinearProgressIndicator(),
        if (_c.error != null)
          Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(_c.error!),
            ),
          ),
        if (_c.projects.isEmpty && !_c.loading)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Aucun chantier. Créez-en un, puis assignez-y les topographes '
              'qui feront le levé.',
              textAlign: TextAlign.center,
            ),
          ),
        for (final project in _c.projects)
          _ProjectCard(
            project: project,
            enabled: !_c.busy,
            onAssign: () => _assign(project),
            onUnassign: (topo) => _c.unassign(project, topo),
            onClose: () => _close(project),
          ),
      ],
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({
    required this.project,
    required this.enabled,
    required this.onAssign,
    required this.onUnassign,
    required this.onClose,
  });

  final ManagedProject project;
  final bool enabled;
  final VoidCallback onAssign;
  final ValueChanged<ProjectTopographer> onUnassign;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      key: ValueKey('chantier-${project.id}'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    project.title,
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                Chip(label: Text(project.open ? 'Ouvert' : 'Clos')),
              ],
            ),
            Text(
              '${project.missionsCount} mission(s) reçue(s)',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (project.topographers.isEmpty)
                  const Text('Aucun topographe assigné.'),
                for (final topo in project.topographers)
                  InputChip(
                    label: Text(topo.label),
                    onDeleted: enabled && project.open
                        ? () => onUnassign(topo)
                        : null,
                    deleteButtonTooltipMessage: 'Retirer',
                  ),
              ],
            ),
            if (project.open)
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: enabled ? onClose : null,
                    icon: const Icon(Icons.lock_outline),
                    label: const Text('Clore'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: enabled ? onAssign : null,
                    icon: const Icon(Icons.person_add_alt),
                    label: const Text('Assigner'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _TitleDialog extends StatefulWidget {
  const _TitleDialog();

  @override
  State<_TitleDialog> createState() => _TitleDialogState();
}

class _TitleDialogState extends State<_TitleDialog> {
  final _title = TextEditingController();

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Nouveau chantier'),
    content: TextField(
      controller: _title,
      autofocus: true,
      maxLength: 200,
      decoration: const InputDecoration(labelText: 'Nom du chantier'),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Annuler'),
      ),
      FilledButton(
        onPressed: () => Navigator.of(context).pop(_title.text),
        child: const Text('Créer'),
      ),
    ],
  );
}
