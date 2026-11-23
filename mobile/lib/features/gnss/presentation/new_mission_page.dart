import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import '../../../app/runtime_config.dart';
import '../domain/entities/survey_session.dart';
import 'viewmodels/missions_controller.dart';

/// Formulaire de creation d'une mission vide.
///
/// La mission est ecrite en local avant d'ouvrir l'ecran de mesure. Le nom
/// saisi devient le titre affiche dans la liste des missions.
class NewMissionPage extends StatefulWidget {
  const NewMissionPage({super.key, required this.missions});

  final MissionsController missions;

  @override
  State<NewMissionPage> createState() => _NewMissionPageState();
}

class _NewMissionPageState extends State<NewMissionPage> {
  final _title = TextEditingController();
  bool _submitting = false;
  String? _error;
  String? _projectId;

  MissionsController get _missions => widget.missions;

  @override
  void initState() {
    super.initState();
    _missions.addListener(_onMissionsChanged);
    if (_missions.choosesProject) _loadProjects();
  }

  @override
  void dispose() {
    _missions.removeListener(_onMissionsChanged);
    _title.dispose();
    super.dispose();
  }

  void _onMissionsChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _loadProjects() async {
    await _missions.loadProjects();
    if (!mounted) return;
    // Un seul chantier : il est choisi d'office.
    final projects = _missions.projects;
    if (_projectId == null && projects.length == 1) {
      setState(() => _projectId = projects.single.id);
    }
  }

  Future<void> _submit() async {
    if (_submitting) return;
    final title = _title.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Le nom de la mission est obligatoire.');
      return;
    }
    if (_missions.choosesProject && _projectId == null) {
      setState(() => _error = 'Choisissez le chantier de la mission.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    final session = await widget.missions.createMission(
      title: title,
      projectId: _projectId,
    );
    if (!mounted) return;
    if (session == null) {
      setState(() {
        _submitting = false;
        _error = widget.missions.error ?? 'La mission n a pas pu etre creee.';
      });
      return;
    }
    Navigator.of(context).pop<SurveySession>(session);
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        title: Text(
          'Nouvelle mission',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(GeoSmartDimens.space4),
          children: [
            Container(
              padding: const EdgeInsets.all(GeoSmartDimens.space4),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
                border: Border.all(color: colors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Nom de la mission',
                    style: GeoSmartText.label.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: GeoSmartDimens.space2),
                  TextField(
                    controller: _title,
                    autofocus: true,
                    enabled: !_submitting,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    style: GeoSmartText.body.copyWith(color: colors.text),
                    decoration: InputDecoration(
                      hintText: 'Leve parcelle A',
                      hintStyle: GeoSmartText.body.copyWith(
                        color: colors.textMuted,
                      ),
                      filled: true,
                      fillColor: colors.surfaceSunken,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: GeoSmartDimens.space3,
                        vertical: GeoSmartDimens.space3,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(
                          GeoSmartDimens.radiusMd,
                        ),
                        borderSide: BorderSide(color: colors.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(
                          GeoSmartDimens.radiusMd,
                        ),
                        borderSide: BorderSide(color: colors.primary, width: 2),
                      ),
                      disabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(
                          GeoSmartDimens.radiusMd,
                        ),
                        borderSide: BorderSide(color: colors.border),
                      ),
                    ),
                  ),
                  const SizedBox(height: GeoSmartDimens.space2),
                  Text(
                    'Ce nom apparaitra dans la liste des missions.',
                    style: GeoSmartText.caption.copyWith(
                      color: colors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            if (_missions.choosesProject) ...[
              const SizedBox(height: GeoSmartDimens.space3),
              _ProjectPicker(
                missions: _missions,
                selected: _projectId,
                enabled: !_submitting,
                onSelected: (id) => setState(() {
                  _projectId = id;
                  _error = null;
                }),
                onRetry: _loadProjects,
              ),
            ],
            const SizedBox(height: GeoSmartDimens.space3),
            Container(
              padding: const EdgeInsets.all(GeoSmartDimens.space3),
              decoration: BoxDecoration(
                color: colors.primarySoft,
                borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline, size: 20, color: colors.primary),
                  const SizedBox(width: GeoSmartDimens.space2),
                  Expanded(
                    child: Text(
                      _missions.choosesProject
                          ? 'La mission sera rattachee au chantier choisi et enregistree sur l appareil avant son envoi. Seuls vos chantiers ouverts sont proposes.'
                          : demoModeEnabled
                          ? 'La mission sera associee au chantier de demonstration et enregistree sur l appareil avant son envoi.'
                          : 'Configurez GEOSMART_PROJECT_ID et GEOSMART_SURVEYOR_ID pour creer une mission. Elle sera enregistree sur l appareil avant son envoi.',
                      style: GeoSmartText.body.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: GeoSmartDimens.space3),
              Container(
                padding: const EdgeInsets.all(GeoSmartDimens.space3),
                decoration: BoxDecoration(
                  color: colors.dangerSoft,
                  borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
                ),
                child: Text(
                  _error!,
                  style: GeoSmartText.body.copyWith(color: colors.danger),
                ),
              ),
            ],
            const SizedBox(height: GeoSmartDimens.space4),
            SizedBox(
              height: GeoSmartDimens.touchField,
              child: FilledButton(
                onPressed: _submitting ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.accent,
                  foregroundColor: colors.onAccent,
                ),
                child: _submitting
                    ? SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: colors.onAccent,
                        ),
                      )
                    : const Text('Creer la mission'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Choix du chantier parmi ceux assignes au topographe (CA-7).
class _ProjectPicker extends StatelessWidget {
  const _ProjectPicker({
    required this.missions,
    required this.selected,
    required this.enabled,
    required this.onSelected,
    required this.onRetry,
  });

  final MissionsController missions;
  final String? selected;
  final bool enabled;
  final ValueChanged<String> onSelected;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    final Widget content;
    if (missions.projectsLoading) {
      content = const Padding(
        padding: EdgeInsets.all(GeoSmartDimens.space3),
        child: Center(child: CircularProgressIndicator()),
      );
    } else if (missions.projectsError != null) {
      content = Row(
        children: [
          Expanded(
            child: Text(
              missions.projectsError!,
              style: GeoSmartText.body.copyWith(color: colors.danger),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Reessayer')),
        ],
      );
    } else if (missions.projects.isEmpty) {
      content = Text(
        'Aucun chantier ouvert ne vous est assigne. Demandez au geometre de vous assigner a un chantier.',
        style: GeoSmartText.body.copyWith(color: colors.textMuted),
      );
    } else {
      content = RadioGroup<String>(
        groupValue: selected,
        onChanged: (id) {
          if (enabled && id != null) onSelected(id);
        },
        child: Column(
          children: [
            for (final project in missions.projects)
              RadioListTile<String>(
                key: ValueKey('chantier-${project.id}'),
                value: project.id,
                enabled: enabled,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  project.title,
                  style: GeoSmartText.body.copyWith(color: colors.text),
                ),
              ),
          ],
        ),
      );
    }
    // Material plutot qu'une boite coloree : les RadioListTile y dessinent
    // leur fond et leurs effets.
    return Material(
      color: colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        side: BorderSide(color: colors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(GeoSmartDimens.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Chantier',
              style: GeoSmartText.label.copyWith(color: colors.text),
            ),
            const SizedBox(height: GeoSmartDimens.space2),
            content,
          ],
        ),
      ),
    );
  }
}
