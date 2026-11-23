import '../entities/account_user.dart';

/// Session ouverte apres connexion : jetons courts + renouvellement (EF-407)
/// et profil courant. Le role n'est jamais conserve comme source de verite :
/// il est relu par le serveur a chaque requete (RG-06).
class AccountSession {
  const AccountSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final AccountUser user;

  AccountSession copyWith({
    String? accessToken,
    String? refreshToken,
    AccountUser? user,
  }) => AccountSession(
    accessToken: accessToken ?? this.accessToken,
    refreshToken: refreshToken ?? this.refreshToken,
    user: user ?? this.user,
  );
}

/// Stockage local de la session (port). L'implementation par defaut est
/// SqfliteSessionStore ; une implementation sur stockage chiffre du systeme
/// pourra la remplacer sans toucher aux vues.
abstract interface class SessionStore {
  Future<AccountSession?> load();

  Future<void> save(AccountSession session);

  Future<void> clear();
}

/// Fournit le jeton d'acces courant aux clients API des autres modules
/// (forme attendue par TokenProvider de LandApi).
typedef AccessTokenProvider = Future<String?> Function();
