import 'dart:convert';

import 'package:http/http.dart' as http;

import '../domain/property_page.dart';
import '../domain/property_summary.dart';

const String defaultListingsApiBaseUrl = String.fromEnvironment(
  'GEOSMART_API_URL',
  defaultValue: 'https://geosmart-zueq.onrender.com',
);

class ListingsException implements Exception {
  const ListingsException(this.message);

  final String message;

  @override
  String toString() => message;
}

class ListingsRepository {
  ListingsRepository({http.Client? client, String? apiBaseUrl})
    : _client = client ?? http.Client(),
      _ownsClient = client == null,
      _apiBaseUrl = apiBaseUrl ?? defaultListingsApiBaseUrl;

  final http.Client _client;
  final bool _ownsClient;
  final String _apiBaseUrl;

  Future<PropertyPage> fetchProperties({
    String? type,
    String? transaction,
    num? priceMin,
    num? priceMax,
    String? legalStatus,
    bool? parcelCertified,
    bool? agentCertified,
    String? zone,
    int page = 1,
    int pageSize = 20,
    String sort = 'recent',
  }) async {
    final baseUrl = _apiBaseUrl.trim();
    if (baseUrl.isEmpty) {
      throw const ListingsException(
        'Le catalogue est indisponible : configurez GEOSMART_API_URL '
        'pour connecter l’application au serveur.',
      );
    }

    final normalizedBase = baseUrl.endsWith('/') ? baseUrl : '$baseUrl/';
    final query = <String, String>{
      if (_hasValue(type)) 'type': type!.trim(),
      if (_hasValue(transaction)) 'transaction': transaction!.trim(),
      if (priceMin != null) 'priceMin': priceMin.toString(),
      if (priceMax != null) 'priceMax': priceMax.toString(),
      if (_hasValue(legalStatus)) 'legalStatus': legalStatus!.trim(),
      if (parcelCertified != null)
        'parcelCertified': parcelCertified.toString(),
      if (agentCertified != null) 'agentCertified': agentCertified.toString(),
      if (_hasValue(zone)) 'zone': zone!.trim(),
      'page': page.toString(),
      'pageSize': pageSize.toString(),
      'sort': sort,
    };

    try {
      final uri = Uri.parse(
        normalizedBase,
      ).resolve('properties').replace(queryParameters: query);
      final decoded = await _getJson(uri);
      return PropertyPage.fromJson(decoded);
    } on ListingsException {
      rethrow;
    } on FormatException {
      throw const ListingsException(
        'La réponse du catalogue est illisible. Réessayez plus tard.',
      );
    }
  }

  Future<PropertySummary> fetchProperty(String propertyId) async {
    final baseUrl = _apiBaseUrl.trim();
    if (baseUrl.isEmpty) {
      throw const ListingsException(
        'Le catalogue est indisponible : configurez GEOSMART_API_URL '
        'pour connecter l’application au serveur.',
      );
    }

    final normalizedBase = baseUrl.endsWith('/') ? baseUrl : '$baseUrl/';
    final uri = Uri.parse(
      normalizedBase,
    ).resolve('properties/${Uri.encodeComponent(propertyId)}');
    return PropertySummary.fromJson(await _getJson(uri));
  }

  Future<Map<String, dynamic>> _getJson(Uri uri) async {
    try {
      final response = await _client.get(uri);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ListingsException(
          'Le serveur du catalogue a répondu avec le code '
          '${response.statusCode}. Réessayez plus tard.',
        );
      }

      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is! Map) {
        throw const FormatException('Expected a JSON object.');
      }
      return Map<String, dynamic>.from(decoded);
    } on ListingsException {
      rethrow;
    } on FormatException {
      throw const ListingsException(
        'La réponse du catalogue est illisible. Réessayez plus tard.',
      );
    } catch (error) {
      throw ListingsException(
        'Impossible de joindre le catalogue. Vérifiez votre connexion '
        'internet puis réessayez. ($error)',
      );
    }
  }

  void close() {
    if (_ownsClient) _client.close();
  }

  static bool _hasValue(String? value) =>
      value != null && value.trim().isNotEmpty;
}
