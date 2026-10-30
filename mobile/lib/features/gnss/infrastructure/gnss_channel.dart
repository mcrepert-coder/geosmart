import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../domain/entities/gnss_device.dart';
import '../domain/entities/ntrip_caster.dart';

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

  /// Demande les autorisations Bluetooth a l'utilisateur.
  ///
  /// Renvoie `true` quand elles sont deja accordees ou viennent de l'etre,
  /// `false` si l'utilisateur refuse ou si le natif echoue.
  Future<bool> requestBluetoothPermissions() async {
    try {
      final result = await _method.invokeMethod<bool>('requestPermissions');
      return result ?? false;
    } on PlatformException catch (error) {
      debugPrint(
        'GnssChannel.requestPermissions: ${error.code} ${error.message}',
      );
      return false;
    }
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

  /// Enregistre la configuration du caster. Le mot de passe est chiffre par
  /// le Keystore Android, jamais ecrit en clair.
  Future<bool> saveCaster(NtripCaster caster) async {
    try {
      final result = await _method.invokeMethod<bool>('saveCaster', {
        'host': caster.host,
        'port': caster.port,
        'mountpoint': caster.mountpoint,
        'username': caster.username,
        'password': caster.password,
        'useTls': caster.useTls,
      });
      return result ?? false;
    } on PlatformException catch (error) {
      debugPrint('GnssChannel.saveCaster: ${error.code} ${error.message}');
      return false;
    }
  }

  /// Relit la configuration du caster, mot de passe dechiffre par le natif.
  Future<NtripCaster?> loadCaster() async {
    try {
      final result = await _method.invokeMapMethod<String, Object?>(
        'loadCaster',
      );
      if (result == null) return null;
      final host = (result['host'] as String?)?.trim() ?? '';
      final mountpoint = (result['mountpoint'] as String?)?.trim() ?? '';
      if (host.isEmpty || mountpoint.isEmpty) return null;
      return NtripCaster(
        host: host,
        port: (result['port'] as num?)?.toInt() ?? 2101,
        mountpoint: mountpoint,
        username: (result['username'] as String?) ?? '',
        password: (result['password'] as String?) ?? '',
        useTls: result['useTls'] == true,
      );
    } on PlatformException catch (error) {
      debugPrint('GnssChannel.loadCaster: ${error.code} ${error.message}');
      return null;
    }
  }

  Future<bool> clearCaster() async {
    try {
      final result = await _method.invokeMethod<bool>('clearCaster');
      return result ?? false;
    } on PlatformException catch (error) {
      debugPrint('GnssChannel.clearCaster: ${error.code} ${error.message}');
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
