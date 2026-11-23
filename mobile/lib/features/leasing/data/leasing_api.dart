// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../account/domain/repositories/session_store.dart';
import '../domain/entities/leasing_models.dart';

/// Erreur de l'API location au format commun du contrat
/// ({ code, message, details }). [status] vaut 0 sans reponse du serveur.
class LeasingApiException implements Exception {
  const LeasingApiException(this.status, this.code, this.message);

  final int status;
  final String code;
  final String message;

  bool get isNetwork => status == 0;

  @override
  String toString() => 'LeasingApiException($status, $code, $message)';
}

/// Photo horodatee d'un etat des lieux, transportee en base64.
class InspectionPhotoPayload {
  const InspectionPhotoPayload({required this.takenAt, required this.dataBase64});

  final String takenAt;
  final String dataBase64;

  Map<String, dynamic> toJson() => {'takenAt': takenAt, 'dataBase64': dataBase64};
}

/// Routes de contracts/leasing.yaml : visites avec rappel (EF-305), etats des
/// lieux signes (EF-306), baux et loyers (EF-307). Aucune route de paiement
/// reel : Flooz et T-Money sont prevus en phase 3 (EF-309).
class LeasingApi {
  LeasingApi(
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

  /// POST /visits : un client demande la visite d'un bien publie.
  Future<Visit> requestVisit(
    String propertyId, {
    DateTime? scheduledAt,
    DateTime? reminderAt,
  }) async => Visit.fromJson(
    await _send('POST', '/visits', body: {
      'propertyId': propertyId,
      'scheduledAt': ?scheduledAt?.toUtc().toIso8601String(),
      'reminderAt': ?reminderAt?.toUtc().toIso8601String(),
    }) as Map<String, dynamic>,
  );

  /// GET /visits : mes demandes de visites.
  Future<List<Visit>> listVisits() async => [
    for (final visit in await _send('GET', '/visits') as List)
      Visit.fromJson(visit as Map<String, dynamic>),
  ];

  /// PUT /visits/:id/status : confirmation avec rappel, annulation, visite
  /// faite. Les transitions impossibles sont refusees par le serveur.
  Future<Visit> updateVisitStatus(
    String visitId,
    VisitStatus status, {
    DateTime? scheduledAt,
    DateTime? reminderAt,
  }) async => Visit.fromJson(
    await _send(
      'PUT',
      '/visits/${Uri.encodeComponent(visitId)}/status',
      body: {
        'status': status.serialized,
        'scheduledAt': ?scheduledAt?.toUtc().toIso8601String(),
        'reminderAt': ?reminderAt?.toUtc().toIso8601String(),
      },
    ) as Map<String, dynamic>,
  );

  /// POST /leases : reserve aux agents (un client ne cree pas de bail).
  Future<Lease> createLease({
    required String propertyId,
    required int monthlyRent,
    required String startDate,
    required int months,
    String? tenantName,
    String? tenantAccountId,
  }) async => Lease.fromJson(
    await _send('POST', '/leases', body: {
      'propertyId': propertyId,
      'monthlyRent': monthlyRent,
      'startDate': startDate,
      'months': months,
      'tenantName': ?tenantName,
      'tenantAccountId': ?tenantAccountId,
    }) as Map<String, dynamic>,
  );

  /// GET /leases/:id : bail, echeances et retards.
  Future<Lease> getLease(String leaseId) async => Lease.fromJson(
    await _send('GET', '/leases/${Uri.encodeComponent(leaseId)}')
        as Map<String, dynamic>,
  );

  /// POST /leases/:id/rents/:rentId/pay : loyer marque paye hors application
  /// (le paiement mobile arrive en phase 3).
  Future<Rent> markRentPaid(String leaseId, String rentId) async =>
      Rent.fromJson(
        await _send(
          'POST',
          '/leases/${Uri.encodeComponent(leaseId)}/rents/'
          '${Uri.encodeComponent(rentId)}/pay',
        ) as Map<String, dynamic>,
      );

  /// POST /leases/:id/inspections : etat des lieux d'entree ou de sortie.
  /// [clientId] vient de la file locale : un renvoi ne cree pas de doublon
  /// (CA-3, RG-08).
  Future<Inspection> createInspection(
    String leaseId, {
    required String clientId,
    required InspectionKind kind,
    required String tenantSignatureBase64,
    String? notes,
    List<InspectionPhotoPayload> photos = const [],
  }) async => Inspection.fromJson(
    await _send(
      'POST',
      '/leases/${Uri.encodeComponent(leaseId)}/inspections',
      body: {
        'clientId': clientId,
        'kind': kind.serialized,
        'tenantSignatureBase64': tenantSignatureBase64,
        'notes': ?notes,
        if (photos.isNotEmpty)
          'photos': photos.map((photo) => photo.toJson()).toList(),
      },
    ) as Map<String, dynamic>,
  );

  /// GET /leases/:id/inspections.
  Future<List<Inspection>> listInspections(String leaseId) async => [
    for (final inspection
        in await _send(
              'GET',
              '/leases/${Uri.encodeComponent(leaseId)}/inspections',
            )
            as List)
      Inspection.fromJson(inspection as Map<String, dynamic>),
  ];

  Future<Object?> _send(String method, String path, {Object? body}) async {
    final request = http.Request(method, Uri.parse('$_baseUrl$path'))
      ..headers['Accept'] = 'application/json';
    final jwt = await _token();
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
      throw const LeasingApiException(
        0,
        'NETWORK',
        'Pas de connexion au serveur.',
      );
    } on TimeoutException {
      throw const LeasingApiException(
        0,
        'NETWORK',
        'Le serveur ne repond pas.',
      );
    } on http.ClientException {
      throw const LeasingApiException(
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
    throw LeasingApiException(
      res.statusCode,
      (error['code'] as String?) ?? 'HTTP_${res.statusCode}',
      (error['message'] as String?) ??
          'Erreur du serveur (${res.statusCode}).',
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
