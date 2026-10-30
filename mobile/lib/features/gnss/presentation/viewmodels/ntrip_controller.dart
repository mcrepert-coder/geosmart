// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../data/datasources/ntrip_data_source.dart';
import '../../domain/entities/ntrip_caster.dart';
import '../../domain/repositories/caster_credential_store.dart';
import '../../infrastructure/gnss_channel_rtcm_sink.dart';

/// Etat de la liaison NTRIP affiche par l'interface.
enum NtripStatus {
  idle('Inactif'),
  connecting('Connexion en cours'),
  streaming('Corrections recues'),
  error('Erreur');

  const NtripStatus(this.label);

  final String label;
}

typedef NtripConnectionFactory =
    NtripConnection Function(
      NtripCaster caster,
      void Function(bool streaming, String? error) onStatus,
    );

/// ViewModel du client NTRIP (EF-104).
///
/// Il garde la configuration du caster, pilote la connexion et expose un etat
/// lisible par l'ecran de configuration. Le transport RTCM reste injecte pour
/// que les tests n'ouvrent ni Bluetooth ni reseau.
class NtripController extends ChangeNotifier {
  NtripController({
    required CasterCredentialStore credentials,
    NtripConnectionFactory? connectionFactory,
  }) : _credentials = credentials,
       _connectionFactory = connectionFactory ?? _defaultConnection;

  final CasterCredentialStore _credentials;
  final NtripConnectionFactory _connectionFactory;

  NtripCaster? _caster;
  NtripConnection? _connection;
  NtripStatus _status = NtripStatus.idle;
  String? _error;
  bool _busy = false;
  bool _loaded = false;
  bool _disposed = false;

  NtripCaster? get caster => _caster;

  NtripStatus get status => _status;

  String? get error => _error;

  bool get isBusy => _busy;

  bool get isStreaming => _status == NtripStatus.streaming;

  /// Charge la configuration memorisee une seule fois.
  Future<void> loadSaved() async {
    if (_loaded) return;
    _loaded = true;
    try {
      _caster = await _credentials.load();
    } catch (error) {
      _error = error.toString();
    }
    _notify();
  }

  /// Enregistre la configuration puis ouvre la liaison NTRIP.
  Future<bool> connect(NtripCaster caster) async {
    await disconnect();
    _busy = true;
    _caster = caster;
    _status = NtripStatus.connecting;
    _error = null;
    _notify();

    try {
      await _credentials.save(caster);
    } catch (error) {
      _busy = false;
      _status = NtripStatus.error;
      _error = error.toString();
      _notify();
      return false;
    }

    final connection = _connectionFactory(caster, _onStatus);
    _connection = connection;
    final started = await connection.start();
    _busy = false;
    if (!started) {
      _status = NtripStatus.error;
      _error ??= 'Connexion NTRIP impossible.';
    }
    _notify();
    return started;
  }

  Future<void> disconnect() async {
    final connection = _connection;
    _connection = null;
    await connection?.stop();
    _status = NtripStatus.idle;
    _error = null;
    _notify();
  }

  /// Oublie la configuration memorisee.
  Future<void> forget() async {
    await disconnect();
    await _credentials.clear();
    _caster = null;
    _notify();
  }

  void _onStatus(bool streaming, String? error) {
    if (streaming) {
      _status = NtripStatus.streaming;
      _error = null;
    } else if (error != null) {
      _status = NtripStatus.error;
      _error = error;
    } else if (_status != NtripStatus.connecting) {
      _status = NtripStatus.idle;
    }
    _notify();
  }

  static NtripConnection _defaultConnection(
    NtripCaster caster,
    void Function(bool streaming, String? error) onStatus,
  ) {
    return NtripDataSource(
      caster: caster,
      sink: GnssChannelRtcmSink(),
      onStatus: onStatus,
    );
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_connection?.stop());
    _connection = null;
    super.dispose();
  }
}
