import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/account/data/auth_api.dart';
import 'package:geosmart_mobile/features/account/domain/entities/account_user.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:geosmart_mobile/features/account/presentation/viewmodels/auth_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Session en memoire pour les tests.
class InMemorySessionStore implements SessionStore {
  AccountSession? session;

  @override
  Future<AccountSession?> load() async => session;

  @override
  Future<void> save(AccountSession value) async => session = value;

  @override
  Future<void> clear() async => session = null;
}

const _userJson = {
  'id': 'compte-1',
  'role': 'CLIENT',
  'registeredSurveyor': false,
  'accountActive': true,
};

const _tokensJson = {
  'accessToken': 'acces',
  'refreshToken': 'renouvellement',
  'tokenType': 'Bearer',
};

void main() {
  AuthController controllerWith(
    Future<http.Response> Function(http.Request request) handler, {
    InMemorySessionStore? store,
  }) {
    final api = AuthApi(MockClient(handler), baseUrl: 'https://api.test');
    return AuthController(api: api, store: store ?? InMemorySessionStore());
  }

  group('AuthController', () {
    test('demarre deconnecte sans session locale', () async {
      final controller = controllerWith(
        (request) async => http.Response('{}', 200),
      );

      await controller.bootstrap();

      expect(controller.status, AuthStatus.signedOut);
    });

    test('connexion reussie ouvre la session avec le role du serveur', () async {
      final store = InMemorySessionStore();
      final controller = controllerWith((request) async {
        if (request.url.path == '/auth/login') {
          return http.Response(
            jsonEncode(_tokensJson),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode(_userJson),
          200,
          headers: {'content-type': 'application/json'},
        );
      }, store: store);

      await controller.login(phone: '+22890000000', password: 'motdepasse');

      expect(controller.status, AuthStatus.signedIn);
      expect(controller.user?.role, AccountRole.client);
      expect(await controller.accessToken(), 'acces');
      expect(store.session, isNotNull);
    });

    test('blocage apres cinq echecs : message dedie (EF-407)', () async {
      final controller = controllerWith(
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

      await controller.login(phone: '+22890000000', password: 'faux');

      expect(controller.status, AuthStatus.signedOut);
      expect(controller.error, contains('bloquee 15 minutes'));
      expect(controller.lockedUntil, '2026-11-10T08:15:00.000Z');
    });

    test('compte en attente refuse a la connexion (403)', () async {
      final controller = controllerWith(
        (request) async => http.Response(
          jsonEncode({
            'code': 'ACCOUNT_NOT_ACTIVE',
            'message': "Le compte n'est pas actif.",
          }),
          403,
          headers: {'content-type': 'application/json'},
        ),
      );

      await controller.login(phone: '+22890000000', password: 'motdepasse');

      expect(controller.status, AuthStatus.signedOut);
      expect(controller.error, "Le compte n'est pas actif.");
    });

    test('session locale avec jeton expire : renouvellement silencieux', () async {
      final store = InMemorySessionStore()
        ..session = const AccountSession(
          accessToken: 'expire',
          refreshToken: 'renouvellement',
          user: AccountUser(
            id: 'compte-1',
            role: AccountRole.client,
            registeredSurveyor: false,
            accountActive: true,
          ),
        );
      var meCalls = 0;
      final controller = controllerWith((request) async {
        if (request.url.path == '/auth/me') {
          meCalls++;
          if (request.headers['Authorization'] == 'Bearer expire') {
            return http.Response(
              jsonEncode({'code': 'UNAUTHORIZED', 'message': 'Connexion requise.'}),
              401,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response(
            jsonEncode(_userJson),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path == '/auth/tokens/refresh') {
          return http.Response(
            jsonEncode(_tokensJson),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      }, store: store);

      await controller.bootstrap();

      expect(controller.status, AuthStatus.signedIn);
      expect(await controller.accessToken(), 'acces');
      expect(meCalls, 2);
    });

    test('renouvellement refuse : retour a la connexion', () async {
      final store = InMemorySessionStore()
        ..session = const AccountSession(
          accessToken: 'expire',
          refreshToken: 'utilise',
          user: AccountUser(
            id: 'compte-1',
            role: AccountRole.client,
            registeredSurveyor: false,
            accountActive: true,
          ),
        );
      final controller = controllerWith((request) async {
        if (request.url.path == '/auth/me') {
          return http.Response(
            jsonEncode({'code': 'UNAUTHORIZED', 'message': 'Connexion requise.'}),
            401,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({'code': 'UNAUTHORIZED', 'message': 'Connexion requise.'}),
          401,
          headers: {'content-type': 'application/json'},
        );
      }, store: store);

      await controller.bootstrap();

      expect(controller.status, AuthStatus.signedOut);
    });

    test('deconnexion efface la session locale', () async {
      final store = InMemorySessionStore();
      final controller = controllerWith((request) async {
        if (request.url.path == '/auth/login') {
          return http.Response(
            jsonEncode(_tokensJson),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode(_userJson),
          200,
          headers: {'content-type': 'application/json'},
        );
      }, store: store);
      await controller.login(phone: '+22890000000', password: 'motdepasse');

      await controller.logout();

      expect(controller.status, AuthStatus.signedOut);
      expect(store.session, isNull);
      expect(await controller.accessToken(), isNull);
    });
  });
}
