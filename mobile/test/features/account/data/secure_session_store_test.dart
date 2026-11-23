import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/database/local_database.dart';
import 'package:geosmart_mobile/features/account/data/secure_session_store.dart';
import 'package:geosmart_mobile/features/account/data/sqflite_session_store.dart';
import 'package:geosmart_mobile/features/account/domain/entities/account_user.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Stockage chiffre simule en memoire.
class MemorySecretStorage implements SecretStorage {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

void main() {
  sqfliteFfiInit();

  const user = AccountUser(
    id: 'compte-1',
    role: AccountRole.topographe,
    registeredSurveyor: false,
    accountActive: true,
    fullName: 'Kanleto Beni',
  );
  const session = AccountSession(
    accessToken: 'jeton-acces',
    refreshToken: 'jeton-renouvellement',
    user: user,
  );

  late Database database;
  late SqfliteSessionStore legacy;
  late MemorySecretStorage secrets;
  late SecureSessionStore store;

  setUp(() async {
    database = await LocalDatabase.open(
      factory: databaseFactoryFfi,
      path: inMemoryDatabasePath,
    );
    legacy = SqfliteSessionStore(database);
    await legacy.ensureTable();
    secrets = MemorySecretStorage();
    store = SecureSessionStore(secrets, legacy: legacy);
  });

  tearDown(() async {
    await database.close();
  });

  test('aucune session au depart', () async {
    expect(await store.load(), isNull);
  });

  test(
    'conserve la session dans le stockage chiffre, pas dans SQLite',
    () async {
      await store.save(session);

      expect(secrets.values.containsKey(SecureSessionStore.key), isTrue);
      expect(await legacy.load(), isNull);

      final loaded = await store.load();
      expect(loaded?.accessToken, 'jeton-acces');
      expect(loaded?.refreshToken, 'jeton-renouvellement');
      expect(loaded?.user.id, 'compte-1');
      expect(loaded?.user.role, AccountRole.topographe);
      expect(loaded?.user.fullName, 'Kanleto Beni');
    },
  );

  test('migre une ancienne session en clair puis l efface de SQLite', () async {
    await legacy.save(session);

    final loaded = await store.load();

    expect(loaded?.accessToken, 'jeton-acces');
    expect(await legacy.load(), isNull);
    expect(secrets.values.containsKey(SecureSessionStore.key), isTrue);
  });

  test('la deconnexion efface les deux stockages', () async {
    await legacy.save(session);
    await store.save(session);

    await store.clear();

    expect(secrets.values, isEmpty);
    expect(await legacy.load(), isNull);
    expect(await store.load(), isNull);
  });

  test('un contenu illisible est efface sans planter', () async {
    secrets.values[SecureSessionStore.key] = 'pas du json';

    expect(await store.load(), isNull);
    expect(secrets.values, isEmpty);
  });
}
