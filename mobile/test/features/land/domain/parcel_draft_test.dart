import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/land/domain/entities/parcel_draft.dart';

SurveyPoint point(
  int n,
  double lat,
  double lon, [
  GnssFixQuality fix = GnssFixQuality.fixed,
]) {
  return SurveyPoint(
    id: 'pt-$n',
    clientId: 'c-$n',
    projectId: 'chantier-1',
    surveyorId: 'geometre-1',
    pointNumber: n,
    pointName: 'B$n',
    latitude: lat,
    longitude: lon,
    fixQuality: fix,
    satellitesCount: 18,
    pdop: 1.4,
    recordedAt: DateTime.utc(2026, 10, 24, 9, 30 + n),
  );
}

final b1 = point(1, 6.13, 1.21);
final b2 = point(2, 6.13, 1.211);
final b3 = point(3, 6.131, 1.211);
final b4 = point(4, 6.131, 1.21);

ParcelDraft draft(List<SurveyPoint> points) => ParcelDraft(
  surveySessionId: 'chantier-1',
  points: points,
  commune: 'AGO',
  declaredStatus: DeclaredStatus.coutumier,
);

void main() {
  test('un brouillon complet peut partir en file', () {
    final d = draft([b1, b2, b3, b4]);
    expect(d.blockers, isEmpty);
    expect(d.allPointsFixed, isTrue);
  });

  test('liste ce qui bloque l envoi', () {
    final empty = ParcelDraft(surveySessionId: 'chantier-1', points: [b1, b2]);
    expect(empty.blockers, [
      DraftBlocker.tooFewPoints,
      DraftBlocker.noCommune,
      DraftBlocker.noStatus,
    ]);
    final titled = draft([
      b1,
      b2,
      b3,
    ]).copyWith(declaredStatus: DeclaredStatus.titre);
    expect(titled.blockers, [DraftBlocker.noTitleNumber]);
  });

  test('bloque au-dela de 500 bornes, comme le serveur', () {
    // Bornes posees sur un petit cercle : polygone valide, sans croisement.
    List<SurveyPoint> circle(int n) => [
      for (var i = 0; i < n; i++)
        point(
          i + 1,
          6.13 + 0.001 * math.sin(2 * math.pi * i / n),
          1.21 + 0.001 * math.cos(2 * math.pi * i / n),
        ),
    ];
    expect(draft(circle(maxParcelPoints)).blockers, isEmpty);
    final tooMany = draft(circle(maxParcelPoints + 1));
    expect(tooMany.geometryBlockers, [DraftBlocker.tooManyPoints]);
    expect(tooMany.canQueue, isFalse);
  });

  test('signale les cotes croises puis se corrige en reordonnant', () {
    final crossed = draft([b1, b3, b2, b4]);
    expect(crossed.blockers, [DraftBlocker.selfIntersection]);
    expect(
      crossed.crossingMessage(),
      'Les côtés B1-B3 et B2-B4 se croisent. Réordonnez les bornes.',
    );
    final fixed = crossed.reorder(2, 1);
    expect(fixed.points.map((p) => p.pointName), ['B1', 'B2', 'B3', 'B4']);
    expect(fixed.blockers, isEmpty);
  });

  test(
    'une borne en Float n empeche pas l envoi mais pas de certification',
    () {
      final d = draft([
        b1,
        b2,
        point(3, 6.131, 1.211, GnssFixQuality.float),
        b4,
      ]);
      expect(d.canQueue, isTrue);
      expect(d.allPointsFixed, isFalse);
      expect(d.fixedCount, 3);
    },
  );

  test('produit le corps de POST /parcels du contrat', () {
    final payload = draft([
      b1,
      b2,
      b3,
      point(4, 6.131, 1.21, GnssFixQuality.dgps),
    ]).copyWith(locality: ' Agoe ').toCreatePayload();

    expect(payload['surveySessionId'], 'chantier-1');
    expect(payload['commune'], 'AGO');
    expect(payload['locality'], 'Agoe');
    final ring = (payload['geometry'] as Map)['coordinates'][0] as List;
    expect(ring, hasLength(5));
    expect(ring.first, [1.21, 6.13]);
    expect(ring.last, ring.first);
    final boundaries = payload['boundaries'] as List;
    expect(boundaries.first, containsPair('fixQuality', 'FIXED'));
    expect(boundaries.last, containsPair('fixQuality', 'AUTONOME'));
    expect(boundaries.first, containsPair('surveyPointId', 'pt-1'));
  });
}
