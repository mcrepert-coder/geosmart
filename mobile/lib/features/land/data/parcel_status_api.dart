import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../domain/entities/parcel_public_status.dart';

/// Echec d'une verification : introuvable (404) ou pas de reponse du serveur.
class ParcelStatusException implements Exception {
  const ParcelStatusException(this.kind, this.message);

  final ParcelStatusFailure kind;
  final String message;
}

enum ParcelStatusFailure { notFound, network, server }

/// Route publique GET /parcels/:id/status (sans compte).
class ParcelStatusApi {
  ParcelStatusApi(
    this._client, {
    required this.baseUrl,
    this.timeout = const Duration(seconds: 10),
  });

  final http.Client _client;

  /// Adresse de l'API (API_BASE_URL du .env.example).
  final String baseUrl;
  final Duration timeout;

  Future<ParcelPublicStatus> fetch(String parcelId) async {
    final uri = Uri.parse(
      '${baseUrl.replaceFirst(RegExp(r'/$'), '')}/parcels/${Uri.encodeComponent(parcelId)}/status',
    );
    final http.Response res;
    try {
      res = await _client
          .get(uri, headers: {'Accept': 'application/json'})
          .timeout(timeout);
    } on SocketException {
      throw const ParcelStatusException(
        ParcelStatusFailure.network,
        'Pas de connexion au serveur.',
      );
    } on TimeoutException {
      throw const ParcelStatusException(
        ParcelStatusFailure.network,
        'Le serveur ne répond pas.',
      );
    } on http.ClientException {
      throw const ParcelStatusException(
        ParcelStatusFailure.network,
        'Pas de connexion au serveur.',
      );
    }
    if (res.statusCode == 200) {
      return ParcelPublicStatus.fromJson(
        jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>,
      );
    }
    if (res.statusCode == 404) {
      throw const ParcelStatusException(
        ParcelStatusFailure.notFound,
        'Parcelle introuvable.',
      );
    }
    throw ParcelStatusException(
      ParcelStatusFailure.server,
      'Erreur du serveur (${res.statusCode}).',
    );
  }
}
