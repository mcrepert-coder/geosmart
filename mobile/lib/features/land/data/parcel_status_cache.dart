import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../domain/entities/parcel_public_status.dart';

/// Resultat garde sur l'appareil, avec la date de consultation (maquette C1).
class CachedParcelStatus {
  const CachedParcelStatus(this.status, this.consultedAt);

  final ParcelPublicStatus status;
  final DateTime consultedAt;
}

/// Dernier resultat consulte, disponible hors ligne (EF-206).
abstract interface class ParcelStatusCache {
  Future<void> save(ParcelPublicStatus status, DateTime consultedAt);

  /// Le resultat garde pour cette parcelle, s'il existe.
  Future<CachedParcelStatus?> find(String parcelId);

  /// Le dernier resultat consulte, toutes parcelles confondues.
  Future<CachedParcelStatus?> latest();
}

/// Implementation sqflite. Garde les 20 dernieres parcelles consultees.
class SqfliteParcelStatusCache implements ParcelStatusCache {
  const SqfliteParcelStatusCache(this._db);

  final Database _db;
  static const _table = 'land_parcel_status_cache';
  static const _keep = 20;

  Future<void> createTable() => _db.execute('''
    CREATE TABLE IF NOT EXISTS $_table (
      parcel_id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      consulted_at TEXT NOT NULL
    )
  ''');

  @override
  Future<void> save(ParcelPublicStatus status, DateTime consultedAt) async {
    await _db.insert(_table, {
      'parcel_id': status.id,
      'json': jsonEncode(status.toJson()),
      'consulted_at': consultedAt.toUtc().toIso8601String(),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
    await _db.execute(
      'DELETE FROM $_table WHERE parcel_id NOT IN '
      '(SELECT parcel_id FROM $_table ORDER BY consulted_at DESC LIMIT $_keep)',
    );
  }

  @override
  Future<CachedParcelStatus?> find(String parcelId) async {
    final rows = await _db.query(
      _table,
      where: 'parcel_id = ?',
      whereArgs: [parcelId],
    );
    return rows.isEmpty ? null : _fromRow(rows.first);
  }

  @override
  Future<CachedParcelStatus?> latest() async {
    final rows = await _db.query(
      _table,
      orderBy: 'consulted_at DESC',
      limit: 1,
    );
    return rows.isEmpty ? null : _fromRow(rows.first);
  }

  CachedParcelStatus _fromRow(Map<String, Object?> row) => CachedParcelStatus(
    ParcelPublicStatus.fromJson(
      jsonDecode(row['json'] as String) as Map<String, dynamic>,
    ),
    DateTime.parse(row['consulted_at'] as String),
  );
}

/// Implementation en memoire (tests, ou appareil sans base locale).
class MemoryParcelStatusCache implements ParcelStatusCache {
  final _items = <String, CachedParcelStatus>{};

  @override
  Future<void> save(ParcelPublicStatus status, DateTime consultedAt) async {
    _items[status.id] = CachedParcelStatus(status, consultedAt);
  }

  @override
  Future<CachedParcelStatus?> find(String parcelId) async => _items[parcelId];

  @override
  Future<CachedParcelStatus?> latest() async {
    if (_items.isEmpty) return null;
    return _items.values.reduce(
      (a, b) => a.consultedAt.isAfter(b.consultedAt) ? a : b,
    );
  }
}
