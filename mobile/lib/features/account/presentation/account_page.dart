import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import '../domain/entities/account_user.dart';
import '../domain/role_navigation.dart';
import 'viewmodels/auth_controller.dart';

/// Libelle francais d'un role, sans accent sur les capitales.
String roleLabel(AccountRole role) => switch (role) {
  AccountRole.admin => 'Administrateur',
  AccountRole.geometre => 'Geometre',
  AccountRole.topographe => 'Topographe',
  AccountRole.agent => 'Agent immobilier',
  AccountRole.client => 'Client',
};

String _actionLabel(AccountAction action) => switch (action) {
  AccountAction.survey => 'Leves GNSS',
  AccountAction.sync => 'Synchronisation',
  AccountAction.map => 'Carte des parcelles',
  AccountAction.visits => 'Visites de biens',
  AccountAction.leasing => 'Baux et loyers',
  AccountAction.admin => 'Espace administrateur',
  AccountAction.account => 'Mon compte',
};

IconData _actionIcon(AccountAction action) => switch (action) {
  AccountAction.survey => Icons.satellite_alt_outlined,
  AccountAction.sync => Icons.sync_outlined,
  AccountAction.map => Icons.map_outlined,
  AccountAction.visits => Icons.home_work_outlined,
  AccountAction.leasing => Icons.assignment_outlined,
  AccountAction.admin => Icons.admin_panel_settings_outlined,
  AccountAction.account => Icons.person_outline,
};

/// Ecran du compte connecte et menu par role (EF-402) : seules les actions
/// permises sont affichees ; le serveur refuse de toute facon le reste.
/// La composition des destinations est faite par la coque de navigation :
/// [onAction] est appele pour chaque action choisie, sauf "Mon compte" qui
/// est l'ecran courant.
class AccountPage extends StatelessWidget {
  const AccountPage({
    super.key,
    required this.auth,
    this.onAction,
    this.onSurveyRequests,
  });

  final AuthController auth;
  final void Function(AccountAction action)? onAction;

  /// Demandes de leve du module foncier (EF-209), pour l'agent et le
  /// geometre.
  final VoidCallback? onSurveyRequests;

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Mon compte',
          style: GeoSmartText.h2.copyWith(color: colors.text),
        ),
        actions: [
          IconButton(
            tooltip: 'Se deconnecter',
            icon: const Icon(Icons.logout),
            onPressed: () => auth.logout(),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: auth,
        builder: (context, _) {
          final user = auth.user;
          if (user == null) {
            return const Center(child: CircularProgressIndicator());
          }
          var actions = actionsForRole(
            user.role,
            accountActive: user.accountActive,
          );
          // Ces trois actions sont deja dans la barre de navigation du
          // geometre : on evite les raccourcis redondants sur cette page.
          if (user.role == AccountRole.geometre) {
            actions = actions
                .where(
                  (a) =>
                      a != AccountAction.survey &&
                      a != AccountAction.map &&
                      a != AccountAction.sync,
                )
                .toList();
          }
          return ListView(
            padding: const EdgeInsets.all(GeoSmartDimens.space4),
            children: [
              Text(
                user.fullName ?? user.id,
                style: GeoSmartText.h3.copyWith(color: colors.text),
              ),
              const SizedBox(height: GeoSmartDimens.space1),
              Text(
                '${roleLabel(user.role)}'
                '${user.registeredSurveyor ? ' - inscrit a l Ordre' : ''}',
                style: GeoSmartText.body.copyWith(color: colors.textMuted),
              ),
              if (!user.accountActive) ...[
                const SizedBox(height: GeoSmartDimens.space3),
                Text(
                  'Compte en attente de validation ou suspendu : les actions '
                  'sont bloquees par le serveur. Deposez vos pieces '
                  'justificatives depuis le site (Mon compte).',
                  style: GeoSmartText.body.copyWith(color: colors.danger),
                ),
              ],
              const SizedBox(height: GeoSmartDimens.space4),
              for (final action in actions.where(
                (a) => a != AccountAction.account,
              ))
                Card(
                  margin: const EdgeInsets.only(bottom: GeoSmartDimens.space2),
                  child: ListTile(
                    leading: Icon(_actionIcon(action)),
                    title: Text(_actionLabel(action)),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: onAction == null ? null : () => onAction!(action),
                  ),
                ),
              if (onSurveyRequests != null)
                Card(
                  margin: const EdgeInsets.only(bottom: GeoSmartDimens.space2),
                  child: ListTile(
                    key: const Key('open-survey-requests'),
                    leading: const Icon(Icons.assignment_ind_outlined),
                    title: const Text('Demandes de leve'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: onSurveyRequests,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
