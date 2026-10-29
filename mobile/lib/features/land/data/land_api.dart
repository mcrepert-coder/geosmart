import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../domain/entities/land_models.dart';
import '../domain/entities/parcel_draft.dart';

/// Erreur renvoyee par l'API fonciere, au format commun du contrat
/// ({ code, message, details }). [status] vaut 0 sans reponse du serveur.
class LandApiException implements Exception {
  const LandApiException(this.status, this.code, this.message, [this.details]);

  final int status;
  final String code;
  final String message;
  final Map<String, dynamic>? details;

  bool get isNetwork => status == 0;

  @override
  String toString() => 'LandApiException($status, $code, $message)';
}

/// Fournit le jeton de l'utilisateur connecte (module comptes de Beni).
typedef TokenProvider = Future<String?> Function();

/// Routes protegees de contracts/land.yaml. La route publique du statut est
/// dans ParcelStatusApi.
class LandApi {
  LandApi(
    this._client, {
    required String baseUrl,
    required this.token,
    this.timeout = const Duration(seconds: 15),
  }) : _baseUrl = baseUrl.endsWith('/')
           ? baseUrl.substring(0, baseUrl.length - 1)
           : baseUrl;

  final http.Client _client;
  final String _baseUrl;
  final TokenProvider token;
  final Duration timeout;

  /// POST /parcels. La cle d'idempotence est le clientId de la file d'envoi
  /// (RG-08) : renvoyer la meme demande ne cree pas de doublon.
  Future<ParcelInfo> createParcel(
    ParcelDraft draft, {
    required String idempotencyKey,
  }) async => ParcelInfo.fromJson(
    await _send(
          'POST',
          '/parcels',
          body: draft.toCreatePayload(),
          headers: {'Idempotency-Key': idempotencyKey},
        )
        as Map<String, dynamic>,
  );

  /// PATCH /parcels/:id : nouvelle version de la limite (EF-205). Reponses a
  /// prevoir : 409 VERSION_CONFLICT (parcelle modifiee entre-temps) ou
  /// PARCEL_OVERLAP, 403 si l'utilisateur n'est pas le geometre auteur.
  Future<ParcelInfo> updateParcel(
    String parcelId,
    ParcelDraft draft, {
    required int expectedVersion,
    String? reason,
  }) async => ParcelInfo.fromJson(
    await _send(
          'PATCH',
          '/parcels/${Uri.encodeComponent(parcelId)}',
          body: draft.toUpdatePayload(
            expectedVersion: expectedVersion,
            reason: reason,
          ),
        )
        as Map<String, dynamic>,
  );

  Future<ParcelInfo> getParcel(String parcelId) async => ParcelInfo.fromJson(
    await _send('GET', '/parcels/${Uri.encodeComponent(parcelId)}')
        as Map<String, dynamic>,
  );

  Future<List<ParcelVersionInfo>> listVersions(String parcelId) async => [
    for (final v
        in await _send(
              'GET',
              '/parcels/${Uri.encodeComponent(parcelId)}/versions',
            )
            as List)
      ParcelVersionInfo.fromJson(v as Map<String, dynamic>),
  ];

  Future<AttestationInfo> issueAttestation(String parcelId) async =>
      AttestationInfo.fromJson(
        await _send(
              'POST',
              '/parcels/${Uri.encodeComponent(parcelId)}/attestations',
            )
            as Map<String, dynamic>,
      );

  Future<List<SurveyRequestInfo>> listSurveyRequests({String? state}) async => [
    for (final r
        in await _send('GET', '/survey-requests', query: {'state': ?state})
            as List)
      SurveyRequestInfo.fromJson(r as Map<String, dynamic>),
  ];

  Future<SurveyRequestInfo> createSurveyRequest({
    required String locality,
    required String description,
    ({double longitude, double latitude})? approxLocation,
  }) async => SurveyRequestInfo.fromJson(
    await _send(
          'POST',
          '/survey-requests',
          body: {
            'locality': locality,
            'description': description,
            if (approxLocation != null)
              'approxLocation': {
                'longitude': approxLocation.longitude,
                'latitude': approxLocation.latitude,
              },
          },
        )
        as Map<String, dynamic>,
  );

  Future<SurveyRequestInfo> takeSurveyRequest(String requestId) async =>
      SurveyRequestInfo.fromJson(
        await _send(
              'POST',
              '/survey-requests/${Uri.encodeComponent(requestId)}/take',
            )
            as Map<String, dynamic>,
      );

  /// Le geometre qui a pris la demande la termine (decision 5 de #24).
  Future<SurveyRequestInfo> completeSurveyRequest(
    String requestId, {
    String? parcelId,
  }) async => SurveyRequestInfo.fromJson(
    await _send(
          'POST',
          '/survey-requests/${Uri.encodeComponent(requestId)}/complete',
          body: {'parcelId': ?parcelId},
        )
        as Map<String, dynamic>,
  );

  /// L'agent annule sa demande tant qu'elle est ouverte (decision 5 de #24).
  Future<SurveyRequestInfo> cancelSurveyRequest(String requestId) async =>
      SurveyRequestInfo.fromJson(
        await _send(
              'POST',
              '/survey-requests/${Uri.encodeComponent(requestId)}/cancel',
            )
            as Map<String, dynamic>,
      );

  Future<Object?> _send(
    String method,
    String path, {
    Object? body,
    Map<String, String> headers = const {},
    Map<String, String> query = const {},
  }) async {
    final uri = Uri.parse(
      '$_baseUrl$path',
    ).replace(queryParameters: query.isEmpty ? null : query);
    final request = http.Request(method, uri)
      ..headers.addAll({'Accept': 'application/json', ...headers});
    final jwt = await token();
    if (jwt != null) request.headers['Authorization'] = 'Bearer $jwt';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final http.Response res;
    try {
      res = await http.Response.fromStream(
        await _client.send(request).timeout(timeout),
      );
    } on SocketException {
      throw const LandApiException(
        0,
        'NETWORK',
        'Pas de connexion au serveur.',
      );
    } on TimeoutException {
      throw const LandApiException(0, 'NETWORK', 'Le serveur ne répond pas.');
    } on http.ClientException {
      throw const LandApiException(
        0,
        'NETWORK',
        'Pas de connexion au serveur.',
      );
    }

    final decoded = res.bodyBytes.isEmpty
        ? null
        : _tryDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 200 && res.statusCode < 300) return decoded;
    final error = decoded is Map<String, dynamic>
        ? decoded
        : const <String, dynamic>{};
    throw LandApiException(
      res.statusCode,
      (error['code'] as String?) ?? 'HTTP_${res.statusCode}',
      (error['message'] as String?) ?? 'Erreur du serveur (${res.statusCode}).',
      error['details'] as Map<String, dynamic>?,
    );
  }

  static Object? _tryDecode(String text) {
    try {
      return jsonDecode(text);
    } on FormatException {
      return null;
    }
  }
}
