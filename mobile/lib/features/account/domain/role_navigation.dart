import 'entities/account_user.dart';

/// EF-402 : navigation par role. Seules les actions permises sont affichees ;
/// le serveur refuse de toute facon toute action non autorisee.
enum AccountAction {
  /// Accueil leve GNSS (Romuald) : geometre et topographe.
  survey,

  /// Ecran de synchronisation hors ligne (EF-405).
  sync,

  /// Carte des parcelles coloree par statut (EF-406) : tous les roles,
  /// comme GET /parcels.
  map,

  /// Demandes de visite d'un bien (EF-305) : client et agent.
  visits,

  /// Baux, loyers et etats des lieux (EF-306, EF-307) : agent.
  leasing,

  /// Espace administrateur : file des comptes (EF-404).
  admin,

  /// Compte connecte : informations et pieces justificatives (EF-403).
  account,
}

/// Actions visibles pour un role donne. Un compte suspendu ne garde que la
/// consultation de son propre compte ; le serveur bloque le reste (RG-06).
List<AccountAction> actionsForRole(AccountRole role, {bool accountActive = true}) {
  if (!accountActive) return const [AccountAction.account];
  return switch (role) {
    AccountRole.admin => const [
      AccountAction.admin,
      AccountAction.map,
      AccountAction.sync,
      AccountAction.account,
    ],
    AccountRole.geometre => const [
      AccountAction.survey,
      AccountAction.map,
      AccountAction.sync,
      AccountAction.account,
    ],
    AccountRole.topographe => const [
      AccountAction.survey,
      AccountAction.map,
      AccountAction.sync,
      AccountAction.account,
    ],
    AccountRole.agent => const [
      AccountAction.visits,
      AccountAction.leasing,
      AccountAction.map,
      AccountAction.account,
    ],
    AccountRole.client => const [
      AccountAction.visits,
      AccountAction.map,
      AccountAction.account,
    ],
  };
}
