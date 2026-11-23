import 'package:material_ui/material_ui.dart';

import '../features/account/domain/entities/account_user.dart';
import '../features/account/domain/role_navigation.dart';
import '../features/account/presentation/account_page.dart';
import '../features/account/presentation/viewmodels/auth_controller.dart';
import '../features/gnss/presentation/settings_page.dart';
import '../features/gnss/presentation/missions_page.dart';
import '../features/gnss/presentation/viewmodels/missions_controller.dart';
import '../features/gnss/presentation/viewmodels/projects_admin_controller.dart';
import '../features/gnss/presentation/viewmodels/survey_controller.dart';
import '../features/gnss/presentation/viewmodels/theme_controller.dart';
import '../features/land/land_entry_points.dart';
import '../features/leasing/data/leasing_api.dart';
import '../features/leasing/presentation/leases_page.dart';
import '../features/leasing/presentation/visits_page.dart';
import '../features/map/presentation/parcel_map_page.dart';
import '../features/report/share_survey_plan.dart';
import '../features/map/presentation/viewmodels/parcel_map_controller.dart';
import '../features/sync/presentation/sync_page.dart';
import '../features/sync/presentation/viewmodels/sync_controller.dart';

class AuthenticatedHomeShell extends StatefulWidget {
  const AuthenticatedHomeShell({
    super.key,
    required this.survey,
    required this.theme,
    required this.auth,
    required this.leasingApi,
    required this.syncController,
    this.parcelLoader,
    this.projectsLoader,
    this.projectsAdmin,
    this.land,
  });

  final SurveyController survey;
  final ThemeController theme;
  final AuthController auth;
  final LeasingApi leasingApi;
  final SyncController syncController;

  /// Chargement des parcelles de la carte (GET /parcels). Sans lui, la carte
  /// affiche un message au lieu de la carte.
  final ParcelLoader? parcelLoader;

  /// Chantiers du topographe connecte (GET /projects, CA-7).
  final SurveyProjectsLoader? projectsLoader;

  /// Gestion des chantiers, proposee au geometre (EF-109).
  final ProjectsAdminGateway? projectsAdmin;

  /// Ecrans du module foncier (fiche, verification, demandes de leve,
  /// creation de parcelle). Sans lui, ils ne sont pas proposes.
  final LandServices? land;

  @override
  State<AuthenticatedHomeShell> createState() => _AuthenticatedHomeShellState();
}

class _AuthenticatedHomeShellState extends State<AuthenticatedHomeShell> {
  int _index = 0;
  ParcelMapController? _map;

  LandEntryPoints? get _land =>
      widget.land == null ? null : LandEntryPoints(widget.land!);

  @override
  void initState() {
    super.initState();
    final loader = widget.parcelLoader;
    if (loader != null) _map = ParcelMapController(loader: loader);
  }

  @override
  void dispose() {
    _map?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user!;
    final actions = actionsForRole(
      user.role,
      accountActive: user.accountActive,
    );
    final selectedIndex = _index.clamp(0, actions.length).toInt();
    final pages = [
      for (final action in actions) _pageFor(action),
      SettingsPage(theme: widget.theme),
    ];
    return Scaffold(
      body: IndexedStack(index: selectedIndex, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (index) => setState(() => _index = index),
        destinations: [
          for (final action in actions)
            NavigationDestination(
              icon: Icon(_iconFor(action)),
              selectedIcon: Icon(_selectedIconFor(action)),
              label: _labelFor(action),
            ),
          const NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Parametres',
          ),
        ],
      ),
    );
  }

  Widget _pageFor(AccountAction action) => switch (action) {
    AccountAction.survey => MissionsPage(
      survey: widget.survey,
      projectsLoader: widget.projectsLoader,
      surveyorId: widget.auth.user?.id,
      projectsAdmin: widget.auth.user?.role == AccountRole.geometre
          ? widget.projectsAdmin
          : null,
      planSharer: SurveyPlanSharer(),
      canCreateParcel: _land == null
          ? null
          : (mission) => _land!.canCreateParcel(widget.auth.user!, mission),
      onCreateParcel: _land == null
          ? null
          : (mission) => _land!.openCreateParcel(context, mission),
    ),
    AccountAction.sync => SyncPage(controller: widget.syncController),
    AccountAction.map =>
      _map == null
          ? const ParcelMapUnavailablePage()
          : ParcelMapPage(
              controller: _map!,
              onOpenParcel: _land == null
                  ? null
                  : (parcel) => _land!.openParcel(
                      context,
                      widget.auth.user!,
                      parcel.id,
                    ),
              onVerify: _land == null ? null : () => _land!.openVerify(context),
            ),
    AccountAction.visits => VisitsPage(
      api: widget.leasingApi,
      auth: widget.auth,
    ),
    AccountAction.leasing => LeasesPage(
      api: widget.leasingApi,
      auth: widget.auth,
    ),
    AccountAction.admin => const _AdminUnavailablePage(),
    AccountAction.account => AccountPage(
      auth: widget.auth,
      onAction: _openAction,
      onSurveyRequests:
          _land != null && _land!.showsSurveyRequests(widget.auth.user!)
          ? () => _land!.openSurveyRequests(context, widget.auth.user!)
          : null,
    ),
  };

  void _openAction(AccountAction action) {
    final actions = actionsForRole(
      widget.auth.user!.role,
      accountActive: widget.auth.user!.accountActive,
    );
    final index = actions.indexOf(action);
    if (index >= 0) setState(() => _index = index);
  }

  String _labelFor(AccountAction action) => switch (action) {
    AccountAction.survey => 'Leves',
    AccountAction.sync => 'Sync',
    AccountAction.map => 'Carte',
    AccountAction.visits => 'Visites',
    AccountAction.leasing => 'Baux',
    AccountAction.admin => 'Admin',
    AccountAction.account => 'Compte',
  };

  IconData _iconFor(AccountAction action) => switch (action) {
    AccountAction.survey => Icons.satellite_alt_outlined,
    AccountAction.sync => Icons.sync_outlined,
    AccountAction.map => Icons.map_outlined,
    AccountAction.visits => Icons.home_work_outlined,
    AccountAction.leasing => Icons.assignment_outlined,
    AccountAction.admin => Icons.admin_panel_settings_outlined,
    AccountAction.account => Icons.person_outline,
  };

  IconData _selectedIconFor(AccountAction action) => switch (action) {
    AccountAction.survey => Icons.satellite_alt,
    AccountAction.sync => Icons.sync,
    AccountAction.map => Icons.map,
    AccountAction.visits => Icons.home_work,
    AccountAction.leasing => Icons.assignment,
    AccountAction.admin => Icons.admin_panel_settings,
    AccountAction.account => Icons.person,
  };
}

class _AdminUnavailablePage extends StatelessWidget {
  const _AdminUnavailablePage();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Administration')),
    body: Center(
      child: Text("L'interface mobile d'administration reste a implementer."),
    ),
  );
}
