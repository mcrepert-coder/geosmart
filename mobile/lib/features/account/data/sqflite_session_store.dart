import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../domain/entities/account_user.dart';
import '../domain/repositories/session_store.dart';

/// Ancienne session conservee en clair dans la base SQLite locale, une seule
/// ligne. Elle n'est plus utilisee que pour migrer une session existante vers
/// SecureSessionStore (stockage chiffre), qui l'efface ensuite.
/// La table est creee ici pour ne pas modifier le schema commun.
class SqfliteSessionStore implements SessionStore {
  SqfliteSessionStore(this._database);

  final Database _database;

  static const String _table = 'account_session';

  Future<void> ensureTable() => _database.execute('''
    CREATE TABLE IF NOT EXISTS $_table (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      user_json TEXT NOT NULL
    )
  ''');

  @override
  Future<AccountSession?> load() async {
    final rows = await _database.query(_table, where: 'id = 1', limit: 1);
    if (rows.isEmpty) return null;
    final row = rows.first;
    return AccountSession(
      accessToken: row['access_token'] as String,
      refreshToken: row['refresh_token'] as String,
      user: AccountUser.fromJson(
        jsonDecode(row['user_json'] as String) as Map<String, dynamic>,
      ),
    );
  }

  @override
  Future<void> save(AccountSession session) => _database.insert(
    _table,
    {
      'id': 1,
      'access_token': session.accessToken,
      'refresh_token': session.refreshToken,
      'user_json': jsonEncode(session.user.toJson()),
    },
    conflictAlgorithm: ConflictAlgorithm.replace,
  );

  @override
  Future<void> clear() => _database.delete(_table, where: 'id = 1');
}
