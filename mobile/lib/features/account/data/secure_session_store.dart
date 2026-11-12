import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../domain/entities/account_user.dart';
import '../domain/repositories/session_store.dart';

/// Stockage chiffre de cle a valeur (port). L'implementation de production
/// est [FlutterSecretStorage] ; les tests utilisent une table en memoire.
abstract interface class SecretStorage {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

/// Adaptateur sur flutter_secure_storage : sous Android, la valeur est
/// chiffree par une cle du Keystore, comme le mot de passe NTRIP.
class FlutterSecretStorage implements SecretStorage {
  const FlutterSecretStorage([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Session (jetons et profil) conservee chiffree, au lieu de la table SQLite
/// en clair. Si une ancienne session en clair existe ([legacy]), elle est
/// recopiee ici au premier chargement puis effacee de SQLite.
class SecureSessionStore implements SessionStore {
  SecureSessionStore(this._storage, {this.legacy});

  final SecretStorage _storage;
  /// Ancienne session en clair a migrer (SqfliteSessionStore), facultative.
  final SessionStore? legacy;

  static const String key = 'geosmart_account_session';

  @override
  Future<AccountSession?> load() async {
    final raw = await _storage.read(key);
    if (raw != null) {
      final session = _decode(raw);
      if (session != null) return session;
      // Contenu illisible : on repart sans session plutot que de planter.
      await _storage.delete(key);
    }
    final legacy = this.legacy;
    if (legacy == null) return null;
    final old = await legacy.load();
    if (old == null) return null;
    await save(old);
    await legacy.clear();
    return old;
  }

  @override
  Future<void> save(AccountSession session) => _storage.write(
    key,
    jsonEncode({
      'accessToken': session.accessToken,
      'refreshToken': session.refreshToken,
      'user': session.user.toJson(),
    }),
  );

  @override
  Future<void> clear() async {
    await _storage.delete(key);
    await legacy?.clear();
  }

  AccountSession? _decode(String raw) {
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return AccountSession(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        user: AccountUser.fromJson(json['user'] as Map<String, dynamic>),
      );
    } on Object {
      return null;
    }
  }
}
