import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/listings/data/listings_repository.dart';
import 'package:geosmart_mobile/features/listings/presentation/listings_page.dart';
import 'package:http/http.dart' as http;

class _MockClient extends http.BaseClient {
  _MockClient(this.responseBody);

  final String responseBody;
  Uri? requestedUri;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requestedUri = request.url;
    return http.StreamedResponse(
      Stream.value(utf8.encode(responseBody)),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  }
}

void main() {
  testWidgets('shows public properties and supports a zone search', (
    tester,
  ) async {
    final client = _MockClient(
      jsonEncode({
        'items': [
          {
            'id': 'p-1',
            'parcelId': 'parcel-1',
            'type': 'TERRAIN',
            'transaction': 'VENTE',
            'title': 'Terrain à vendre',
            'description': 'Terrain bien situé',
            'price': 75000,
            'currency': 'XOF',
            'pricePeriod': null,
            'zone': 'Dakar',
            'badges': {'parcelCertified': true, 'agentCertified': true},
            'parcel': {
              'id': 'parcel-1',
              'legalStatus': 'verified',
              'certified': true,
              'areaM2': 300,
              'approximateLocation': {'latitude': 14.7, 'longitude': -17.4},
            },
            'primaryPhotoUrl': null,
            'publishedAt': '2026-10-01T10:00:00Z',
            'status': 'PUBLIE',
          },
        ],
        'page': 1,
        'pageSize': 20,
        'total': 21,
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ListingsPage(
          repository: ListingsRepository(
            client: client,
            apiBaseUrl: 'https://api.example.test',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Catalogue immobilier'), findsOneWidget);
    expect(find.text('Terrain à vendre'), findsOneWidget);
    expect(find.text('Parcelle certifiée'), findsOneWidget);
    expect(client.requestedUri!.path, '/properties');
    expect(client.requestedUri!.queryParameters['sort'], 'recent');
    expect(find.text('Page 1 sur 2'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Suivant'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Suivant'));
    await tester.pumpAndSettle();
    expect(client.requestedUri!.queryParameters['page'], '2');

    await tester.enterText(find.byType(TextField).first, 'Saint-Louis');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(client.requestedUri!.queryParameters['zone'], 'Saint-Louis');
    expect(client.requestedUri!.queryParameters['page'], '1');

    await tester.scrollUntilVisible(
      find.text('Terrain à vendre'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Terrain à vendre'));
    await tester.pumpAndSettle();
    expect(find.text('Détail du bien'), findsOneWidget);
    expect(client.requestedUri!.path, '/properties/p-1');
  });

  testWidgets('shows API configuration guidance when the URL is missing', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ListingsPage(
          repository: ListingsRepository(
            client: _MockClient('{}'),
            apiBaseUrl: '',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('GEOSMART_API_URL'), findsOneWidget);
    expect(find.text('Réessayer'), findsOneWidget);
  });

  testWidgets('rejects invalid price filters before sending a request', (
    tester,
  ) async {
    final client = _MockClient('{}');
    await tester.pumpWidget(
      MaterialApp(
        home: ListingsPage(
          repository: ListingsRepository(
            client: client,
            apiBaseUrl: 'https://api.example.test',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(1), '10.5');
    await tester.tap(find.text('Filtrer'));
    await tester.pumpAndSettle();

    expect(find.text('Saisissez un prix entier valide.'), findsOneWidget);
    expect(client.requestedUri!.queryParameters['priceMin'], isNull);
  });
}
