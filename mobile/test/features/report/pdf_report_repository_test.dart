import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/report/data/pdf_report_repository.dart';

/// Mots affiches dans le PDF, dans l'ordre, recolles par des espaces : le
/// PDF ecrit le texte mot par mot, sous la forme [(mot)]TJ.
String shownText(List<int> bytes) => RegExp(
  r'\[\(((?:\\.|[^\\)])*)\)\]TJ',
).allMatches(latin1.decode(bytes)).map((m) => m.group(1)).join(' ');

SurveyPoint borne(int n, double lat, double lon) => SurveyPoint(
  id: 'p$n',
  clientId: 'c$n',
  projectId: 'chantier-1',
  surveyorId: 'topo-1',
  pointNumber: n,
  pointName: 'B$n',
  latitude: lat,
  longitude: lon,
  altitude: 24.3,
  accuracy: 0.012,
  fixQuality: GnssFixQuality.fixed,
  satellitesCount: 18,
  pdop: 1.2,
  recordedAt: DateTime.utc(2026, 11, 12, 8, n),
);

SurveySession mission(List<SurveyPoint> points) => SurveySession(
  id: 's1',
  clientId: 'mission-1',
  projectId: 'chantier-1',
  surveyorId: 'topo-1',
  title: 'Leve parcelle Adakpame',
  createdAt: DateTime.utc(2026, 11, 12, 8),
  completedAt: DateTime.utc(2026, 11, 12, 9, 30),
  // Ordre melange : le plan trie les bornes par numero.
  points: points,
);

/// Un carre d'environ 22 m de cote a Lome.
final carre = [
  borne(3, 6.1374, 1.2127),
  borne(1, 6.1372, 1.2125),
  borne(4, 6.1374, 1.2125),
  borne(2, 6.1372, 1.2127),
];

void main() {
  test(
    'produit un PDF avec le plan, les bornes, les cotes et la surface',
    () async {
      final bytes = await const PdfReportRepository(
        compress: false,
      ).createSurveyPlan(mission(carre));
      expect(latin1.decode(bytes).startsWith('%PDF'), isTrue);
      final text = shownText(bytes);
      for (final expected in [
        'Plan du leve',
        'Leve parcelle Adakpame',
        'Perimetre',
        'Surface',
        'B1 - B2',
        'B4 - B1',
        'UTM zone 31 Nord',
        'Ne vaut pas titre foncier',
      ]) {
        expect(text, contains(expected), reason: expected);
      }
      // Pas de QR code dans les documents (cahier des charges).
      expect(text.toLowerCase(), isNot(contains('qr')));
    },
  );

  test('ordonne les cotes selon le numero des bornes', () async {
    final text = shownText(
      await const PdfReportRepository(
        compress: false,
      ).createSurveyPlan(mission(carre)),
    );
    final order = [
      'B1 - B2',
      'B2 - B3',
      'B3 - B4',
      'B4 - B1',
    ].map(text.indexOf).toList();
    expect(order.every((i) => i >= 0), isTrue);
    expect([...order]..sort(), order);
  });

  test('refuse une mission de moins de trois bornes', () async {
    expect(
      () => const PdfReportRepository().createSurveyPlan(
        mission(carre.take(2).toList()),
      ),
      throwsArgumentError,
    );
  });

  test('choisit une longueur ronde pour la barre d echelle', () {
    expect(niceScaleLength(7.3), 5);
    expect(niceScaleLength(23), 20);
    expect(niceScaleLength(140), 100);
    expect(niceScaleLength(0.8), closeTo(0.5, 1e-9));
    expect(niceScaleLength(0), 1);
  });
}
