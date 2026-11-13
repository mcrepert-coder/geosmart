import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/theme/geosmart_theme.dart';
import 'package:geosmart_mobile/features/gnss/data/survey_projects_api.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_project.dart';
import 'package:geosmart_mobile/features/gnss/presentation/new_mission_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/missions_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../../../support/fake_multi_session_store.dart';

const adakpame = SurveyProject(id: 'chantier-a', title: 'Adakpame', open: true);
const agoe = SurveyProject(id: 'chantier-b', title: 'Agoe', open: true);
const clos = SurveyProject(id: 'chantier-c', title: 'Ancien', open: false);

MissionsController controller(
  FakeMultiSessionStore store,
  SurveyProjectsLoader loader,
) => MissionsController(
  store: store,
  defaultProjectId: 'config-project',
  defaultSurveyorId: 'config-surveyor',
  projectsLoader: loader,
  surveyorIdProvider: () => 'compte-topographe',
);

Future<void> openForm(WidgetTester tester, MissionsController missions) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: GeoSmartTheme.light,
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<dynamic>(
                  builder: (_) => NewMissionPage(missions: missions),
                ),
              ),
              child: const Text('Ouvrir'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Ouvrir'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  group('MissionsController avec chantiers (CA-7)', () {
    test('ne garde que les chantiers ouverts', () async {
      final missions = controller(
        FakeMultiSessionStore(),
        () async => [adakpame, clos],
      );
      addTearDown(missions.dispose);

      await missions.loadProjects();

      expect(missions.projects.map((p) => p.id), ['chantier-a']);
      expect(missions.projectsError, isNull);
    });

    test('cree la mission sur le chantier choisi, au nom du compte', () async {
      final store = FakeMultiSessionStore();
      final missions = controller(store, () async => [adakpame, agoe]);
      addTearDown(missions.dispose);
      await missions.loadProjects();

      final session = await missions.createMission(
        title: 'Leve B',
        projectId: 'chantier-b',
      );

      expect(session?.projectId, 'chantier-b');
      expect(session?.surveyorId, 'compte-topographe');
    });

    test('refuse un chantier absent ou non choisi', () async {
      final store = FakeMultiSessionStore();
      final missions = controller(store, () async => [adakpame]);
      addTearDown(missions.dispose);
      await missions.loadProjects();

      expect(await missions.createMission(title: 'Leve'), isNull);
      expect(
        await missions.createMission(title: 'Leve', projectId: 'chantier-c'),
        isNull,
      );
      expect(missions.error, 'Choisissez un chantier qui vous est assigne.');
      expect(store.createCalls, 0);
    });

    test('garde le message d erreur du chargement', () async {
      final missions = controller(
        FakeMultiSessionStore(),
        () async =>
            throw const SurveyProjectsException('Pas de connexion au serveur.'),
      );
      addTearDown(missions.dispose);

      await missions.loadProjects();

      expect(missions.projectsError, 'Pas de connexion au serveur.');
      expect(missions.projectsLoading, isFalse);
    });
  });

  group('NewMissionPage avec chantiers', () {
    testWidgets('propose les chantiers et cree la mission sur le choisi', (
      tester,
    ) async {
      final store = FakeMultiSessionStore();
      final missions = controller(store, () async => [adakpame, agoe]);
      addTearDown(missions.dispose);
      await openForm(tester, missions);

      expect(find.text('Chantier'), findsOneWidget);
      expect(find.text('Adakpame'), findsOneWidget);
      expect(find.text('Agoe'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'Leve parcelle B');
      await tester.tap(find.text('Creer la mission'));
      await tester.pump();
      expect(
        find.text('Choisissez le chantier de la mission.'),
        findsOneWidget,
      );
      expect(store.createCalls, 0);

      await tester.tap(find.text('Agoe'));
      await tester.pump();
      await tester.tap(find.text('Creer la mission'));
      await tester.pumpAndSettle();

      expect(store.createCalls, 1);
      expect(missions.missions.single.projectId, 'chantier-b');
    });

    testWidgets('choisit d office le seul chantier', (tester) async {
      final store = FakeMultiSessionStore();
      final missions = controller(store, () async => [adakpame]);
      addTearDown(missions.dispose);
      await openForm(tester, missions);

      await tester.enterText(find.byType(TextField), 'Leve parcelle A');
      await tester.tap(find.text('Creer la mission'));
      await tester.pumpAndSettle();

      expect(missions.missions.single.projectId, 'chantier-a');
    });

    testWidgets('explique quand aucun chantier n est assigne', (tester) async {
      final missions = controller(FakeMultiSessionStore(), () async => []);
      addTearDown(missions.dispose);
      await openForm(tester, missions);

      expect(
        find.textContaining('Aucun chantier ouvert ne vous est assigne'),
        findsOneWidget,
      );
    });
  });

  group('SurveyProjectsApi', () {
    test('lit GET /projects avec le jeton', () async {
      late http.Request seen;
      final api = SurveyProjectsApi(
        MockClient((request) async {
          seen = request;
          return http.Response(
            jsonEncode([
              {'id': 'p1', 'title': 'Adakpame', 'status': 'OUVERT'},
              {'id': 'p2', 'title': 'Ancien', 'status': 'CLOS'},
              {'pas': 'un chantier'},
            ]),
            200,
          );
        }),
        baseUrl: 'https://api.test/',
        token: () async => 'jeton',
      );

      final projects = await api.list();

      expect(seen.url.toString(), 'https://api.test/projects');
      expect(seen.headers['Authorization'], 'Bearer jeton');
      expect(projects.map((p) => p.id), ['p1', 'p2']);
      expect(projects.map((p) => p.open), [true, false]);
    });

    test('remonte le message du serveur', () async {
      final api = SurveyProjectsApi(
        MockClient(
          (_) async => http.Response(
            jsonEncode({
              'code': 'FORBIDDEN',
              'message': 'Action non autorisee pour votre role.',
            }),
            403,
          ),
        ),
        baseUrl: 'https://api.test',
        token: () async => null,
      );

      expect(
        api.list,
        throwsA(
          isA<SurveyProjectsException>().having(
            (e) => e.message,
            'message',
            'Action non autorisee pour votre role.',
          ),
        ),
      );
    });
  });
}
