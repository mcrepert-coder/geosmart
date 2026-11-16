import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/land/domain/entities/parcel_draft.dart';
import 'package:geosmart_mobile/features/land/presentation/create_parcel_page.dart';

SurveyPoint point(int n, double lat, double lon) => SurveyPoint(
  id: 'pt-$n',
  clientId: 'c-$n',
  projectId: 'chantier-1',
  surveyorId: 'geometre-1',
  pointNumber: n,
  pointName: 'B$n',
  latitude: lat,
  longitude: lon,
  fixQuality: GnssFixQuality.fixed,
  satellitesCount: 18,
  pdop: 1.4,
  recordedAt: DateTime.utc(2026, 10, 24, 9, 30),
);

final square = [
  point(1, 6.13, 1.21),
  point(2, 6.13, 1.211),
  point(3, 6.131, 1.211),
  point(4, 6.131, 1.21),
];

Future<List<ParcelDraft>> pump(WidgetTester tester, ParcelDraft draft) async {
  final queued = <ParcelDraft>[];
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: CreateParcelPage(
        initialDraft: draft,
        onQueue: (d) async => queued.add(d),
      ),
    ),
  );
  return queued;
}

FilledButton queueButton(WidgetTester tester) => tester.widget<FilledButton>(
  find.widgetWithText(FilledButton, "Mettre en file d'envoi"),
);

void main() {
  testWidgets('affiche surface, perimetre et bornes, et explique le blocage', (
    tester,
  ) async {
    await pump(
      tester,
      ParcelDraft(surveySessionId: 'chantier-1', points: square),
    );

    // Au-dela de 10 000 m2, la surface est aussi donnee en ha, a, ca.
    expect(find.text('12 242,64 m² (1 ha 22 a 43 ca)'), findsOneWidget);
    expect(find.text('4 Fixed'), findsOneWidget);
    expect(
      find.text('Polygone fermé, aucune auto-intersection.'),
      findsOneWidget,
    );
    expect(queueButton(tester).onPressed, isNull);
    expect(find.text('Choisissez la commune.'), findsOneWidget);
  });

  testWidgets('met en file une fois commune et statut choisis', (tester) async {
    final queued = await pump(
      tester,
      ParcelDraft(
        surveySessionId: 'chantier-1',
        points: square,
        commune: 'AG3',
      ),
    );

    expect(find.text('Choisissez le statut juridique.'), findsOneWidget);
    await tester.tap(find.text('Coutumier'));
    await tester.pump();
    expect(queueButton(tester).onPressed, isNotNull);

    await tester.tap(find.text("Mettre en file d'envoi"));
    await tester.pumpAndSettle();
    expect(queued.single.declaredStatus, DeclaredStatus.coutumier);
    expect(
      find.text("Parcelle enregistrée sur l'appareil, en file d'envoi"),
      findsOneWidget,
    );
  });

  testWidgets('demande le numero de titre pour une parcelle titree', (
    tester,
  ) async {
    await pump(
      tester,
      ParcelDraft(
        surveySessionId: 'chantier-1',
        points: square,
        commune: 'AG3',
      ),
    );
    await tester.tap(find.text('Titré'));
    await tester.pump();
    expect(find.text('Saisissez le n° de titre.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'TF 12345/RT');
    await tester.pump();
    expect(queueButton(tester).onPressed, isNotNull);
  });

  testWidgets('nomme les cotes croises et bloque l envoi', (tester) async {
    await pump(
      tester,
      ParcelDraft(
        surveySessionId: 'chantier-1',
        points: [square[0], square[2], square[1], square[3]],
        commune: 'AG3',
        declaredStatus: DeclaredStatus.coutumier,
      ),
    );
    expect(
      find.text('Les côtés B1-B3 et B2-B4 se croisent. Réordonnez les bornes.'),
      findsOneWidget,
    );
    expect(find.text("Corrigez l'ordre des bornes."), findsOneWidget);
    expect(queueButton(tester).onPressed, isNull);
  });
}
