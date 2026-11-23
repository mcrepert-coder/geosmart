import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/presentation/missions_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/missions_controller.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';
import 'package:geosmart_mobile/features/report/share_survey_plan.dart';

import '../../support/fake_multi_session_store.dart';
import '../../support/fake_survey_store.dart';

SurveyPoint borne(int n) => SurveyPoint(
  id: 'p$n',
  clientId: 'c$n',
  projectId: 'chantier',
  surveyorId: 'topo',
  pointNumber: n,
  pointName: 'B$n',
  latitude: 6.1372 + (n == 3 ? 0.0002 : 0),
  longitude: 1.2125 + (n == 2 ? 0.0002 : 0),
  altitude: 24,
  accuracy: 0.01,
  fixQuality: GnssFixQuality.fixed,
  satellitesCount: 18,
  pdop: 1.2,
  recordedAt: DateTime.utc(2026, 11, 16, 8, n),
);

SurveySession mission(SurveySessionStatus status, List<SurveyPoint> points) =>
    SurveySession(
      id: 'mission-a',
      clientId: 'c-mission',
      projectId: 'chantier',
      surveyorId: 'topo',
      title: 'Leve Adakpame, lot 12',
      status: status,
      points: points,
      createdAt: DateTime.utc(2026, 11, 16, 8),
    );

void main() {
  test('nomme le fichier d apres la mission', () {
    expect(
      SurveyPlanSharer.fileNameFor(mission(SurveySessionStatus.completed, [])),
      'plan-leve-adakpame-lot-12.pdf',
    );
  });

  test('genere un vrai PDF et le confie au partage', () async {
    List<int>? bytes;
    String? name;
    final sharer = SurveyPlanSharer(
      share: (b, n) async {
        bytes = b;
        name = n;
      },
    );
    await sharer.share(
      mission(SurveySessionStatus.completed, [borne(1), borne(2), borne(3)]),
    );
    expect(String.fromCharCodes(bytes!.take(4)), '%PDF');
    expect(name, 'plan-leve-adakpame-lot-12.pdf');
  });

  testWidgets('le bouton Plan PDF apparait sur une mission terminee', (
    tester,
  ) async {
    final store = FakeMultiSessionStore(
      sessions: [
        mission(SurveySessionStatus.completed, [borne(1), borne(2), borne(3)]),
      ],
    );
    final survey = SurveyController(
      store: store,
      source: ManualGnssSource(),
      sessionId: 'mission-a',
    );
    addTearDown(survey.dispose);
    final missions = MissionsController(store: store);
    addTearDown(missions.dispose);
    var shared = 0;

    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: MissionsPage(
          survey: survey,
          missions: missions,
          planSharer: SurveyPlanSharer(share: (_, _) async => shared++),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byKey(const Key('share-plan-mission-a')));
    await tester.pumpAndSettle();
    expect(shared, 1);
  });
}
