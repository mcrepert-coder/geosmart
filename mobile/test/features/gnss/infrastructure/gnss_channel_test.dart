import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/infrastructure/gnss_channel.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const method = MethodChannel(GnssChannel.methodChannelName);
  const events = EventChannel(GnssChannel.eventChannelName);
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  GnssChannel channel() =>
      GnssChannel(methodChannel: method, eventChannel: events);

  tearDown(() {
    messenger.setMockMethodCallHandler(method, null);
  });

  test('startScan lit les appareils et ecarte les adresses vides', () async {
    messenger.setMockMethodCallHandler(method, (call) async {
      expect(call.method, 'startScan');
      return [
        {
          'name': 'UM982_GNSS',
          'address': '00:11:22:33:AA:BB',
          'isBonded': true,
        },
        {'name': 'Sans adresse', 'address': '   ', 'isBonded': false},
      ];
    });

    final devices = await channel().startScan();

    expect(devices, hasLength(1));
    expect(devices.single.name, 'UM982_GNSS');
    expect(devices.single.address, '00:11:22:33:AA:BB');
    expect(devices.single.isBonded, isTrue);
    expect(devices.single.looksLikeReceiver, isTrue);
  });

  test('connectDevice transmet l adresse attendue', () async {
    Object? arguments;
    messenger.setMockMethodCallHandler(method, (call) async {
      arguments = call.arguments;
      return true;
    });

    final connected = await channel().connectDevice('00:11:22:33:AA:BB');

    expect(connected, isTrue);
    expect(arguments, {'address': '00:11:22:33:AA:BB'});
  });

  test('sendRtcm transmet les octets du bloc RTCM', () async {
    Uint8List? sent;
    messenger.setMockMethodCallHandler(method, (call) async {
      sent = (call.arguments as Map<Object?, Object?>)['bytes'] as Uint8List;
      return true;
    });
    final block = Uint8List.fromList([0xD3, 0x00, 0x13, 0x3E]);

    final accepted = await channel().sendRtcm(block);

    expect(accepted, isTrue);
    expect(sent, block);
  });

  test('startSimulation transmet le chemin du fichier NMEA', () async {
    Object? arguments;
    messenger.setMockMethodCallHandler(method, (call) async {
      arguments = call.arguments;
      return true;
    });

    final started = await channel().startSimulation('nmea/simulation.txt');

    expect(started, isTrue);
    expect(arguments, {'assetPath': 'nmea/simulation.txt'});
  });

  test('une erreur native renvoie false ou une liste vide', () async {
    messenger.setMockMethodCallHandler(method, (call) async {
      throw PlatformException(
        code: 'PERMISSIONS_REQUIRED',
        message: 'Autorisation refusee',
      );
    });

    expect(await channel().startScan(), isEmpty);
    expect(await channel().connectDevice('00:11:22:33:AA:BB'), isFalse);
    expect(await channel().disconnectDevice(), isFalse);
    expect(await channel().startSimulation('nmea/simulation.txt'), isFalse);
    expect(await channel().sendRtcm(Uint8List(2)), isFalse);
  });
}
