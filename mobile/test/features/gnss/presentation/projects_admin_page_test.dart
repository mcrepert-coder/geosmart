import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/data/survey_projects_api.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/managed_project.dart';
import 'package:geosmart_mobile/features/gnss/presentation/projects_admin_page.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/projects_admin_controller.dart';

/// Serveur simule : garde les chantiers en memoire.
class FakeGateway implements ProjectsAdminGateway {
  final topos = const [
    ProjectTopographer(id: 'topo-1', fullName: 'Kossi Topo'),
    ProjectTopographer(id: 'topo-2', fullName: 'Ama Topo'),
  ];
  final List<ManagedProject> projects = [];
  final List<String> calls = [];
  String? failWith;

  @override
  Future<List<ManagedProject>> listManaged() async => List.of(projects);

  @override
  Future<List<ProjectTopographer>> listTopographers() async => topos;

  void _check() {
    if (failWith != null) throw SurveyProjectsException(failWith!);
  }

  ManagedProject _replace(
    String id,
    ManagedProject Function(ManagedProject) f,
  ) {
    final i = projects.indexWhere((p) => p.id == id);
    return projects[i] = f(projects[i]);
  }

  @override
  Future<void> create(String title) async {
    _check();
    calls.add('create $title');
    projects.add(
      ManagedProject(
        id: 'p${projects.length + 1}',
        title: title,
        open: true,
        topographers: const [],
        missionsCount: 0,
      ),
    );
  }

  @override
  Future<void> assign(String projectId, String accountId) async {
    _check();
    calls.add('assign $projectId $accountId');
    _replace(
      projectId,
      (p) => ManagedProject(
        id: p.id,
        title: p.title,
        open: p.open,
        topographers: [
          ...p.topographers,
          topos.firstWhere((t) => t.id == accountId),
        ],
        missionsCount: p.missionsCount,
      ),
    );
  }

  @override
  Future<void> unassign(String projectId, String accountId) async {
    _check();
    calls.add('unassign $projectId $accountId');
    _replace(
      projectId,
      (p) => ManagedProject(
        id: p.id,
        title: p.title,
        open: p.open,
        topographers: p.topographers.where((t) => t.id != accountId).toList(),
        missionsCount: p.missionsCount,
      ),
    );
  }

  @override
  Future<void> close(String projectId) async {
    _check();
    calls.add('close $projectId');
    _replace(
      projectId,
      (p) => ManagedProject(
        id: p.id,
        title: p.title,
        open: false,
        topographers: p.topographers,
        missionsCount: p.missionsCount,
      ),
    );
  }
}

Future<ProjectsAdminController> open(
  WidgetTester tester,
  FakeGateway gateway,
) async {
  final controller = ProjectsAdminController(gateway: gateway);
  addTearDown(controller.dispose);
  await tester.pumpWidget(
    MaterialApp(home: ProjectsAdminPage(controller: controller)),
  );
  await tester.pumpAndSettle();
  return controller;
}

void main() {
  testWidgets('cree un chantier, assigne puis retire un topographe', (
    tester,
  ) async {
    final gateway = FakeGateway();
    await open(tester, gateway);
    expect(find.textContaining('Aucun chantier'), findsOneWidget);

    await tester.tap(find.text('Nouveau chantier'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Leve Adakpame');
    await tester.tap(find.text('Créer'));
    await tester.pumpAndSettle();
    expect(find.text('Leve Adakpame'), findsOneWidget);
    expect(find.text('Aucun topographe assigné.'), findsOneWidget);

    await tester.tap(find.text('Assigner'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('assigner-topo-2')));
    await tester.pumpAndSettle();
    expect(find.text('Ama Topo'), findsOneWidget);

    await tester.tap(find.byTooltip('Retirer'));
    await tester.pumpAndSettle();
    expect(find.text('Ama Topo'), findsNothing);
    expect(gateway.calls, [
      'create Leve Adakpame',
      'assign p1 topo-2',
      'unassign p1 topo-2',
    ]);
  });

  testWidgets('clore demande confirmation et cache les actions', (
    tester,
  ) async {
    final gateway = FakeGateway();
    await gateway.create('Agoe');
    gateway.calls.clear();
    await open(tester, gateway);

    await tester.tap(find.text('Clore'));
    await tester.pumpAndSettle();
    expect(find.text('Clore le chantier ?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Clore'));
    await tester.pumpAndSettle();

    expect(gateway.calls, ['close p1']);
    expect(find.text('Clos'), findsOneWidget);
    expect(find.text('Assigner'), findsNothing);
  });

  test('refuse un nom vide et garde le message du serveur', () async {
    final gateway = FakeGateway();
    final controller = ProjectsAdminController(gateway: gateway);
    addTearDown(controller.dispose);

    expect(await controller.create('   '), isFalse);
    expect(controller.error, 'Le nom du chantier est obligatoire.');

    gateway.failWith = 'Action non autorisee pour votre role.';
    expect(await controller.create('Kegue'), isFalse);
    expect(controller.error, 'Action non autorisee pour votre role.');
  });

  test('ne propose que les topographes pas encore assignes', () async {
    final gateway = FakeGateway();
    await gateway.create('Be');
    await gateway.assign('p1', 'topo-1');
    final controller = ProjectsAdminController(gateway: gateway);
    addTearDown(controller.dispose);
    await controller.load();

    expect(
      controller.assignableTo(controller.projects.single).map((t) => t.id),
      ['topo-2'],
    );
  });
}
