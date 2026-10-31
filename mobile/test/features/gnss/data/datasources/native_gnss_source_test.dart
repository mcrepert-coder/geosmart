import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/data/datasources/native_gnss_source.dart';
import 'package:geosmart_mobile/features/gnss/data/datasources/nmea_position_decoder.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_device.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/infrastructure/gnss_channel.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const method = MethodChannel(GnssChannel.methodChannelName);
  const events = EventChannel(GnssChannel.eventChannelName);
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  const gga =
      r'$GNGGA,143200.00,0607.9152,N,00113.3686,E,4,18,0.8,24.35,M,0.0,M,1.0,0000*6B';
  const gsa = r'$GNGSA,A,3,01,02,03,04,05,06,07,08,09,10,11,12,1.2,0.8,0.9*2D';

  GnssChannel channel() =>
      GnssChannel(methodChannel: method, eventChannel: events);

  NativeGnssSource source() => NativeGnssSource(
    channel: channel(),
    decoder: NmeaPositionDecoder(
      clock: () => DateTime.utc(2026, 10, 30, 14, 32),
    ),
  );

  Future<void> emit(Object? event) async {
    await messenger.handlePlatformMessage(
      GnssChannel.eventChannelName,
      const StandardMethodCodec().encodeSuccessEnvelope(event),
      (_) {},
    );
  }

  setUp(() {
    messenger.setMockMethodCallHandler(
      const MethodChannel(GnssChannel.eventChannelName),
      (call) async => null,
    );
  });

  tearDown(() {
    messenger.setMockMethodCallHandler(method, null);
    messenger.setMockMethodCallHandler(
      const MethodChannel(GnssChannel.eventChannelName),
      null,
    );
  });

  test('connecte le recepteur reconnu et decode le flux NMEA', () async {
    final connected = <String>[];
    messenger.setMockMethodCallHandler(method, (call) async {
      switch (call.method) {
        case 'requestPermissions':
          return true;
        case 'startScan':
          return [
            {
              'name': 'Casque audio',
              'address': '11:11:11:11:11:11',
              'isBonded': true,
            },
            {
              'name': 'UM982_GNSS',
              'address': '00:11:22:33:AA:BB',
              'isBonded': true,
            },
          ];
        case 'connectDevice':
          connected.add(
            (call.arguments as Map<Object?, Object?>)['address'] as String,
          );
          return true;
        case 'disconnectDevice':
          return true;
      }
      return null;
    });

    final gnss = source();
    final positions = <GnssPosition>[];
    final subscription = gnss.positions.listen(positions.add);

    await gnss.start();
    await pumpEventQueue();
    await emit(gsa);
    await emit(gga);
    await pumpEventQueue();

    expect(gnss.isSimulation, isFalse);
    expect(connected, ['00:11:22:33:AA:BB']);
    expect(gnss.address, '00:11:22:33:AA:BB');
    expect(positions, hasLength(1));
    expect(positions.single.latitude, closeTo(6.13192, 0.0000001));
    expect(positions.single.pdop, 1.2);
    expect(positions.single.canRecordPoint, isTrue);

    await gnss.stop();
    await subscription.cancel();
  });

  test('ne connecte rien quand aucun recepteur n est reconnu', () async {
    var connectCalls = 0;
    messenger.setMockMethodCallHandler(method, (call) async {
      switch (call.method) {
        case 'requestPermissions':
          return true;
        case 'startScan':
          return [
            {
              'name': 'Casque audio',
              'address': '11:11:11:11:11:11',
              'isBonded': true,
            },
          ];
        case 'connectDevice':
          connectCalls++;
          return true;
        case 'disconnectDevice':
          return true;
      }
      return null;
    });

    final gnss = source();
    await gnss.start();
    await pumpEventQueue();

    expect(connectCalls, 0);
    expect(gnss.address, isNull);

    await gnss.stop();
  });

  test('reprend une adresse connue sans relancer la recherche', () async {
    final calls = <String>[];
    messenger.setMockMethodCallHandler(method, (call) async {
      calls.add(call.method);
      return true;
    });

    final gnss = NativeGnssSource(
      channel: channel(),
      decoder: NmeaPositionDecoder(),
      initialAddress: '00:11:22:33:AA:BB',
    );
    await gnss.start();
    await pumpEventQueue();

    expect(calls, [
      'isBluetoothEnabled',
      'requestPermissions',
      'connectDevice',
    ]);
    expect(gnss.devices, isEmpty);

    await gnss.stop();
  });

  test('signale un Bluetooth desactive sans chercher de recepteur', () async {
    final calls = <String>[];
    messenger.setMockMethodCallHandler(method, (call) async {
      calls.add(call.method);
      return call.method != 'isBluetoothEnabled';
    });

    final gnss = source();
    await gnss.start();
    await pumpEventQueue();

    expect(gnss.bluetoothDisabled, isTrue);
    expect(gnss.error, NativeGnssSource.bluetoothDisabledMessage);
    expect(calls, ['isBluetoothEnabled']);

    await gnss.stop();
  });

  test('efface l alerte quand le Bluetooth est reactive', () async {
    var enabled = false;
    messenger.setMockMethodCallHandler(method, (call) async {
      if (call.method == 'isBluetoothEnabled') return enabled;
      return true;
    });

    final gnss = source();
    await gnss.start();
    expect(gnss.bluetoothDisabled, isTrue);

    enabled = true;
    final active = await gnss.refreshBluetoothState();

    expect(active, isTrue);
    expect(gnss.bluetoothDisabled, isFalse);
    expect(gnss.error, isNull);

    await gnss.stop();
  });

  test('refuse la recherche sans autorisation Bluetooth', () async {
    var scanCalls = 0;
    messenger.setMockMethodCallHandler(method, (call) async {
      switch (call.method) {
        case 'requestPermissions':
          return false;
        case 'startScan':
          scanCalls++;
          return <Object?>[];
      }
      return null;
    });

    final gnss = source();
    final devices = await gnss.scan();

    expect(devices, isEmpty);
    expect(scanCalls, 0);
    expect(gnss.error, contains('refusees'));

    await gnss.stop();
  });

  test('demande l autorisation avant de scanner', () async {
    final calls = <String>[];
    messenger.setMockMethodCallHandler(method, (call) async {
      calls.add(call.method);
      return call.method == 'startScan' ? <Object?>[] : true;
    });

    final gnss = source();
    await gnss.scan();

    expect(calls, ['isBluetoothEnabled', 'requestPermissions', 'startScan']);
    expect(gnss.error, isNull);

    await gnss.stop();
  });

  test('signale l absence de recepteur reconnu', () async {
    messenger.setMockMethodCallHandler(method, (call) async {
      switch (call.method) {
        case 'requestPermissions':
          return true;
        case 'startScan':
          return <Object?>[];
      }
      return null;
    });

    final gnss = source();
    await gnss.start();

    expect(gnss.error, contains('Aucun recepteur'));

    await gnss.stop();
  });

  test('un appareil non apparie mais nomme GNSS reste utilisable', () async {
    expect(
      const GnssDevice(
        name: 'RTK Base',
        address: '22:22:22:22:22:22',
      ).looksLikeReceiver,
      isTrue,
    );
  });
}
