import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../../app/format/geosmart_formats.dart';
import '../../../app/theme/geosmart_theme.dart';
import '../domain/entities/survey_session.dart';
import '../domain/entities/survey_session_status.dart';
import 'gnss_page.dart';
import '../../report/share_survey_plan.dart';
import 'new_mission_page.dart';
import 'projects_admin_page.dart';
import 'trash_page.dart';
import 'viewmodels/missions_controller.dart';
import 'viewmodels/projects_admin_controller.dart';
import 'viewmodels/survey_controller.dart';

/// Liste des missions locales sous forme de mosaique de cartes carrees.
///
/// Un appui ouvre la mesure de la mission dans le meme [SurveyController].
/// La creation ecrit d'abord la mission vide en local, puis ouvre sa mesure.
class MissionsPage extends StatefulWidget {
  const MissionsPage({
    super.key,
    required this.survey,
    this.missions,
    this.projectsLoader,
    this.surveyorId,
    this.projectsAdmin,
    this.canCreateParcel,
    this.onCreateParcel,
    this.planSharer,
  });

  /// Controleur de mesure partage : une seule mission est active a la fois.
  final SurveyController survey;

  /// ViewModel injecte par les tests. Par defaut, il est construit sur le
  /// depot local du controleur de mesure.
  final MissionsController? missions;

  /// Chantiers du compte connecte (GET /projects) : la mission est creee sur
  /// un chantier choisi (CA-7). Sans lui, GEOSMART_PROJECT_ID s'applique.
  final SurveyProjectsLoader? projectsLoader;

  /// Compte connecte, auteur des missions creees.
  final String? surveyorId;

  /// Gestion des chantiers (geometre) : affiche le bouton Chantiers.
  final ProjectsAdminGateway? projectsAdmin;

  /// Mission prete a devenir une parcelle (geometre, mission terminee).
  final bool Function(SurveySession mission)? canCreateParcel;

  /// Ouvre la creation de la parcelle, mission chargee avec ses bornes.
  final Future<void> Function(SurveySession mission)? onCreateParcel;

  /// Partage du plan PDF d'une mission terminee (EF-108).
  final SurveyPlanSharer? planSharer;

  @override
  State<MissionsPage> createState() => _MissionsPageState();
}

class _MissionsPageState extends State<MissionsPage> {
  late final MissionsController _missions;
  late final bool _ownsMissions;

  @override
  void initState() {
    super.initState();
    _ownsMissions = widget.missions == null;
    _missions =
        widget.missions ??
        MissionsController(
          store: widget.survey.store,
          projectsLoader: widget.projectsLoader,
          surveyorIdProvider: () => widget.surveyorId,
        );
    _missions.addListener(_onMissionsChanged);
    unawaited(_missions.load());
  }

  @override
  void dispose() {
    _missions.removeListener(_onMissionsChanged);
    if (_ownsMissions) _missions.dispose();
    super.dispose();
  }

  void _onMissionsChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _sharePlan(SurveySession mission) async {
    final full = await widget.survey.store.loadSession(mission.id);
    if (!mounted) return;
    if (full == null || full.points.length < 3) {
      _showToast('La mission doit contenir au moins trois bornes.');
      return;
    }
    try {
      await widget.planSharer!.share(full);
    } on Object {
      if (mounted) _showToast('Le plan PDF n a pas pu etre partage.');
    }
  }

  Future<void> _createParcel(SurveySession mission) async {
    final full = await widget.survey.store.loadSession(mission.id);
    if (!mounted) return;
    if (full == null || full.points.length < 3) {
      _showToast('La mission doit contenir au moins trois bornes.');
      return;
    }
    await widget.onCreateParcel!(full);
  }

