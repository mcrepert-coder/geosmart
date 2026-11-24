import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/account/data/auth_api.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:geosmart_mobile/features/account/presentation/login_page.dart';
import 'package:geosmart_mobile/features/account/presentation/viewmodels/auth_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

class _EmptySessionStore implements SessionStore {
  @override
  Future<AccountSession?> load() async => null;

  @override
  Future<void> save(AccountSession value) async {}

  @override
  Future<void> clear() async {}
}

void main() {
  testWidgets('le bouton ouvre la creation de compte sur le site', (tester) async {
    final auth = AuthController(
      api: AuthApi(
        MockClient((request) async => http.Response('{}', 200)),
        baseUrl: 'https://api.test',
      ),
      store: _EmptySessionStore(),
    );
    addTearDown(auth.dispose);
    Uri? opened;

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(
          auth: auth,
          onOpenAccountCreation: (url) async {
            opened = url;
            return true;
          },
        ),
      ),
    );

    await tester.tap(find.text('Creer un compte sur le site'));
    await tester.pumpAndSettle();

    expect(opened, Uri.parse(accountCreationUrl));
  });

  testWidgets('une erreur d ouverture affiche un message sans exception', (tester) async {
    final auth = AuthController(
      api: AuthApi(
        MockClient((request) async => http.Response('{}', 200)),
        baseUrl: 'https://api.test',
      ),
      store: _EmptySessionStore(),
    );
    addTearDown(auth.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(
          auth: auth,
          onOpenAccountCreation: (url) async => throw StateError('canal absent'),
        ),
      ),
    );

    await tester.tap(find.text('Creer un compte sur le site'));
    await tester.pumpAndSettle();

    expect(find.text('Impossible d ouvrir le site.'), findsOneWidget);
  });
}
