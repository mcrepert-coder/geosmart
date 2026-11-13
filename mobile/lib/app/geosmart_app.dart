import 'package:flutter/material.dart';

import '../features/account/presentation/login_page.dart';
import '../features/account/presentation/verification_page.dart';
import '../features/account/presentation/viewmodels/auth_controller.dart';
import '../features/gnss/presentation/home_shell.dart';
import '../features/gnss/presentation/viewmodels/missions_controller.dart';
import '../features/gnss/presentation/viewmodels/projects_admin_controller.dart';
import '../features/gnss/presentation/viewmodels/survey_controller.dart';
import '../features/gnss/presentation/viewmodels/theme_controller.dart';
import '../features/leasing/data/leasing_api.dart';
import '../features/map/presentation/viewmodels/parcel_map_controller.dart';
import '../features/sync/presentation/viewmodels/sync_controller.dart';
import 'authenticated_home_shell.dart';
import 'theme/geosmart_theme.dart';

/// Application GeoSmart Field (MVVM).
///
/// La composition est faite dans `main.dart` : la base locale, la mission et
/// la source GNSS sont injectees dans [SurveyController]. La coque d'accueil
/// separe la liste des missions et les parametres, ou l'operateur choisit le
/// theme applique a toutes les pages.
class GeoSmartApp extends StatefulWidget {
  const GeoSmartApp({
    super.key,
    required this.controller,
    this.themeController,
    this.auth,
    this.leasingApi,
    this.syncController,
    this.parcelLoader,
    this.projectsLoader,
    this.projectsAdmin,
  }) : assert(
         auth == null || (leasingApi != null && syncController != null),
         'LeasingApi and SyncController are required when auth is enabled.',
       );

  final SurveyController controller;
  final AuthController? auth;
  final LeasingApi? leasingApi;
  final SyncController? syncController;

  /// Chargement des parcelles pour la carte (EF-406), facultatif.
  final ParcelLoader? parcelLoader;

  /// Chantiers du topographe connecte (GET /projects, CA-7), facultatif.
  final SurveyProjectsLoader? projectsLoader;

  /// Gestion des chantiers par le geometre (EF-109), facultative.
  final ProjectsAdminGateway? projectsAdmin;

  /// Controleur de theme injecte par les tests. Par defaut, l'application en
  /// cree un sur le theme clair.
  final ThemeController? themeController;

  @override
  State<GeoSmartApp> createState() => _GeoSmartAppState();
}

class _GeoSmartAppState extends State<GeoSmartApp> {
  late final ThemeController _theme;
  late final bool _ownsTheme;

  @override
  void initState() {
    super.initState();
    _ownsTheme = widget.themeController == null;
    _theme = widget.themeController ?? ThemeController();
  }

  @override
  void dispose() {
    if (_ownsTheme) _theme.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _theme,
      builder: (context, _) => MaterialApp(
        title: 'GeoSmart Field',
        theme: GeoSmartTheme.light,
        darkTheme: GeoSmartTheme.dark,
        themeMode: _theme.mode,
        debugShowCheckedModeBanner: false,
        home: widget.auth == null
            ? HomeShell(survey: widget.controller, theme: _theme)
            : _authHome(),
      ),
    );
  }

  Widget _authHome() {
    final auth = widget.auth!;
    return ListenableBuilder(
      listenable: auth,
      builder: (context, _) => switch (auth.status) {
        AuthStatus.loading => const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
        AuthStatus.signedOut => LoginPage(auth: auth),
        AuthStatus.pendingVerification ||
        AuthStatus.pendingApproval => VerificationPage(auth: auth),
        AuthStatus.signedIn => AuthenticatedHomeShell(
          survey: widget.controller,
          theme: _theme,
          auth: auth,
          leasingApi: widget.leasingApi!,
          syncController: widget.syncController!,
          parcelLoader: widget.parcelLoader,
          projectsLoader: widget.projectsLoader,
          projectsAdmin: widget.projectsAdmin,
        ),
      },
    );
  }
}