  Future<void> _openProjects() async {
    final controller = ProjectsAdminController(gateway: widget.projectsAdmin!);
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ProjectsAdminPage(controller: controller),
      ),
    );
    controller.dispose();
  }

  void _showToast(String message) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        duration: const Duration(seconds: 3),
        persist: false,
      ),
    );
  }

  Future<void> _openMission(SurveySession mission) async {
    if (widget.survey.isAveraging) {
      _showToast(
        'Une mesure est en cours. Terminez-la avant de changer de mission.',
      );
      return;
    }

    await widget.survey.openSession(mission.id);
    if (!mounted) return;
    if (widget.survey.session == null) {
      _showToast(widget.survey.error ?? "Mission introuvable sur l'appareil.");
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GnssPage(controller: widget.survey),
      ),
    );
    if (!mounted) return;
    await _missions.load();
  }

  Future<void> _createMission() async {
    final created = await Navigator.of(context).push<SurveySession>(
      MaterialPageRoute<SurveySession>(
        builder: (_) => NewMissionPage(missions: _missions),
      ),
    );
    if (created == null || !mounted) return;
    await _openMission(created);
  }

  Future<void> _openTrash() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => TrashPage(missions: _missions)),
    );
    if (!mounted) return;
    await _missions.load();
  }

  Future<void> _confirmDeleteMission(SurveySession mission) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Deplacer ${mission.title} dans la corbeille ?'),
        content: const Text(
          'La mission sera conservee pendant 7 jours dans la corbeille '
          'avant d etre supprimee definitivement.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Deplacer'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final success = await _missions.deleteMission(mission.id);
    if (!mounted) return;
    if (success) {
      _showToast('Mission deplacee dans la corbeille');
    } else if (_missions.error != null) {
      _showToast(_missions.error!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    final missions = _missions.missions;
    final showFab = !_missions.isLoading && missions.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 72,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Mes missions',
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            Text(
              "Leves enregistres sur l'appareil",
              style: GeoSmartText.caption.copyWith(color: colors.textMuted),
            ),
          ],
        ),
        actions: [
          if (widget.projectsAdmin != null)
            IconButton(
              key: const Key('open-projects-button'),
              tooltip: 'Chantiers',
              onPressed: _openProjects,
              icon: const Icon(Icons.engineering_outlined),
            ),
          IconButton(
            key: const Key('open-trash-button'),
            tooltip: 'Corbeille',
            onPressed: _openTrash,
            icon: Badge(
              isLabelVisible: _missions.trashCount > 0,
              label: Text('${_missions.trashCount}'),
              child: const Icon(Icons.delete_outline),
            ),
          ),
          const SizedBox(width: GeoSmartDimens.space2),
        ],
      ),
      body: _buildBody(colors, missions),
      floatingActionButton: showFab
          ? FloatingActionButton.extended(
              onPressed: _createMission,
              backgroundColor: colors.accent,
              foregroundColor: colors.onAccent,
              shape: const StadiumBorder(),
              icon: const Icon(Icons.add),
              label: const Text('Creer une mission'),
            )
          : null,
    );
  }

  Widget _buildBody(GeoSmartColors colors, List<SurveySession> missions) {
    if (_missions.isLoading && missions.isEmpty) {
      return Center(child: CircularProgressIndicator(color: colors.accent));
    }

    if (_missions.error != null && missions.isEmpty) {
      return _MissionsError(
        colors: colors,
        message: _missions.error!,
        onRetry: _missions.load,
      );
    }

    if (missions.isEmpty) {
      return _EmptyMissions(colors: colors, onCreate: _createMission);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 900
            ? 4
            : constraints.maxWidth >= 600
            ? 3
            : 2;
        return GridView.builder(
          padding: const EdgeInsets.fromLTRB(
            GeoSmartDimens.space4,
            GeoSmartDimens.space4,
            GeoSmartDimens.space4,
            GeoSmartDimens.space16 + GeoSmartDimens.space8,
          ),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: GeoSmartDimens.space3,
            mainAxisSpacing: GeoSmartDimens.space3,
            childAspectRatio: 1,
          ),
          itemCount: missions.length,
          itemBuilder: (context, index) {
            final mission = missions[index];
            return _MissionCard(
              mission: mission,
              colors: colors,
              onTap: () => _openMission(mission),
              onDelete: mission.canDelete
                  ? () => _confirmDeleteMission(mission)
                  : null,
              onSharePlan:
                  widget.planSharer != null &&
                      (mission.status == SurveySessionStatus.completed ||
                          mission.status == SurveySessionStatus.synced)
                  ? () => _sharePlan(mission)
                  : null,
              onCreateParcel:
                  widget.onCreateParcel != null &&
                      (widget.canCreateParcel?.call(mission) ?? false)
                  ? () => _createParcel(mission)
                  : null,
            );
          },
        );
      },
    );
  }
}

class _MissionCard extends StatelessWidget {
  const _MissionCard({
    required this.mission,
    required this.colors,
    required this.onTap,
    this.onDelete,
    this.onCreateParcel,
    this.onSharePlan,
  });

