import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../domain/entities/gnss_device.dart';

/// Wrapper Flutter du pont natif decrit dans `contracts/gnss-channel.md`.
///
/// Le canal de commandes est `com.geosmart/gnss_control`, le flux de phrases
/// NMEA est `com.geosmart/gnss_stream`. En cas d'erreur native, les methodes
/// renvoient une liste vide ou `false` : l'appelant decide du repli.
class GnssChannel {
  GnssChannel({
    MethodChannel methodChannel = const MethodChannel(methodChannelName),
    EventChannel eventChannel = const EventChannel(eventChannelName),
  }) : _method = methodChannel,
       _events = eventChannel;

  static const String methodChannelName = 'com.geosmart/gnss_control';
  static const String eventChannelName = 'com.geosmart/gnss_stream';

  final MethodChannel _method;
  final EventChannel _events;

  /// Phrases NMEA brutes, dans l'ordre d'arrivee.
  ///
  /// Une erreur de code `STREAM_DISCONNECTED` annonce une perte de liaison
  /// avant la reconnexion automatique du natif.
  Stream<String> get nmeaStream {
    return _events
        .receiveBroadcastStream()
        .where((event) => event is String)
        .cast<String>();
  }

  /// Appareils appaires puis a proximite. Liste vide si le natif echoue.
  Future<List<GnssDevice>> startScan() async {
    try {
      final result = await _method.invokeMethod<List<Object?>>('startScan');
      if (result == null) return const [];
      return result
          .map(GnssDevice.tryParse)
          .whereType<GnssDevice>()
          .toList(growable: false);
    } on PlatformException catch (error) {
      debugPrint('GnssChannel.startScan: ${error.code} ${error.message}');
      return const [];
    }
  }

  /// Ouvre la liaison SPP. Renvoie `false` si le natif refuse.
  Future<bool> connectDevice(String address) async {
    try {
      final result = await _method.invokeMethod<bool>('connectDevice', {
        'address': address,
      });
      return result ?? false;
    } on PlatformException catch (error) {
      debugPrint('GnssChannel.connectDevice: ${error.code} ${error.message}');
      return false;
    }
  }

  Future<bool> disconnectDevice() async {
    try {
      final result = await _method.invokeMethod<bool>('disconnectDevice');
      return result ?? false;
    } on PlatformException catch (error) {
      debugPrint(
        'GnssChannel.disconnectDevice: ${error.code} ${error.message}',
      );
      return false;
    }
  }

  /// Envoie les octets RTCM du client NTRIP au recepteur.
  Future<bool> sendRtcm(Uint8List data) async {
    try {
      final result = await _method.invokeMethod<bool>('sendRtcm', {
        'bytes': data,
      });
      return result ?? false;
    } on PlatformException catch (error) {
      debugPrint('GnssChannel.sendRtcm: ${error.code} ${error.message}');
      return false;
    }
  }

  /// Rejoue un fichier NMEA du dossier d'assets.
  Future<bool> startSimulation(String assetPath) async {
    try {
      final result = await _method.invokeMethod<bool>('startSimulation', {
        'assetPath': assetPath,
      });
      return result ?? false;
    } on PlatformException catch (error) {
      debugPrint('GnssChannel.startSimulation: ${error.code} ${error.message}');
      return false;
    }
  }
}
