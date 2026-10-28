import 'package:sqflite/sqflite.dart';

import '../../domain/entities/gnss_position.dart';

class PositionLocalDataSource {
  const PositionLocalDataSource(this._database);

  final Database _database;

  Future<void> createTable() async {
    await _database.execute('''
      CREATE TABLE IF NOT EXISTS gnss_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL,
        accuracy REAL,
        recorded_at TEXT NOT NULL
      )
    ''');
  }

  Future<void> save(GnssPosition position) async {
    await _database.insert('gnss_positions', {
      'latitude': position.latitude,
      'longitude': position.longitude,
      'altitude': position.altitude,
      'accuracy': position.accuracy,
      'recorded_at': position.recordedAt.toIso8601String(),
    });
  }

  Future<List<Map<String, Object?>>> getAll() {
    return _database.query('gnss_positions', orderBy: 'recorded_at DESC');
  }
}
