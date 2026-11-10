// ignore_for_file: prefer_initializing_formals

import 'package:flutter/foundation.dart';

import '../../data/auth_api.dart';
import '../../domain/entities/account_user.dart';
import '../../domain/repositories/session_store.dart';

/// Etat de la navigation comptes (EF-401, EF-402, EF-407).
enum AuthStatus {
  /// Lecture de la session locale au demarrage.
  loading,

  /// Pas de session : ecran de connexion.
  signedOut,

  /// Inscription faite, le code SMS est attendu.
  pendingVerification,

  /// Telephone verifie : la demande attend la validation d'un administrateur.
  pendingApproval,

  /// Session ouverte.
  signedIn,
}

/// Pilote le parcours comptes : inscription, code SMS, connexion, jetons et
/// deconnexion. Le role vient toujours du serveur (RG-06).
class AuthController extends ChangeNotifier {
  AuthController({required AuthApi api, required SessionStore store})
    : _api = api,
      _store = store;

  final AuthApi _api;
  final SessionStore _store;

  AuthStatus _status = AuthStatus.loading;
  AccountSession? _session;
  String? _error;
  String? _pendingPhone;
  String? _lockedUntil;

  AuthStatus get status => _status;
  AccountUser? get user => _session?.user;
  String? get error => _error;

  /// Telephone en attente du code SMS, apres l'inscription.
  String? get pendingPhone => _pendingPhone;

  /// Fin du blocage apres cinq echecs de connexion (EF-407).
  String? get lockedUntil => _lockedUntil;

  /// Jeton d'acces courant pour les clients API des autres modules.
  Future<String?> accessToken() async => _session?.accessToken;

  /// Recharge la session locale au demarrage, puis verifie le jeton.
  /// Un jeton d'acces expire est renouvele silencieusement (EF-407).
  Future<void> bootstrap() async {
    final session = await _store.load();
    if (session == null) {
      _set(AuthStatus.signedOut);
      return;
    }
    _session = session;
    try {
      final user = await _api.me(session.accessToken);
      _session = session.copyWith(user: user);
      await _store.save(_session!);
      _set(AuthStatus.signedIn);
    } on AuthApiException catch (error) {
      if (error.status == 401) {
        await _renewAndReload(session);
      } else {
        await _signOut(keepError: error.message);
      }
    }
  }

  /// POST /auth/registrations, puis attente du code SMS (simule dans le
  /// journal du serveur tant qu'il n'y a pas de fournisseur).
  Future<void> register({
    required String phone,
    required String password,
  }) async {
    _error = null;
    try {
      final account = await _api.register(phone: phone, password: password);
      if (account.status == 'TELEPHONE_NON_VERIFIE') {
        _pendingPhone = account.phone;
        _set(AuthStatus.pendingVerification);
      } else {
        _pendingPhone = account.phone;
        _set(AuthStatus.pendingApproval);
      }
      notifyListeners();
    } on AuthApiException catch (error) {
      _fail(error);
    }
  }

  /// POST /auth/phone-verifications : le compte passe EN_ATTENTE, la
  /// validation par un administrateur est necessaire avant la connexion.
  Future<void> verifyCode(String code) async {
    final phone = _pendingPhone;
    if (phone == null) {
      _set(AuthStatus.signedOut);
      return;
    }
    _error = null;
    try {
      await _api.verifyPhone(phone: phone, code: code);
      _set(AuthStatus.pendingApproval);
    } on AuthApiException catch (error) {
      _fail(error);
    }
  }

  /// POST /auth/login : 403 si le compte n'est pas encore valide, 423 apres
  /// cinq echecs (blocage 15 minutes, EF-407).
  Future<void> login({
    required String phone,
    required String password,
  }) async {
    _error = null;
    _lockedUntil = null;
    try {
      final tokens = await _api.login(phone: phone, password: password);
      final user = await _api.me(tokens.accessToken);
      final session = AccountSession(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: user,
      );
      _session = session;
      await _store.save(session);
      _set(AuthStatus.signedIn);
    } on AuthApiException catch (error) {
      _lockedUntil = error.lockedUntil;
      _status = AuthStatus.signedOut;
      _fail(error);
    }
  }

  Future<void> logout() async {
    await _store.clear();
    _session = null;
    _pendingPhone = null;
    _lockedUntil = null;
    await _signOut();
  }

  Future<void> _renewAndReload(AccountSession session) async {
    try {
      final tokens = await _api.refresh(session.refreshToken);
      final user = await _api.me(tokens.accessToken);
      _session = AccountSession(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: user,
      );
      await _store.save(_session!);
      _set(AuthStatus.signedIn);
    } on AuthApiException {
      // Jeton de renouvellement utilise ou compte suspendu : nouvelle
      // connexion necessaire.
      await _signOut();
    }
  }

  Future<void> _signOut({String? keepError}) async {
    _session = null;
    _error = keepError;
    _set(AuthStatus.signedOut);
    if (keepError != null) notifyListeners();
  }

  void _fail(AuthApiException error) {
    _error = error.status == 423
        ? 'Trop de tentatives : connexion bloquee 15 minutes.'
        : error.message;
    notifyListeners();
  }

  void _set(AuthStatus status) {
    _status = status;
    notifyListeners();
  }
}
