import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../domain/entities/gnss_device.dart';
import '../../domain/entities/gnss_position.dart';
import '../../domain/repositories/gnss_position_source.dart';
import '../../infrastructure/gnss_channel.dart';
import 'nmea_position_decoder.dart';

/// Source de positions branchee sur le pont natif Android.
///
/// Sans adresse connue, [start] cherche un recepteur dans les appareils
/// appaires et a proximite. Sans appareil reconnu, aucune position n'arrive :
/// l'ecran de mesure reste en attente au lieu d'inventer une position.
class NativeGnssSource implements GnssPositionSource {
  NativeGnssSource({
    GnssChannel? channel,
    NmeaPositionDecoder? decoder,
    String? initialAddress,
  }) : _channel = channel ?? GnssChannel(),
       _decoder = decoder ?? NmeaPositionDecoder(),
       _address = initialAddress;

  final GnssChannel _channel;
  final NmeaPositionDecoder _decoder;
  final StreamController<GnssPosition> _positions =
      StreamController<GnssPosition>.broadcast();

  StreamSubscription<String>? _subscription;
  List<GnssDevice> _devices = const [];
  String? _address;
  bool _started = false;

  /// Adresse MAC du recepteur connecte, nulle avant connexion.
  String? get address => _address;

  /// Derniere liste d'appareils renvoyee par le natif.
  List<GnssDevice> get devices => List.unmodifiable(_devices);

  @override
  bool get isSimulation => false;

  @override
  Stream<GnssPosition> get positions => _positions.stream;

  /// Recherche les recepteurs autour du telephone.
  Future<List<GnssDevice>> scan() async {
    _devices = await _channel.startScan();
    return devices;
  }

  /// Connecte une adresse connue et retient la cible des prochains demarrages.
  Future<bool> connect(String address) async {
    final connected = await _channel.connectDevice(address);
    if (connected) _address = address;
    return connected;
  }

  Future<bool> disconnect() {
    return _channel.disconnectDevice();
  }

  @override
  Future<void> start() async {
    if (_started) return;
    _started = true;
    _subscription ??= _channel.nmeaStream.listen(
      _onLine,
      onError: (Object error) {
        debugPrint('NativeGnssSource stream: $error');
      },
    );

    if (_address != null) {
      await connect(_address!);
      return;
    }
    final found = await scan();
    final target = _preferred(found);
    if (target != null) {
      await connect(target.address);
    }
  }

  @override
  Future<void> stop() async {
    _started = false;
    await _subscription?.cancel();
    _subscription = null;
    await _channel.disconnectDevice();
  }

  void _onLine(String line) {
    final position = _decoder.feed(line);
    if (position != null && !_positions.isClosed) {
      _positions.add(position);
    }
  }

  GnssDevice? _preferred(List<GnssDevice> devices) {
    for (final device in devices) {
      if (device.isBonded && device.looksLikeReceiver) return device;
    }
    for (final device in devices) {
      if (device.looksLikeReceiver) return device;
    }
    return null;
  }
}
