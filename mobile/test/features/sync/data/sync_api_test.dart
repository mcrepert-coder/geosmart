import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/sync/data/sync_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  const baseUrl = 'https://api.test';

  SyncApi apiWith(
    Future<http.Response> Function(http.Request request) handler,
  ) => SyncApi(
    MockClient(handler),
    baseUrl: baseUrl,
    token: () async => 'jwt-test',
  );

  group('SyncApi', () {
    test('envoie un element vers POST /sync avec le jeton', () async {
      late http.Request seen;
      final api = apiWith((request) async {
        seen = request;
        return http.Response(
          jsonEncode({
            'clientId': 'client-1',
            'result': 'ACCEPTED',
            'id': 'serveur-1',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      await api.send({'entityType': 'survey_session'});

      expect(seen.method, 'POST');
      expect(seen.url.path, '/sync');
      expect(seen.headers['Authorization'], 'Bearer jwt-test');
      expect(jsonDecode(seen.body), {'entityType': 'survey_session'});
    });

    test('signale un refus metier avec le motif du serveur', () async {
      final api = apiWith((_) async => http.Response(
        jsonEncode({
          'code': 'FORBIDDEN',
          'message': 'Le topographe n est pas assigne a ce chantier.',
        }),
        403,
        headers: {'content-type': 'application/json'},
      ));

      expect(
        () => api.send({'entityType': 'survey_session'}),
        throwsA(
          isA<SyncApiException>()
              .having((error) => error.status, 'status', 403)
              .having((error) => error.isBusiness, 'isBusiness', isTrue)
              .having(
                (error) => error.message,
                'message',
                contains('pas assigne'),
              ),
        ),
      );
    });

    test('laisse une panne serveur en echec rejouable', () async {
      final api = apiWith((_) async => http.Response(
        jsonEncode({'code': 'SERVER_ERROR', 'message': 'Indisponible.'}),
        503,
        headers: {'content-type': 'application/json'},
      ));

      expect(
        () => api.send({'entityType': 'survey_session'}),
        throwsA(isA<SyncApiException>()),
      );
    });
  });
}
