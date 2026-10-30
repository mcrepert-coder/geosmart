import 'dart:async';
import 'dart:typed_data';

import '../../domain/entities/ntrip_caster.dart';
import '../../domain/repositories/rtcm_sink.dart';
import 'ntrip_client.dart';

/// Cycle de vie minimal d'une connexion NTRIP, injectable dans le ViewModel.
abstract interface class NtripConnection {
  Future<bool> start();

  Future<void> stop();
}

/// Recoit les corrections RTCM 3.x d'un caster et les injecte dans le
/// recepteur GNSS. La reconnexion est automatique tant que la session est
/// active.
class NtripDataSource implements NtripConnection {
  NtripDataSource({
    required this.caster,
    required this.sink,
    NtripClient? client,
    this.retryDelay = const Duration(seconds: 5),
    this.onStatus,
  }) : _client = client ?? DioNtripClient();

  final NtripCaster caster;
  final RtcmSink sink;
  final NtripClient _client;
  final Duration retryDelay;
  final void Function(bool streaming, String? error)? onStatus;

  StreamSubscription<List<int>>? _subscription;
  Timer? _retryTimer;
  bool _active = false;
  bool _streaming = false;

  bool get isActive => _active;

  bool get isStreaming => _streaming;

  @override
  Future<bool> start() async {
    if (_active) return _streaming;
    _active = true;
    return _connect();
  }

  @override
  Future<void> stop() async {
    _active = false;
    _retryTimer?.cancel();
    _retryTimer = null;
    await _subscription?.cancel();
    _subscription = null;
    _setStreaming(false, null);
  }

  Future<bool> _connect() async {
    if (!_active) return false;
    try {
      final stream = await _client.open(caster);
      if (!_active) return false;
      _subscription = stream.listen(
        _onData,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: true,
      );
      _setStreaming(true, null);
      return true;
    } catch (error) {
      _setStreaming(false, _message(error));
      _scheduleReconnect();
      return false;
    }
  }

  void _onData(List<int> bytes) {
    if (!_active) return;
    unawaited(sink.sendRtcm(Uint8List.fromList(bytes)));
  }

  void _onError(Object error, StackTrace stack) {
    if (!_active) return;
    _setStreaming(false, _message(error));
    _scheduleReconnect();
  }

  void _onDone() {
    if (!_active) return;
    _setStreaming(false, 'Le caster NTRIP a ferme le flux.');
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (!_active || _retryTimer != null) return;
    _retryTimer = Timer(retryDelay, () {
      _retryTimer = null;
      if (_active) unawaited(_connect());
    });
  }

  void _setStreaming(bool streaming, String? error) {
    if (_streaming == streaming && error == null) return;
    _streaming = streaming;
    onStatus?.call(streaming, error);
  }

  String _message(Object error) {
    if (error is NtripException) return error.message;
    return error.toString();
  }
}
