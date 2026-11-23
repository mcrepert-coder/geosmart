import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/database/local_database.dart';
import 'package:geosmart_mobile/features/account/data/sqflite_session_store.dart';
import 'package:geosmart_mobile/features/account/domain/entities/account_user.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();

  late Database database;
  late SqfliteSessionStore store;

  const user = AccountUser(
    id: 'compte-1',
    role: AccountRole.agent,
    registeredSurveyor: false,
    accountActive: true,
    fullName: 'Kanleto Beni',
  );

  setUp(() async {
    database = await LocalDatabase.open(
      factory: databaseFactoryFfi,
      path: inMemoryDatabasePath,
    );
    store = SqfliteSessionStore(database);
    await store.ensureTable();
  });

  tearDown(() async {
    await database.close();
  });

  test('aucune session au depart', () async {
    expect(await store.load(), isNull);
  });

  test('conserve puis relit la session', () async {
    const session = AccountSession(
      accessToken: 'acces',
      refreshToken: 'renouvellement',
      user: user,
    );

    await store.save(session);
    final loaded = await store.load();

    expect(loaded, isNotNull);
    expect(loaded!.accessToken, 'acces');
    expect(loaded.refreshToken, 'renouvellement');
    expect(loaded.user.role, AccountRole.agent);
    expect(loaded.user.fullName, 'Kanleto Beni');
  });

  test('remplace la session precedente (une seule ligne)', () async {
    const first = AccountSession(
      accessToken: 'acces-1',
      refreshToken: 'renouvellement-1',
      user: user,
    );
    const second = AccountSession(
      accessToken: 'acces-2',
      refreshToken: 'renouvellement-2',
      user: user,
    );

    await store.save(first);
    await store.save(second);
    final loaded = await store.load();

    expect(loaded!.accessToken, 'acces-2');
  });

  test('efface la session a la deconnexion', () async {
    const session = AccountSession(
      accessToken: 'acces',
      refreshToken: 'renouvellement',
      user: user,
    );
    await store.save(session);

    await store.clear();

    expect(await store.load(), isNull);
  });
}
