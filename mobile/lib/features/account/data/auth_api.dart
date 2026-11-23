import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../domain/entities/account_user.dart';

/// Erreur de l'API comptes au format commun du contrat
/// ({ code, message, details }). [status] vaut 0 sans reponse du serveur.
class AuthApiException implements Exception {
  const AuthApiException(this.status, this.code, this.message, [this.details]);

  final int status;
  final String code;
  final String message;
  final Map<String, dynamic>? details;

  bool get isNetwork => status == 0;

  /// 423 LOGIN_TEMPORARILY_BLOCKED : blocage 15 minutes apres 5 echecs
  /// (EF-407). details contient lockedUntil.
  String? get lockedUntil => details?['lockedUntil'] as String?;

  @override
  String toString() => 'AuthApiException($status, $code, $message)';
}

/// Compte renvoye par l'inscription : le statut explique ou en est la
/// demande (TELEPHONE_NON_VERIFIE, EN_ATTENTE, ACTIF, REJETE, SUSPENDU).
class RegisteredAccount {
  const RegisteredAccount({
    required this.id,
    required this.phone,
    required this.status,
    this.rejectionReason,
  });

  factory RegisteredAccount.fromJson(Map<String, dynamic> json) =>
      RegisteredAccount(
        id: json['id'] as String,
        phone: json['phone'] as String,
        status: json['status'] as String,
        rejectionReason: json['rejectionReason'] as String?,
      );

  final String id;
  final String phone;
  final String status;
  final String? rejectionReason;
}

/// Jetons renvoyes par login et refresh (EF-407).
class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken});

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
  );

  final String accessToken;
  final String refreshToken;
}

/// Routes de contracts/auth.yaml : inscription, code SMS, connexion,
/// renouvellement et profil.
class AuthApi {
  AuthApi(
    this._client, {
    required String baseUrl,
    this.timeout = const Duration(seconds: 15),
  }) : _baseUrl = baseUrl.endsWith('/')
           ? baseUrl.substring(0, baseUrl.length - 1)
           : baseUrl;

  final http.Client _client;
  final String _baseUrl;
  final Duration timeout;

  /// POST /auth/registrations : le code SMS est simule dans le journal du
  /// serveur tant qu'il n'y a pas de fournisseur (EF-401).
  Future<RegisteredAccount> register({
    required String phone,
    required String password,
  }) async => RegisteredAccount.fromJson(
    await _send('POST', '/auth/registrations', body: {
      'phone': phone,
      'password': password,
    }) as Map<String, dynamic>,
  );

  /// POST /auth/phone-verifications : valide le code recu par SMS.
  Future<RegisteredAccount> verifyPhone({
    required String phone,
    required String code,
  }) async => RegisteredAccount.fromJson(
    await _send('POST', '/auth/phone-verifications', body: {
      'phone': phone,
      'code': code,
    }) as Map<String, dynamic>,
  );

  /// POST /auth/login : 403 si le compte n'est pas actif, 423 apres cinq
  /// echecs pendant 15 minutes (EF-407).
  Future<AuthTokens> login({
    required String phone,
    required String password,
  }) async => AuthTokens.fromJson(
    await _send('POST', '/auth/login', body: {
      'phone': phone,
      'password': password,
    }) as Map<String, dynamic>,
  );

  /// POST /auth/tokens/refresh : le jeton de renouvellement est a usage
  /// unique, un nouveau couple est renvoye.
  Future<AuthTokens> refresh(String refreshToken) async => AuthTokens.fromJson(
    await _send('POST', '/auth/tokens/refresh', body: {
      'refreshToken': refreshToken,
    }) as Map<String, dynamic>,
  );

  /// GET /auth/me : profil courant, role relu en base par le serveur (RG-06).
  Future<AccountUser> me(String accessToken) async => AccountUser.fromJson(
    await _send('GET', '/auth/me', bearer: accessToken)
        as Map<String, dynamic>,
  );

  Future<Object?> _send(
    String method,
    String path, {
    Object? body,
    String? bearer,
  }) async {
    final request = http.Request(method, Uri.parse('$_baseUrl$path'))
      ..headers['Accept'] = 'application/json';
    if (bearer != null) request.headers['Authorization'] = 'Bearer $bearer';
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
      throw const AuthApiException(
        0,
        'NETWORK',
        'Pas de connexion au serveur.',
      );
    } on TimeoutException {
      throw const AuthApiException(0, 'NETWORK', 'Le serveur ne repond pas.');
    } on http.ClientException {
      throw const AuthApiException(
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
    throw AuthApiException(
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
