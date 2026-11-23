import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../domain/entities/managed_project.dart';
import '../domain/entities/survey_project.dart';

/// Erreur de GET /projects, avec un message lisible pour l'ecran.
class SurveyProjectsException implements Exception {
  const SurveyProjectsException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Lit les chantiers du compte connecte (GET /projects) : pour un
/// topographe, ceux qui lui sont assignes.
class SurveyProjectsApi {
  SurveyProjectsApi(
    this._client, {
    required String baseUrl,
    required this.token,
    this.timeout = const Duration(seconds: 15),
  }) : _baseUrl = baseUrl.endsWith('/')
           ? baseUrl.substring(0, baseUrl.length - 1)
           : baseUrl;

  final http.Client _client;
  final String _baseUrl;
  final Future<String?> Function() token;
  final Duration timeout;

  /// Chantiers du compte connecte (GET /projects).
  Future<List<SurveyProject>> list() async {
    final body = await _send('GET', '/projects');
    return [
      if (body is List)
        for (final item in body) ?SurveyProject.fromJson(item),
    ];
  }

  /// Chantiers geres, avec topographes et suivi (GET /projects).
  Future<List<ManagedProject>> listManaged() async {
    final body = await _send('GET', '/projects');
    return [
      if (body is List)
        for (final item in body) ?ManagedProject.fromJson(item),
    ];
  }

  /// Topographes actifs a assigner (GET /projects/topographers).
  Future<List<ProjectTopographer>> listTopographers() async {
    final body = await _send('GET', '/projects/topographers');
    return [
      if (body is List)
        for (final item in body) ?ProjectTopographer.fromJson(item),
    ];
  }

  Future<void> create(String title) =>
      _send('POST', '/projects', body: {'title': title});

  Future<void> assign(String projectId, String accountId) => _send(
    'PUT',
    '/projects/${Uri.encodeComponent(projectId)}/topographers/'
        '${Uri.encodeComponent(accountId)}',
  );

  Future<void> unassign(String projectId, String accountId) => _send(
    'DELETE',
    '/projects/${Uri.encodeComponent(projectId)}/topographers/'
        '${Uri.encodeComponent(accountId)}',
  );

  Future<void> close(String projectId) =>
      _send('POST', '/projects/${Uri.encodeComponent(projectId)}/close');

  Future<Object?> _send(String method, String path, {Object? body}) async {
    final request = http.Request(method, Uri.parse('$_baseUrl$path'))
      ..headers['Accept'] = 'application/json';
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
      throw const SurveyProjectsException('Pas de connexion au serveur.');
    } on TimeoutException {
      throw const SurveyProjectsException('Le serveur ne répond pas.');
    } on http.ClientException {
      throw const SurveyProjectsException('Pas de connexion au serveur.');
    }

    Object? decoded;
    try {
      decoded = res.bodyBytes.isEmpty
          ? null
          : jsonDecode(utf8.decode(res.bodyBytes));
    } on FormatException {
      decoded = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return decoded;
    final message =
        decoded is Map<String, dynamic> && decoded['message'] is String
        ? decoded['message'] as String
        : 'Les chantiers ne peuvent pas être chargés (${res.statusCode}).';
    throw SurveyProjectsException(message);
  }
}