  final SurveySession mission;
  final GeoSmartColors colors;
  final VoidCallback onTap;
  final VoidCallback? onDelete;
  final VoidCallback? onCreateParcel;
  final VoidCallback? onSharePlan;

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusColor, statusBackground) = _statusStyle(
      mission.status,
      colors,
    );
    final points = mission.points.length;
    final area = mission.areaSquareMeters;

    return Material(
      color: colors.surface,
      elevation: 1,
      shadowColor: colors.primary.withValues(alpha: 0.25),
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        side: BorderSide(color: colors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(GeoSmartDimens.space3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _StatusBadge(
                    label: statusLabel,
                    foreground: statusColor,
                    background: statusBackground,
                  ),
                  const SizedBox(width: GeoSmartDimens.space1),
                  Expanded(
                    child: Text(
                      formatDate(mission.createdAt),
                      textAlign: TextAlign.end,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GeoSmartText.caption.copyWith(
                        color: colors.textMuted,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: GeoSmartDimens.space2),
              Expanded(
                child: Text(
                  mission.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GeoSmartText.h3.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(height: GeoSmartDimens.space1),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _MissionMeta(
                          icon: Icons.place_outlined,
                          text: points > 1 ? '$points bornes' : '$points borne',
                          colors: colors,
                        ),
                        if (area != null) ...[
                          const SizedBox(height: GeoSmartDimens.space1),
                          _MissionMeta(
                            icon: Icons.square_foot,
                            text: '${formatDecimal(area)} m2',
                            colors: colors,
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (onSharePlan != null)
                    IconButton(
                      key: Key('share-plan-${mission.id}'),
                      icon: Icon(
                        Icons.picture_as_pdf_outlined,
                        size: 20,
                        color: colors.primary,
                      ),
                      tooltip: 'Partager le plan PDF',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 28,
                        minHeight: 28,
                      ),
                      onPressed: onSharePlan,
                    ),
                  if (onCreateParcel != null)
                    IconButton(
                      key: Key('create-parcel-${mission.id}'),
                      icon: Icon(
                        Icons.add_location_alt_outlined,
                        size: 20,
                        color: colors.primary,
                      ),
                      tooltip: 'Creer la parcelle',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 28,
                        minHeight: 28,
                      ),
                      onPressed: onCreateParcel,
                    ),
                  if (onDelete != null)
                    IconButton(
                      key: Key('delete-mission-${mission.id}'),
                      icon: Icon(
                        Icons.delete_outline,
                        size: 20,
                        color: colors.danger,
                      ),
                      tooltip: 'Supprimer la mission',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 28,
                        minHeight: 28,
                      ),
                      onPressed: onDelete,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  (String, Color, Color) _statusStyle(
    SurveySessionStatus status,
    GeoSmartColors colors,
  ) {
    return switch (status) {
      SurveySessionStatus.draft => (
        'Brouillon',
        colors.textMuted,
        colors.surfaceSunken,
      ),
      SurveySessionStatus.inProgress => (
        'En cours',
        colors.primary,
        colors.primarySoft,
      ),
      SurveySessionStatus.completed => (
        'Terminee',
        colors.warning,
        colors.warningSoft,
      ),
      SurveySessionStatus.synced => (
        'Synchronisee',
        colors.success,
        colors.successSoft,
      ),
    };
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    required this.foreground,
    required this.background,
  });

  final String label;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: GeoSmartDimens.space2,
        vertical: 2,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusPill),
      ),
      child: Text(
        label,
        style: GeoSmartText.caption.copyWith(
          color: foreground,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _MissionMeta extends StatelessWidget {
  const _MissionMeta({
    required this.icon,
    required this.text,
    required this.colors,
  });

  final IconData icon;
  final String text;
  final GeoSmartColors colors;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 14, color: colors.textMuted),
        const SizedBox(width: GeoSmartDimens.space1),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GeoSmartText.caption.copyWith(color: colors.textMuted),
          ),
        ),
      ],
    );
  }
}

class _EmptyMissions extends StatelessWidget {
  const _EmptyMissions({required this.colors, required this.onCreate});

  final GeoSmartColors colors;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(GeoSmartDimens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: colors.primarySoft,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.map_outlined, size: 40, color: colors.primary),
            ),
            const SizedBox(height: GeoSmartDimens.space4),
            Text(
              'Aucune mission',
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            const SizedBox(height: GeoSmartDimens.space2),
            Text(
              'Creez une mission pour commencer le leve de vos bornes.',
              textAlign: TextAlign.center,
              style: GeoSmartText.body.copyWith(color: colors.textMuted),
            ),
            const SizedBox(height: GeoSmartDimens.space5),
            FilledButton.icon(
              onPressed: onCreate,
              style: FilledButton.styleFrom(
                backgroundColor: colors.accent,
                foregroundColor: colors.onAccent,
                minimumSize: const Size(0, GeoSmartDimens.touchMin),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Creer une mission'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MissionsError extends StatelessWidget {
  const _MissionsError({
    required this.colors,
    required this.message,
    required this.onRetry,
  });

  final GeoSmartColors colors;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(GeoSmartDimens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 40, color: colors.danger),
            const SizedBox(height: GeoSmartDimens.space3),
            Text(
              'Missions indisponibles',
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            const SizedBox(height: GeoSmartDimens.space2),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GeoSmartText.body.copyWith(color: colors.textMuted),
            ),
            const SizedBox(height: GeoSmartDimens.space4),
            FilledButton(onPressed: onRetry, child: const Text('Reessayer')),
          ],
        ),
      ),
    );
  }
}
