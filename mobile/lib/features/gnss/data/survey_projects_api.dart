import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

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

  Future<List<SurveyProject>> list() async {
    final request = http.Request('GET', Uri.parse('$_baseUrl/projects'))
      ..headers['Accept'] = 'application/json';
    final jwt = await token();
    if (jwt != null) request.headers['Authorization'] = 'Bearer $jwt';

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

    Object? body;
    try {
      body = res.bodyBytes.isEmpty
          ? null
          : jsonDecode(utf8.decode(res.bodyBytes));
    } on FormatException {
      body = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300 && body is List) {
      return [for (final item in body) ?SurveyProject.fromJson(item)];
    }
    final message = body is Map<String, dynamic> && body['message'] is String
        ? body['message'] as String
        : 'Les chantiers ne peuvent pas être chargés (${res.statusCode}).';
    throw SurveyProjectsException(message);
  }
}
