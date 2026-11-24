import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_project.dart';
import 'package:geosmart_mobile/features/gnss/presentation/missions_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';

import '../../../support/fake_multi_session_store.dart';
import '../../../support/fake_survey_store.dart';

void main() {
  testWidgets('cree une mission depuis la liste avec un chantier', (tester) async {
    final store = FakeMultiSessionStore();
    final survey = SurveyController(
      store: store,
      source: ManualGnssSource(),
      sessionId: '',
    );
    addTearDown(survey.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: MissionsPage(
          survey: survey,
          projectsLoader: () async => const [
            SurveyProject(id: 'chantier-a', title: 'Adakpame', open: true),
          ],
          surveyorId: 'compte-topographe',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Creer une mission'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Leve parcelle A');
    await tester.tap(find.text('Creer la mission'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(store.stored, hasLength(1));
    expect(survey.session?.title, 'Leve parcelle A');
    expect(tester.takeException(), isNull);
  });
}
