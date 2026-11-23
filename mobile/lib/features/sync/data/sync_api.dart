// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../account/domain/repositories/session_store.dart';
import '../../gnss/domain/repositories/sync_transport.dart';

/// Erreur de `POST /sync` au format commun du contrat
/// ({ code, message, details }). [status] vaut 0 sans reponse du serveur.
class SyncApiException implements Exception {
  const SyncApiException(this.status, this.code, this.message);

  final int status;
  final String code;
  final String message;

  bool get isNetwork => status == 0;

  /// Refus metier (400, 403, 409) : le renvoi ne changera pas le resultat,
  /// l'element doit etre conserve avec son motif (EF-405).
  bool get isBusiness => status >= 400 && status < 500;

  @override
  String toString() => 'SyncApiException($status, $code, $message)';
}

/// Envoie un element de la file locale vers `POST /sync` (contracts/sync.yaml)
/// avec le jeton du compte connecte (module comptes). Implemente le port
/// SyncTransport du module GNSS pour remplacer l'envoi sans authentification.
class SyncApi implements SyncTransport {
  SyncApi(
    this._client, {
    required String baseUrl,
    required AccessTokenProvider token,
    this.timeout = const Duration(seconds: 15),
  }) : _baseUrl = baseUrl.endsWith('/')
           ? baseUrl.substring(0, baseUrl.length - 1)
           : baseUrl,
       _token = token;

  final http.Client _client;
  final String _baseUrl;
  final AccessTokenProvider _token;
  final Duration timeout;

  @override
  Future<void> send(Map<String, dynamic> payload) async {
    final request = http.Request('POST', Uri.parse('$_baseUrl/sync'))
      ..headers['Accept'] = 'application/json'
      ..headers['Content-Type'] = 'application/json'
      ..body = jsonEncode(payload);
    final jwt = await _token();
    if (jwt != null) request.headers['Authorization'] = 'Bearer $jwt';

    final http.Response res;
    try {
      res = await http.Response.fromStream(
        await _client.send(request).timeout(timeout),
      );
    } on SocketException {
      throw const SyncApiException(0, 'NETWORK', 'Pas de connexion au serveur.');
    } on TimeoutException {
      throw const SyncApiException(0, 'NETWORK', 'Le serveur ne repond pas.');
    } on http.ClientException {
      throw const SyncApiException(
        0,
        'NETWORK',
        'Pas de connexion au serveur.',
      );
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return;
    Object? decoded;
    try {
      decoded = res.bodyBytes.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    } on FormatException {
      decoded = null;
    }
    final error = decoded is Map<String, dynamic>
        ? decoded
        : const <String, dynamic>{};
    throw SyncApiException(
      res.statusCode,
      (error['code'] as String?) ?? 'HTTP_${res.statusCode}',
      (error['message'] as String?) ?? 'Erreur du serveur (${res.statusCode}).',
    );
  }
}
