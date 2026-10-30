import 'dart:typed_data';

import '../domain/repositories/rtcm_sink.dart';
import 'gnss_channel.dart';

/// Envoie les corrections RTCM au recepteur par le MethodChannel GNSS.
class GnssChannelRtcmSink implements RtcmSink {
  GnssChannelRtcmSink({GnssChannel? channel})
    : _channel = channel ?? GnssChannel();

  final GnssChannel _channel;

  @override
  Future<bool> sendRtcm(Uint8List bytes) => _channel.sendRtcm(bytes);
}
