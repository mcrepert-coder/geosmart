import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/account/domain/entities/account_user.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/presentation/missions_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/missions_controller.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/survey_controller.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/land/data/parcel_status_api.dart';
import 'package:geosmart_mobile/features/land/data/parcel_status_cache.dart';
import 'package:geosmart_mobile/features/land/domain/usecases/check_parcel.dart';
import 'package:geosmart_mobile/features/land/land_entry_points.dart';
import 'package:geosmart_mobile/features/land/presentation/create_parcel_page.dart';
import 'package:geosmart_mobile/features/map/domain/map_parcel.dart';
import 'package:geosmart_mobile/features/map/presentation/parcel_map_page.dart';
import 'package:geosmart_mobile/features/map/presentation/viewmodels/parcel_map_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../../support/fake_multi_session_store.dart';
import '../../support/fake_survey_store.dart';

AccountUser user(AccountRole role) => AccountUser(
  id: 'compte-1',
  role: role,
  registeredSurveyor: true,
  accountActive: true,
);

LandServices services() {
  final client = MockClient(
    (_) async => http.Response(jsonEncode({'message': 'non simule'}), 500),
  );
  final cache = MemoryParcelStatusCache();
  return LandServices(
    api: LandApi(client, baseUrl: 'https://api.test', token: () async => 't'),
    checkParcel: CheckParcel(
      ParcelStatusApi(client, baseUrl: 'https://api.test'),
      cache,
    ),
    statusCache: cache,
  );
}

SurveyPoint point(int number) => SurveyPoint.fromPosition(
  id: 'point-$number',
  clientId: 'client-point-$number',
  projectId: 'project-1',
  surveyorId: 'surveyor-1',
  pointNumber: number,
  pointName: 'B$number',
  position: GnssPosition(
    latitude: 6.13192 + number / 10000,
    longitude: 1.22281 + (number.isEven ? 1 : 0) / 10000,
    altitude: 12.5,
    accuracy: 0.012,
    fixQuality: GnssFixQuality.fixed,
    satellitesCount: 18,
    pdop: 1.4,
    hdop: 0.8,
    vdop: 1.1,
    instrument: 'UM982',
    recordedAt: DateTime.utc(2026, 10, 30, 9, 30),
  ),
);

SurveySession mission(SurveySessionStatus status, List<SurveyPoint> points) =>
    SurveySession(
      id: 'mission-a',
      clientId: '7d1c0c7e-3a51-4f0b-9a35-0c7b8f0a2d11',
      projectId: 'project-1',
      surveyorId: 'surveyor-1',
      title: 'Leve Adakpame',
      status: status,
      points: points,
      createdAt: DateTime.utc(2026, 10, 30, 9),
    );

void main() {
  group('LandEntryPoints', () {
    final entry = LandEntryPoints(services());

    test('seul le geometre cree la parcelle, depuis une mission terminee', () {
      final done = mission(SurveySessionStatus.completed, const []);
      final synced = mission(SurveySessionStatus.synced, const []);
      final draft = mission(SurveySessionStatus.inProgress, const []);

      expect(entry.canCreateParcel(user(AccountRole.geometre), done), isTrue);
      expect(entry.canCreateParcel(user(AccountRole.geometre), synced), isTrue);
      expect(entry.canCreateParcel(user(AccountRole.geometre), draft), isFalse);
      expect(
        entry.canCreateParcel(user(AccountRole.topographe), done),
        isFalse,
      );
    });

    test('demandes de leve pour agent, geometre et administrateur', () {
      expect(entry.showsSurveyRequests(user(AccountRole.agent)), isTrue);
      expect(entry.showsSurveyRequests(user(AccountRole.geometre)), isTrue);
      expect(entry.showsSurveyRequests(user(AccountRole.admin)), isTrue);
      expect(entry.showsSurveyRequests(user(AccountRole.client)), isFalse);
      expect(entry.showsSurveyRequests(user(AccountRole.topographe)), isFalse);
    });

    testWidgets(
      'la parcelle part des bornes triees et du clientId de la mission',
      (tester) async {
        final full = mission(SurveySessionStatus.synced, [
          point(3),
          point(1),
          point(2),
        ]);
        await tester.pumpWidget(
          MaterialApp(
            theme: GeoSmartTheme.light,
            home: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => entry.openCreateParcel(context, full),
                child: const Text('Creer'),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Creer'));
        await tester.pumpAndSettle();

        final page = tester.widget<CreateParcelPage>(
          find.byType(CreateParcelPage),
        );
        expect(page.initialDraft.surveySessionId, full.clientId);
        expect(page.initialDraft.points.map((p) => p.pointNumber), [1, 2, 3]);
      },
    );
  });

  testWidgets('la liste des missions propose Creer la parcelle au geometre', (
    tester,
  ) async {
    final store = FakeMultiSessionStore(
      sessions: [
        mission(SurveySessionStatus.completed, [point(1), point(2), point(3)]),
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
    SurveySession? received;

    await tester.pumpWidget(
      MaterialApp(
        theme: GeoSmartTheme.light,
        home: MissionsPage(
          survey: survey,
          missions: missions,
          canCreateParcel: (m) => m.status == SurveySessionStatus.completed,
          onCreateParcel: (m) async => received = m,
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byKey(const Key('create-parcel-mission-a')));
    await tester.pump();

    expect(received?.points, hasLength(3));
  });

  testWidgets('la carte ouvre la fiche et la verification', (tester) async {
    final parcel = MapParcel.fromFeature({
      'type': 'Feature',
      'id': 'TG-AG3-00457',
      'geometry': {
        'type': 'Polygon',
        'coordinates': [
          [
            [1.2120, 6.1370],
            [1.2126, 6.1370],
            [1.2126, 6.1376],
            [1.2120, 6.1370],
          ],
        ],
      },
      'properties': {'legalStatus': 'TITRE', 'certified': true},
    })!;
    final controller = ParcelMapController(loader: (_) async => [parcel]);
    addTearDown(controller.dispose);
    String? opened;
    var verified = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: ParcelMapPage(
          controller: controller,
          tileUrl: null,
          onOpenParcel: (p) => opened = p.id,
          onVerify: () => verified++,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));
    controller.select(controller.parcels.single);
    await tester.pump();

    await tester.tap(find.text('Voir la fiche'));
    await tester.tap(find.byTooltip('Verifier une parcelle'));
    expect(opened, 'TG-AG3-00457');
    expect(verified, 1);
  });
}
