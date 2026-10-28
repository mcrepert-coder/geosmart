import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../gnss/domain/entities/gnss_fix_quality.dart';
import '../gnss/domain/entities/survey_point.dart';
import 'data/parcel_status_api.dart';
import 'data/parcel_status_cache.dart';
import 'domain/entities/parcel_draft.dart';
import 'domain/usecases/check_parcel.dart';
import 'presentation/create_parcel_page.dart';
import 'presentation/verify_parcel_page.dart';

/// Apercu des ecrans du module foncier avec des donnees d'exemple, en
/// attendant leur branchement dans la navigation de l'application.
/// Lancement : flutter run -t lib/features/land/preview_main.dart
void main() => runApp(const LandPreviewApp());

// Faux serveur : memes reponses que les donnees d'exemple du site web.
final _demoClient = MockClient((request) async {
  await Future<void>.delayed(const Duration(milliseconds: 400));
  final id = request.url.pathSegments.length > 1
      ? request.url.pathSegments[1]
      : '';
  final body = _demoParcels[id];
  if (body == null) {
    return http.Response(
      '{"code":"NOT_FOUND","message":"Parcelle introuvable."}',
      404,
    );
  }
  return http.Response(
    jsonEncode(body),
    200,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
});

const _demoParcels = {
  'TG-AGO-00377': {
    'id': 'TG-AGO-00377',
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
  'TG-AGO-00457': {
    'id': 'TG-AGO-00457',
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

  @override
  Widget build(BuildContext context) {
    final pages = [
      CreateParcelPage(
        initialDraft: ParcelDraft(
          surveySessionId: 'CH-2026-031',
          points: _demoPoints,
          commune: 'AGO',
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
    ];
    return Scaffold(
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.pentagon_outlined),
            label: 'Créer la parcelle',
          ),
          NavigationDestination(
            icon: Icon(Icons.verified_outlined),
            label: 'Vérifier',
          ),
        ],
      ),
    );
  }
}
