import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../gnss/domain/entities/gnss_fix_quality.dart';
import '../gnss/domain/entities/survey_point.dart';
import 'data/land_api.dart';
import 'data/parcel_status_api.dart';
import 'data/parcel_status_cache.dart';
import 'domain/entities/parcel_draft.dart';
import 'domain/usecases/check_parcel.dart';
import 'presentation/attestation_gate_page.dart';
import 'presentation/create_parcel_page.dart';
import 'presentation/edit_parcel_page.dart';
import 'presentation/parcel_sheet.dart';
import 'presentation/survey_requests_page.dart';
import 'presentation/verify_parcel_page.dart';

/// Apercu des ecrans du module foncier avec des donnees d'exemple, en
/// attendant leur branchement dans la navigation de l'application.
/// Lancement : flutter run -t lib/features/land/preview_main.dart
void main() => runApp(const LandPreviewApp());

http.Response _json(Object body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

const _notFound = {'code': 'NOT_FOUND', 'message': 'Introuvable.'};

// Faux serveur : routes du contrat land.yaml, donnees d'exemple fictives.
// Il garde l'etat pendant la session (version, demandes de leve).
final _demoClient = MockClient((request) async {
  await Future<void>.delayed(const Duration(milliseconds: 400));
  final s = request.url.pathSegments;
  if (s.isEmpty) return _json(_notFound, 404);

  if (s[0] == 'parcels' && s.length >= 2) {
    final id = s[1];
    if (s.length == 3 && s[2] == 'status') {
      final body = _demoParcels[id];
      return body == null ? _json(_notFound, 404) : _json(body);
    }
    if (id != _sheetParcel['id']) return _json(_notFound, 404);
    if (s.length == 2 && request.method == 'GET') return _json(_sheetParcel);
    if (s.length == 2 && request.method == 'PATCH') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      if (body['expectedVersion'] != _sheetParcel['version']) {
        return _json({
          'code': 'VERSION_CONFLICT',
          'message': 'La parcelle a ete modifiee entre-temps.',
          'details': {'currentVersion': _sheetParcel['version']},
        }, 409);
      }
      _versions.insert(0, {
        'version': (_sheetParcel['version'] as int) + 1,
        'geometryHash': 'demo-${_versions.length + 1}',
        'areaM2': 812.5,
        'reason': body['reason'],
        'authorId': _geometreId,
        'createdAt': DateTime.now().toUtc().toIso8601String(),
      });
      _sheetParcel['version'] = (_sheetParcel['version'] as int) + 1;
      _sheetParcel['areaM2'] = 812.5;
      _sheetParcel['updatedAt'] = DateTime.now().toUtc().toIso8601String();
      return _json(_sheetParcel);
    }
    if (s.length == 3 && s[2] == 'versions') return _json(_versions);
    if (s.length == 3 && s[2] == 'attestations') {
      return _json({
        'number': 'AT-2026-000031',
        'parcelId': id,
        'parcelVersion': _sheetParcel['version'],
        'geometryHash': _sheetParcel['geometryHash'],
        'documentHash':
            '9c41e0b2f6a3d5c7e8b1a2f3d4c5b6a7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3',
        'issuedAt': DateTime.now().toUtc().toIso8601String(),
        'mention': 'Ne vaut pas titre foncier',
        'pdfUrl': '/attestations/AT-2026-000031/pdf',
      }, 201);
    }
  }

  if (s[0] == 'survey-requests') {
    if (s.length == 1 && request.method == 'GET') return _json(_requests);
    if (s.length == 1 && request.method == 'POST') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      final created = _request(
        'r-${_requests.length + 1}',
        'OUVERTE',
        body['locality'] as String,
        body['description'] as String,
      );
      _requests.insert(0, created);
      return _json(created, 201);
    }
    final i = _requests.indexWhere((r) => r['id'] == s[1]);
    if (i < 0) return _json(_notFound, 404);
    final next = switch (s[2]) {
      'take' => {'state': 'PRISE', 'surveyorId': _geometreId},
      'complete' => {'state': 'TERMINEE'},
      _ => {'state': 'ANNULEE'},
    };
    _requests[i] = {..._requests[i], ...next};
    return _json(_requests[i]);
  }
  return _json(_notFound, 404);
});

const _geometreId = 'geometre-demo';

