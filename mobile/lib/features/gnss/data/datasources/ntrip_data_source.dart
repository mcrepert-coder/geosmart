import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
// import '../gnss/domain/entities/ntrip_caster.dart';
import '../../domain/entities/ntrip_caster.dart';
import '../../infrastructure/gnss_channel.dart';

/// Data source that connects to an NTRIP caster, receives RTCM correction
/// bytes and forwards them to the native GNSS receiver via the MethodChannel.
class NtripDataSource {
  final NtripCaster caster;
  final GnssChannel _channel;
  final Dio _dio;
  StreamSubscription<List<int>>? _subscription;
  bool _active = false;

  NtripDataSource({required this.caster, required this._channel})
    : _dio = Dio();

  /// Starts the NTRIP connection. Returns when the first chunk is received.
  Future<void> start() async {
    if (_active) return;
    _active = true;
    await _connect();
  }

  /// Stops the NTRIP stream and cleans up resources.
  Future<void> stop() async {
    _active = false;
    await _subscription?.cancel();
    _subscription = null;
  }

  // -------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------
  Future<void> _connect() async {
    final options = Options(
      responseType: ResponseType.stream,
      followRedirects: true,
      headers: {
        // Basic auth header if credentials are provided.
        if (caster.username.isNotEmpty)
          'Authorization':
              'Basic ${base64Encode('${caster.username}:${caster.password}'.codeUnits)}',
        'User-Agent': 'GeosmartNtripClient/1.0',
        'Accept': '*/*',
        'Connection': 'keep-alive',
      },
    );

    try {
      final response = await _dio.getUri(caster.uri, options: options);
      if (response.statusCode != 200) {
        throw DioException(
          requestOptions: response.requestOptions,
          error: 'NTRIP server returned ${response.statusCode}',
        );
      }

      final stream = response.data!.stream;
      // The stream yields List<int> chunks.
      _subscription = stream
          .map((chunk) => chunk as List<int>)
          .listen(
            _onData,
            onError: _onError,
            onDone: _onDone,
            cancelOnError: true,
          );
    } catch (e) {
      debugPrint('NTRIP connection error: $e');
      if (_active) {
        // Simple exponential back‑off: wait 5 seconds then retry.
        await Future.delayed(const Duration(seconds: 5));
        await _connect();
      }
    }
  }

  void _onData(List<int> bytes) async {
    try {
      await _channel.sendRtcm(Uint8List.fromList(bytes));
    } catch (e) {
      debugPrint('Failed to forward RTCM: $e');
    }
  }

  void _onError(Object error, StackTrace stack) async {
    debugPrint('NTRIP stream error: $error');
    if (_active) {
      await Future.delayed(const Duration(seconds: 5));
      await _connect();
    }
  }

  void _onDone() async {
    debugPrint('NTRIP stream closed by server');
    if (_active) {
      await Future.delayed(const Duration(seconds: 5));
      await _connect();
    }
  }
}
