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

  testWidgets('affiche le message au-dessus du bouton place a 3/4 de la hauteur',
      (tester) async {
    await pumpPage(tester);

    expect(find.text('Veuillez vous connecter'), findsOneWidget);
    expect(find.text('Connexion'), findsOneWidget);

    final size = tester.view.physicalSize / tester.view.devicePixelRatio;
    expect(
      tester.getCenter(find.text('Veuillez vous connecter')).dx,
      size.width / 2,
    );
    final buttonCenter = tester.getCenter(find.text('Connexion'));
    expect(buttonCenter.dx, size.width / 2);
    expect(buttonCenter.dy, closeTo(size.height * 0.75, 24));
    expect(
      tester.getCenter(find.text('Veuillez vous connecter')).dy,
      lessThan(buttonCenter.dy),
    );
    expect(find.byType(Center), findsWidgets);
  });

  testWidgets('le carrousel a ses marges et le quart de la hauteur', (
    tester,
  ) async {
    await pumpPage(tester);

    final size = tester.view.physicalSize / tester.view.devicePixelRatio;
    final carousel = tester.getSize(find.byType(PageView));
    expect(carousel.width, closeTo(size.width - 2 * GeoSmartDimens.space4, 1));
    expect(carousel.height, closeTo(size.height * 0.25, 1));
    expect(
      tester.getTopLeft(find.byType(PageView)).dy,
      closeTo(GeoSmartDimens.space4, 1),
    );

    final dots = tester.widget<Row>(find.byKey(const Key('login-carousel-dots')));
    expect(dots.children, hasLength(3));
  });

  testWidgets('les dots sont centrees horizontalement', (tester) async {
    await pumpPage(tester);

    final size = tester.view.physicalSize / tester.view.devicePixelRatio;
    expect(
      tester.getCenter(find.byKey(const Key('login-carousel-dots'))).dx,
      size.width / 2,
    );
  });

  testWidgets('le carrousel avance automatiquement toutes les 3 secondes',
      (tester) async {
    await pumpPage(tester);

    final pageView = tester.widget<PageView>(find.byType(PageView));
    final controller = pageView.controller!;
    final initialPage = controller.page!;

    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();

    expect(controller.page, greaterThan(initialPage));
  });

  testWidgets('le bouton ouvre l ecran de connexion', (tester) async {
    await pumpPage(tester);

    await tester.tap(find.text('Connexion'));
    await tester.pumpAndSettle();

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.text('Numero de telephone'), findsOneWidget);
  });
}
