import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/account/data/auth_api.dart';
import 'package:geosmart_mobile/features/account/domain/entities/account_user.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  const baseUrl = 'https://api.test';

  AuthApi apiWith(
    Future<http.Response> Function(http.Request request) handler,
  ) => AuthApi(MockClient(handler), baseUrl: baseUrl);

  group('AuthApi', () {
    test('login renvoie les jetons (EF-407)', () async {
      final api = apiWith(
        (request) async => http.Response(
          jsonEncode({
            'accessToken': 'acces',
            'refreshToken': 'renouvellement',
            'tokenType': 'Bearer',
            'expiresIn': 3600,
          }),
          200,
          headers: {'content-type': 'application/json'},
        ),
      );

      final tokens = await api.login(
        phone: '+22890000000',
        password: 'motdepasse',
      );

      expect(tokens.accessToken, 'acces');
      expect(tokens.refreshToken, 'renouvellement');
    });

    test('login expose le blocage apres cinq echecs (423, EF-407)', () async {
      final api = apiWith(
        (request) async => http.Response(
          jsonEncode({
            'code': 'LOGIN_TEMPORARILY_BLOCKED',
            'message': 'Trop de tentatives.',
            'details': {'lockedUntil': '2026-11-10T08:15:00.000Z'},
          }),
          423,
          headers: {'content-type': 'application/json'},
        ),
      );

      await expectLater(
        api.login(phone: '+22890000000', password: 'faux'),
        throwsA(
          isA<AuthApiException>()
              .having((error) => error.status, 'status', 423)
              .having(
                (error) => error.code,
                'code',
                'LOGIN_TEMPORARILY_BLOCKED',
              )
              .having(
                (error) => error.lockedUntil,
                'lockedUntil',
                '2026-11-10T08:15:00.000Z',
              ),
        ),
      );
    });

    test('login d un compte en attente renvoie 403 avec le message', () async {
      final api = apiWith(
        (request) async => http.Response(
          jsonEncode({
            'code': 'ACCOUNT_NOT_ACTIVE',
            'message': "Le compte n'est pas actif.",
          }),
          403,
          headers: {'content-type': 'application/json'},
        ),
      );

      await expectLater(
        api.login(phone: '+22890000000', password: 'motdepasse'),
        throwsA(
          isA<AuthApiException>().having(
            (error) => error.code,
            'code',
            'ACCOUNT_NOT_ACTIVE',
          ),
        ),
      );
    });

    test('refresh envoie le jeton de renouvellement', () async {
      late http.Request seen;
      final api = apiWith((request) async {
        seen = request;
        return http.Response(
          jsonEncode({
            'accessToken': 'nouveau-acces',
            'refreshToken': 'nouveau-renouvellement',
            'tokenType': 'Bearer',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final tokens = await api.refresh('ancien');

      expect(seen.url.path, '/auth/tokens/refresh');
      expect(jsonDecode(seen.body), {'refreshToken': 'ancien'});
      expect(tokens.accessToken, 'nouveau-acces');
    });

    test('me lit le role renvoye par le serveur (RG-06)', () async {
      late http.Request seen;
      final api = apiWith((request) async {
        seen = request;
        return http.Response(
          jsonEncode({
            'id': 'compte-1',
            'role': 'GEOMETRE',
            'registeredSurveyor': true,
            'accountActive': true,
            'fullName': 'Kanleto Beni',
            'ordreNumber': 'OT-123',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final user = await api.me('jeton');

      expect(seen.headers['Authorization'], 'Bearer jeton');
      expect(user.role, AccountRole.geometre);
      expect(user.registeredSurveyor, isTrue);
      expect(user.ordreNumber, 'OT-123');
    });

    test('une erreur serveur sans JSON garde le statut HTTP', () async {
      final api = apiWith((request) async => http.Response('', 500));

      await expectLater(
        api.login(phone: '+22890000000', password: 'motdepasse'),
        throwsA(
          isA<AuthApiException>().having(
            (error) => error.code,
            'code',
            'HTTP_500',
          ),
        ),
      );
    });
  });
}
