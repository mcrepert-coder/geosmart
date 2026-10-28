import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';

/// Wrapper around the MethodChannel defined in the GNSS contract.
class GnssChannel {
  static const MethodChannel _method = MethodChannel('com.geosmart/gnss_control');

  /// Sends raw RTCM bytes to the native GNSS receiver.
  Future<bool> sendRtcm(Uint8List data) async {
    try {
      final result = await _method.invokeMethod<bool>('sendRtcm', {'bytes': data});
      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint('GnssChannel.sendRtcm failed: ${e.message}');
      return false;
    }
  }

  // Existing wrappers can be added here (startScan, connectDevice, etc.) if needed.
}

