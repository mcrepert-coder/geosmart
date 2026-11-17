import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/account/data/auth_api.dart';
import 'package:geosmart_mobile/features/account/domain/repositories/session_store.dart';
import 'package:geosmart_mobile/features/account/presentation/login_gate_page.dart';
import 'package:geosmart_mobile/features/account/presentation/login_page.dart';
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
  Future<AuthController> pumpPage(WidgetTester tester) async {
    final api = AuthApi(
      MockClient((request) async =>
          http.Response('{"message":"indisponible"}', 500)),
      baseUrl: 'https://api.test',
    );
    final controller = AuthController(api: api, store: _FakeSessionStore());
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: LoginGatePage(auth: controller),
      ),
    );
    await tester.pump();
    return controller;
  }

  testWidgets('affiche le message et le bouton au centre', (tester) async {
    await pumpPage(tester);

    expect(find.text('Veuillez vous connecter'), findsOneWidget);
    expect(find.text('Connexion'), findsOneWidget);

    final size = tester.view.physicalSize / tester.view.devicePixelRatio;
    expect(
      tester.getCenter(find.text('Veuillez vous connecter')).dx,
      size.width / 2,
    );
    expect(tester.getCenter(find.text('Connexion')).dx, size.width / 2);
    expect(find.byType(Center), findsOneWidget);
  });

  testWidgets('le bouton ouvre l ecran de connexion', (tester) async {
    await pumpPage(tester);

    await tester.tap(find.text('Connexion'));
    await tester.pumpAndSettle();

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.text('Numero de telephone'), findsOneWidget);
  });
}
