import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/listings/data/listings_repository.dart';
import 'package:http/http.dart' as http;

class _MockClient extends http.BaseClient {
  _MockClient(this.handler);

  final Future<http.Response> Function(Uri uri) handler;
  Uri? requestedUri;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requestedUri = request.url;
    final response = await handler(request.url);
    return http.StreamedResponse(
      Stream.value(response.bodyBytes),
      response.statusCode,
      headers: response.headers,
    );
  }
}

void main() {
  test(
    'requests filtered paginated properties and parses nested data',
    () async {
      final client = _MockClient(
        (_) async => http.Response.bytes(
          utf8.encode(
            jsonEncode({
              'items': [
                {
                  'id': 'property-1',
                  'parcelId': 'parcel-1',
                  'type': 'TERRAIN',
                  'transaction': 'VENTE',
                  'title': 'Terrain de test',
                  'description': 'Description de test',
                  'price': 120000,
                  'currency': 'XOF',
                  'pricePeriod': null,
                  'zone': 'Dakar',
                  'badges': {'parcelCertified': true, 'agentCertified': false},
                  'parcel': {
                    'id': 'parcel-1',
                    'legalStatus': 'TITRE',
                    'certified': true,
                    'areaM2': 500,
                    'approximateLocation': {
                      'latitude': 14.7,
                      'longitude': -17.4,
                    },
                  },
                  'primaryPhotoUrl': null,
                  'publishedAt': '2026-10-01T10:00:00Z',
                  'status': 'PUBLIE',
                },
              ],
              'page': 2,
              'pageSize': 10,
              'total': 21,
            }),
          ),
          200,
        ),
      );
      final repository = ListingsRepository(
        client: client,
        apiBaseUrl: 'https://api.example.test/v1/',
      );

      final page = await repository.fetchProperties(
        type: 'TERRAIN',
        transaction: 'VENTE',
        priceMin: 50000,
        priceMax: 200000,
        legalStatus: 'TITRE',
        parcelCertified: true,
        agentCertified: false,
        zone: 'Dakar',
        page: 2,
        pageSize: 10,
        sort: 'price_asc',
      );

      expect(client.requestedUri!.path, '/v1/properties');
      expect(client.requestedUri!.queryParameters, {
        'type': 'TERRAIN',
        'transaction': 'VENTE',
        'priceMin': '50000',
        'priceMax': '200000',
        'legalStatus': 'TITRE',
        'parcelCertified': 'true',
        'agentCertified': 'false',
        'zone': 'Dakar',
        'page': '2',
        'pageSize': '10',
        'sort': 'price_asc',
      });
      expect(page.total, 21);
      expect(page.page, 2);
      expect(page.items.single.title, 'Terrain de test');
      expect(page.items.single.parcel.latitude, 14.7);
      expect(page.items.single.parcelCertified, isTrue);
      expect(page.items.single.agentCertified, isFalse);
      expect(page.items.single.description, 'Description de test');
      expect(page.items.single.status, 'PUBLIE');
    },
  );

  test('fetches a public property detail by its identifier', () async {
    final client = _MockClient(
      (_) async => http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'id': 'property-1',
            'parcelId': 'TG-AGO-00001',
            'type': 'MAISON',
            'transaction': 'LOCATION',
            'title': 'Maison',
            'description': 'Deux chambres',
            'price': 150000,
            'currency': 'XOF',
            'pricePeriod': 'MOIS',
            'zone': null,
            'status': 'PUBLIE',
            'badges': {'parcelCertified': true, 'agentCertified': false},
            'parcel': {
              'id': 'TG-AGO-00001',
              'legalStatus': 'TITRE',
              'certified': true,
              'areaM2': 200,
              'approximateLocation': {'latitude': 6.1, 'longitude': 1.2},
            },
            'primaryPhotoUrl': null,
            'publishedAt': null,
          }),
        ),
        200,
      ),
    );
    final repository = ListingsRepository(
      client: client,
      apiBaseUrl: 'https://api.example.test',
    );

    final property = await repository.fetchProperty('property-1');

    expect(client.requestedUri!.path, '/properties/property-1');
    expect(property.title, 'Maison');
    expect(property.description, 'Deux chambres');
    expect(property.zone, isNull);
  });

  test('reports a useful configuration message when base URL is missing', () {
    final repository = ListingsRepository(
      client: _MockClient((_) async => http.Response('', 200)),
      apiBaseUrl: '',
    );

    expect(
      repository.fetchProperties(),
      throwsA(
        isA<ListingsException>().having(
          (error) => error.message,
          'message',
          contains('GEOSMART_API_URL'),
        ),
      ),
    );
  });

  test(
    'reports HTTP failures instead of returning an empty catalogue',
    () async {
      final repository = ListingsRepository(
        client: _MockClient((_) async => http.Response('', 503)),
        apiBaseUrl: 'https://api.example.test',
      );

      await expectLater(
        repository.fetchProperties(),
        throwsA(
          isA<ListingsException>().having(
            (error) => error.message,
            'message',
            contains('503'),
          ),
        ),
      );
    },
  );
}
