import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/data/datasources/ntrip_data_source.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/ntrip_caster.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/caster_credential_store.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/ntrip_controller.dart';

class FakeConnection implements NtripConnection {
  FakeConnection({required this.onStatus, this.result = true});

  final void Function(bool streaming, String? error) onStatus;
  final bool result;
  int stops = 0;

  @override
  Future<bool> start() async {
    if (result) onStatus(true, null);
    return result;
  }

  @override
  Future<void> stop() async {
    stops++;
  }
}

class FailingCredentialStore implements CasterCredentialStore {
  @override
  Future<void> save(NtripCaster caster) async {
    throw StateError('Keystore indisponible');
  }

  @override
  Future<NtripCaster?> load() async => null;

  @override
  Future<void> clear() async {}
}

void main() {
  const caster = NtripCaster(
    host: 'caster.example',
    port: 2101,
    mountpoint: 'RTK31N',
    username: 'operateur',
    password: 'secret',
  );

  group('NtripController', () {
    test('charge la configuration memorisee', () async {
      final credentials = InMemoryCasterCredentialStore();
      await credentials.save(caster);
      final controller = NtripController(credentials: credentials);
      addTearDown(controller.dispose);

      await controller.loadSaved();

      expect(controller.caster?.host, 'caster.example');
      expect(controller.caster?.mountpoint, 'RTK31N');
      expect(controller.status, NtripStatus.idle);
    });

    test('enregistre le caster puis passe en diffusion', () async {
      final credentials = InMemoryCasterCredentialStore();
      final connections = <FakeConnection>[];
      final controller = NtripController(
        credentials: credentials,
        connectionFactory: (value, onStatus) {
          final connection = FakeConnection(onStatus: onStatus);
          connections.add(connection);
          return connection;
        },
      );
      addTearDown(controller.dispose);

      expect(await controller.connect(caster), isTrue);

      expect(controller.status, NtripStatus.streaming);
      expect(controller.isStreaming, isTrue);
      expect(controller.error, isNull);
      expect(controller.caster, caster);
      expect((await credentials.load())?.password, 'secret');
      expect(connections, hasLength(1));
    });

    test('signale une connexion impossible', () async {
      final controller = NtripController(
        credentials: InMemoryCasterCredentialStore(),
        connectionFactory: (value, onStatus) =>
            FakeConnection(onStatus: onStatus, result: false),
      );
      addTearDown(controller.dispose);

      expect(await controller.connect(caster), isFalse);

      expect(controller.status, NtripStatus.error);
      expect(controller.error, 'Connexion NTRIP impossible.');
      expect(controller.isBusy, isFalse);
    });

    test('refuse de connecter sans stockage securise', () async {
      final controller = NtripController(
        credentials: FailingCredentialStore(),
        connectionFactory: (value, onStatus) =>
            FakeConnection(onStatus: onStatus),
      );
      addTearDown(controller.dispose);

      expect(await controller.connect(caster), isFalse);

      expect(controller.status, NtripStatus.error);
      expect(controller.error, contains('Keystore indisponible'));
    });

    test('deconnecte et arrete la connexion', () async {
      final connections = <FakeConnection>[];
      final controller = NtripController(
        credentials: InMemoryCasterCredentialStore(),
        connectionFactory: (value, onStatus) {
          final connection = FakeConnection(onStatus: onStatus);
          connections.add(connection);
          return connection;
        },
      );
      addTearDown(controller.dispose);
      await controller.connect(caster);

      await controller.disconnect();

      expect(controller.status, NtripStatus.idle);
      expect(controller.isStreaming, isFalse);
      expect(connections.single.stops, 1);
    });

    test('oublie la configuration memorisee', () async {
      final credentials = InMemoryCasterCredentialStore();
      await credentials.save(caster);
      final controller = NtripController(
        credentials: credentials,
        connectionFactory: (value, onStatus) =>
            FakeConnection(onStatus: onStatus),
      );
      addTearDown(controller.dispose);
      await controller.loadSaved();

      await controller.forget();

      expect(controller.caster, isNull);
      expect(await credentials.load(), isNull);
      expect(controller.status, NtripStatus.idle);
    });
  });
}
