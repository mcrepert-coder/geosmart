import 'package:sqflite/sqflite.dart' as sqflite;

/// Ouverture de la base SQLite locale de l'application.
///
/// Le schema version 1 contient les missions et leurs bornes. Les evolutions
/// suivantes passent par [onUpgrade], jamais par une base separee.
class LocalDatabase {
  const LocalDatabase._();

  static const int version = 1;

  static Future<sqflite.Database> open({
    sqflite.DatabaseFactory? factory,
    String? path,
  }) async {
    final databaseFactory = factory ?? sqflite.databaseFactory;
    final databasePath =
        path ?? '${await databaseFactory.getDatabasesPath()}/geosmart-field.db';
    return databaseFactory.openDatabase(
      databasePath,
      options: sqflite.OpenDatabaseOptions(
        version: version,
        onConfigure: _onConfigure,
        onCreate: _onCreate,
        onUpgrade: _onUpgrade,
      ),
    );
  }

  static Future<void> _onConfigure(sqflite.Database database) async {
    await database.execute('PRAGMA foreign_keys = ON');
  }

  static Future<void> _onCreate(sqflite.Database database, int version) async {
    await database.execute('''
      CREATE TABLE survey_sessions (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        surveyor_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        perimeter_meters REAL,
        area_square_meters REAL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    ''');
    await database.execute('''
      CREATE TABLE survey_points (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        surveyor_id TEXT NOT NULL,
        point_number INTEGER NOT NULL,
        point_name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL,
        accuracy REAL,
        fix_quality TEXT NOT NULL,
        satellites_count INTEGER NOT NULL,
        pdop REAL NOT NULL,
        hdop REAL,
        vdop REAL,
        instrument TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        is_validated INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES survey_sessions (id)
          ON DELETE CASCADE
      )
    ''');
    await database.execute(
      'CREATE INDEX survey_points_session_idx ON survey_points (session_id)',
    );
  }

  static Future<void> _onUpgrade(
    sqflite.Database database,
    int oldVersion,
    int newVersion,
  ) async {
    // Aucune migration pour l'instant. Les versions suivantes ajouteront la
    // file d'envoi locale dans un bloc dedie.
  }
}
