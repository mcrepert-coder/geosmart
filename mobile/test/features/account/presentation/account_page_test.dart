import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/account/data/auth_api.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:geosmart_mobile/features/account/presentation/account_page.dart';
import 'package:geosmart_mobile/features/account/presentation/viewmodels/auth_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _FakeSessionStore implements SessionStore {
  AccountSession? session;

  @override
  Future<AccountSession?> load() async => session;

  @override
  Future<void> save(AccountSession value) async => session = value;

  @override
  Future<void> clear() async => session = null;
}

void main() {
  Future<AuthController> signedInAs(Map<String, dynamic> user) async {
    final api = AuthApi(
      MockClient((request) async {
        if (request.url.path == '/auth/login') {
          return http.Response(
            jsonEncode({
              'accessToken': 'acces',
              'refreshToken': 'renouvellement',
              'tokenType': 'Bearer',
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode(user),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
      baseUrl: 'https://api.test',
    );
    final controller = AuthController(api: api, store: _FakeSessionStore());
    await controller.login(phone: '+22890000000', password: 'motdepasse');
    return controller;
  }

  Map<String, dynamic> user(String role) => {
    'id': 'compte-1',
    'role': role,
    'registeredSurveyor': false,
    'accountActive': true,
  };

  Future<void> pumpPage(WidgetTester tester, AuthController controller) async {
    await tester.pumpWidget(
      MaterialApp(home: AccountPage(auth: controller)),
    );
    await tester.pump();
  }

  testWidgets('EF-402 : un client ne voit ni baux ni administration', (tester) async {
    final controller = await signedInAs(user('CLIENT'));

    await pumpPage(tester, controller);

    expect(find.text('Visites de biens'), findsOneWidget);
    expect(find.text('Baux et loyers'), findsNothing);
    expect(find.text('Espace administrateur'), findsNothing);
    expect(find.text('Leves GNSS'), findsNothing);
  });

  testWidgets('EF-402 : un agent voit les visites et les baux', (tester) async {
    final controller = await signedInAs(user('AGENT'));

    await pumpPage(tester, controller);

    expect(find.text('Visites de biens'), findsOneWidget);
    expect(find.text('Baux et loyers'), findsOneWidget);
    expect(find.text('Espace administrateur'), findsNothing);
  });

  testWidgets('EF-402 : le geometre n a pas de raccourcis redondants', (tester) async {
    final controller = await signedInAs(user('GEOMETRE'));

    await pumpPage(tester, controller);

    expect(find.text('Leves GNSS'), findsNothing);
    expect(find.text('Carte des parcelles'), findsNothing);
    expect(find.text('Synchronisation'), findsNothing);
    expect(find.text('Demandes de leve'), findsNothing);
  });

  testWidgets('EF-402 : le topographe garde ses raccourcis de leve', (tester) async {
    final controller = await signedInAs(user('TOPOGRAPHE'));

    await pumpPage(tester, controller);

    expect(find.text('Leves GNSS'), findsOneWidget);
    expect(find.text('Carte des parcelles'), findsOneWidget);
    expect(find.text('Synchronisation'), findsOneWidget);
  });

  testWidgets('EF-402 : un administrateur voit son espace', (tester) async {
    final controller = await signedInAs(user('ADMIN'));

    await pumpPage(tester, controller);

    expect(find.text('Espace administrateur'), findsOneWidget);
  });

  testWidgets('compte suspendu : aucune action hors mon compte', (tester) async {
    final controller = await signedInAs({
      ...user('AGENT'),
      'accountActive': false,
    });

    await pumpPage(tester, controller);

    expect(
      find.textContaining('Compte en attente de validation ou suspendu'),
      findsOneWidget,
    );
    expect(find.text('Visites de biens'), findsNothing);
    expect(find.text('Baux et loyers'), findsNothing);
  });
}