// Fiche ouverte depuis l'onglet "Fiche" (BottomSheet, T8, modification).
final Map<String, Object?> _sheetParcel = {
  'id': 'TG-AG3-00457',
  'version': 2,
  'areaM2': 452.18,
  'perimeterM': 101.81,
  'locality': 'Agoe-Sogbossito, lot 12',
  'legalStatus': 'COUTUMIER_NON_TITRE',
  'certified': true,
  'geometryHash':
      'a3f9c2e15d87b8aa0c4e9f1d2b3a4c5d6e7f8091a2b3c4d5e6f708191c04d8ce',
  'surveyor': {'id': _geometreId},
  'boundaries': [
    for (var n = 1; n <= 5; n++)
      {
        'pointNumber': n,
        'name': 'B$n',
        'fixQuality': 'FIXED',
        'pdop': 1.2 + n / 10,
        'satellitesCount': 18,
      },
  ],
  'updatedAt': '2026-10-24T09:42:00Z',
};

final List<Map<String, Object?>> _versions = [
  {
    'version': 2,
    'geometryHash': 'h2',
    'areaM2': 452.18,
    'reason': 'Reprise de la borne B3 apres bornage',
    'authorId': _geometreId,
    'createdAt': '2026-10-24T09:42:00Z',
  },
  {
    'version': 1,
    'geometryHash': 'h1',
    'areaM2': 448.9,
    'reason': null,
    'authorId': _geometreId,
    'createdAt': '2026-10-14T10:05:00Z',
  },
];

Map<String, Object?> _request(
  String id,
  String state,
  String locality,
  String description, {
  String? surveyorId,
}) => {
  'id': id,
  'state': state,
  'agentId': 'agent-demo',
  'surveyorId': surveyorId,
  'locality': locality,
  'description': description,
  'createdAt': '2026-10-27T08:00:00Z',
};

final List<Map<String, Object?>> _requests = [
  _request(
    'r-1',
    'OUVERTE',
    'Baguida, lot 7',
    'Terrain de 600 m2 a borner avant vente.',
  ),
  _request(
    'r-2',
    'PRISE',
    'Adidogome',
    'Maison F5, reprise des limites.',
    surveyorId: _geometreId,
  ),
];

const _demoParcels = {
  'TG-AG3-00377': {
    'id': 'TG-AG3-00377',
    'legalStatus': 'EN_LITIGE',
    'statusSource': 'Tribunal de Lome, ordonnance 2026/88',
    'statusDate': '2026-09-12',
    'titleNumber': null,
    'disputeNote':
        'Un voisin conteste la limite est. Ne versez aucun acompte avant sa résolution auprès des autorités compétentes.',
    'certified': false,
    'areaM2': 612.4,
    'version': 3,
    'versionsCount': 3,
    'lastSurveyAt': '2026-10-14T10:05:00Z',
    'bornage': {
      'neighboursTotal': 3,
      'neighboursPresent': 2,
      'heldAt': '2026-10-14T09:00:00Z',
    },
    'warnings': ['Ne vaut pas titre foncier.'],
  },
  'TG-AG3-00457': {
    'id': 'TG-AG3-00457',
    'legalStatus': 'COUTUMIER_NON_TITRE',
    'statusSource': 'Declaration du chef de canton, PV 2026/41',
    'statusDate': '2026-10-22',
    'titleNumber': null,
    'disputeNote': null,
    'certified': true,
    'areaM2': 452.18,
    'version': 2,
    'versionsCount': 2,
    'lastSurveyAt': '2026-10-24T09:42:00Z',
    'bornage': {
      'neighboursTotal': 3,
      'neighboursPresent': 3,
      'heldAt': '2026-10-24T09:30:00Z',
    },
    'warnings': ['Ne vaut pas titre foncier.'],
  },
};

SurveyPoint _point(
  int n,
  double lat,
  double lon, [
  GnssFixQuality fix = GnssFixQuality.fixed,
]) => SurveyPoint(
  id: 'pt-$n',
  clientId: 'c-$n',
  projectId: 'CH-2026-031',
  surveyorId: 'geometre-demo',
  pointNumber: n,
  pointName: 'B$n',
  latitude: lat,
  longitude: lon,
  fixQuality: fix,
  satellitesCount: 18,
  pdop: 1.4,
  recordedAt: DateTime.utc(2026, 10, 24, 9, 30 + n),
);

