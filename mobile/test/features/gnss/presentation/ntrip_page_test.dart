import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/data/datasources/ntrip_data_source.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/caster_credential_store.dart';
import 'package:geosmart_mobile/features/gnss/presentation/ntrip_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/ntrip_controller.dart';

class FakeConnection implements NtripConnection {
  FakeConnection({required this.onStatus});

  final void Function(bool streaming, String? error) onStatus;
  int stops = 0;

  @override
  Future<bool> start() async {
    onStatus(true, null);
    return true;
  }

  @override
  Future<void> stop() async {
    stops++;
  }
}

class FakeFailingConnection implements NtripConnection {
  FakeFailingConnection({required this.onStatus});

  final void Function(bool streaming, String? error) onStatus;

  @override
  Future<bool> start() async {
    onStatus(false, 'SocketException: connexion refusee par le caster');
    return false;
  }

  @override
  Future<void> stop() async {}
}

void main() {
  Future<NtripController> pumpPage(
    WidgetTester tester, {
    NtripConnectionFactory? connectionFactory,
  }) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final controller = NtripController(
      credentials: InMemoryCasterCredentialStore(),
      connectionFactory:
          connectionFactory ??
          (caster, onStatus) => FakeConnection(onStatus: onStatus),
    );
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: NtripPage(controller: controller),
      ),
    );
    await tester.pumpAndSettle();
    return controller;
  }

  testWidgets('affiche le formulaire et l etat inactif', (tester) async {
    await pumpPage(tester);

    expect(find.text('Corrections NTRIP'), findsOneWidget);
    expect(find.text('Inactif'), findsOneWidget);
    expect(
      find.text(
        'Aucune correction RTCM recue. Renseignez le caster puis '
        'connectez-vous.',
      ),
      findsOneWidget,
    );
    expect(find.byType(TextField), findsNWidgets(5));
    expect(find.text('Connecter'), findsOneWidget);
  });

  testWidgets('refuse un formulaire incomplet', (tester) async {
    await pumpPage(tester);

    await tester.tap(find.text('Connecter'));
    await tester.pump();

    expect(find.text('Le serveur NTRIP est obligatoire.'), findsOneWidget);
  });

  testWidgets('affiche un message simple en cas d erreur', (tester) async {
    final controller = await pumpPage(
      tester,
      connectionFactory: (caster, onStatus) =>
          FakeFailingConnection(onStatus: onStatus),
    );
    final fields = find.byType(TextField);

    await tester.enterText(fields.at(0), 'caster.example');
    await tester.enterText(fields.at(2), 'RTK31N');
    await tester.enterText(fields.at(3), 'operateur');
    await tester.enterText(fields.at(4), 'secret');
    await tester.tap(find.text('Connecter'));
    await tester.pumpAndSettle();

    expect(controller.status, NtripStatus.error);
    expect(
      find.text(
        'La connexion a echoue. Une nouvelle tentative est lancee '
        'automatiquement.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('connecte le caster saisi', (tester) async {
    final controller = await pumpPage(tester);
    final fields = find.byType(TextField);

    await tester.enterText(fields.at(0), 'caster.example');
    await tester.enterText(fields.at(2), 'RTK31N');
    await tester.enterText(fields.at(3), 'operateur');
    await tester.enterText(fields.at(4), 'secret');
    await tester.tap(find.text('Connecter'));
    await tester.pumpAndSettle();

    expect(controller.caster?.host, 'caster.example');
    expect(controller.caster?.port, 2101);
    expect(controller.caster?.mountpoint, 'RTK31N');
    expect(controller.status, NtripStatus.streaming);
    expect(find.text('Corrections recues'), findsOneWidget);
    expect(
      find.text('Les corrections RTCM sont recues et envoyees au recepteur.'),
      findsOneWidget,
    );
    expect(find.text('Deconnecter'), findsOneWidget);
  });

  testWidgets('oublie la configuration memorisee', (tester) async {
    final controller = await pumpPage(tester);
    final fields = find.byType(TextField);

    await tester.enterText(fields.at(0), 'caster.example');
    await tester.enterText(fields.at(2), 'RTK31N');
    await tester.enterText(fields.at(3), 'operateur');
    await tester.enterText(fields.at(4), 'secret');
    await tester.tap(find.text('Connecter'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Oublier la configuration'));
    await tester.pumpAndSettle();

    expect(controller.caster, isNull);
    expect(controller.status, NtripStatus.idle);
    expect(find.text('Inactif'), findsOneWidget);
  });
}