// Pentagone d'environ 800 m2 a Agoe, B5 mesuree en Float.
final _demoPoints = [
  _point(1, 6.180600, 1.200000),
  _point(2, 6.180640, 1.200300),
  _point(3, 6.180480, 1.200360),
  _point(4, 6.180330, 1.200220),
  _point(5, 6.180380, 1.199990, GnssFixQuality.float),
];

class LandPreviewApp extends StatelessWidget {
  const LandPreviewApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GeoSmart, module foncier',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF115471)),
      darkTheme: ThemeData(
        colorSchemeSeed: const Color(0xFF115471),
        brightness: Brightness.dark,
      ),
      home: const _PreviewHome(),
    );
  }
}

class _PreviewHome extends StatefulWidget {
  const _PreviewHome();

  @override
  State<_PreviewHome> createState() => _PreviewHomeState();
}

class _PreviewHomeState extends State<_PreviewHome> {
  int _tab = 0;
  final _cache = MemoryParcelStatusCache();
  final _api = LandApi(
    _demoClient,
    baseUrl: 'http://demo',
    token: () async => 'jeton-demo',
  );

  // Role simule pour voir les actions de chaque profil (EF-402).
  String _role = 'GEOMETRE';

  LandViewer get _viewer => LandViewer(
    id: switch (_role) {
      'GEOMETRE' => _geometreId,
      'AGENT' => 'agent-demo',
      _ => 'admin-demo',
    },
    role: _role,
  );

  Future<void> _openSheet() => showParcelSheet(
    context,
    parcelId: 'TG-AG3-00457',
    api: _api,
    viewer: _viewer,
    onEdit: (parcel) {
      Navigator.of(context).pop();
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => EditParcelPage(
            parcel: parcel,
            api: _api,
            draft: ParcelDraft(
              surveySessionId: 'CH-2026-031',
              points: _demoPoints.take(4).toList(),
            ),
          ),
        ),
      );
    },
    onAttestation: (parcel) {
      Navigator.of(context).pop();
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => AttestationGatePage(
            parcelId: parcel.id,
            api: _api,
            registeredSurveyor: true,
          ),
        ),
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    final roleSelector = SegmentedButton<String>(
      showSelectedIcon: false,
      segments: const [
        ButtonSegment(value: 'GEOMETRE', label: Text('Géomètre')),
        ButtonSegment(value: 'AGENT', label: Text('Agent')),
        ButtonSegment(value: 'ADMIN', label: Text('Admin')),
      ],
      selected: {_role},
      onSelectionChanged: (s) => setState(() => _role = s.first),
    );
    final pages = [
      CreateParcelPage(
        initialDraft: ParcelDraft(
          surveySessionId: 'CH-2026-031',
          points: _demoPoints,
          commune: 'AG3',
        ),
        onQueue: (_) async =>
            Future<void>.delayed(const Duration(milliseconds: 600)),
      ),
      VerifyParcelPage(
        checkParcel: CheckParcel(
          ParcelStatusApi(_demoClient, baseUrl: 'http://demo'),
          _cache,
        ),
        cache: _cache,
      ),
      Scaffold(
        appBar: AppBar(title: const Text('Fiche de parcelle')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Profil simulé'),
            const SizedBox(height: 8),
            roleSelector,
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _openSheet,
              icon: const Icon(Icons.map_outlined),
              label: const Text('Ouvrir TG-AG3-00457 sur la carte'),
            ),
            const SizedBox(height: 12),
            const Text(
              'Géomètre : Modifier et Attestation de levé. '
              'Admin : historique seulement. Agent : aucune action.',
            ),
          ],
        ),
      ),
      Column(
        children: [
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: roleSelector,
            ),
          ),
          Expanded(
            child: SurveyRequestsPage(
              key: ValueKey(_role),
              api: _api,
              viewer: _viewer,
            ),
          ),
        ],
      ),
    ];
    return Scaffold(
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.pentagon_outlined),
            label: 'Créer',
          ),
          NavigationDestination(
            icon: Icon(Icons.verified_outlined),
            label: 'Vérifier',
          ),
          NavigationDestination(
            icon: Icon(Icons.description_outlined),
            label: 'Fiche',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            label: 'Demandes',
          ),
        ],
      ),
    );
  }
}
