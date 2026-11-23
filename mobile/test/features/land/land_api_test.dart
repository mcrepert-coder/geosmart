import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/land/domain/entities/parcel_draft.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

SurveyPoint point(int n, double lat, double lon) => SurveyPoint(
  id: 'pt-$n',
  clientId: 'c-$n',
  projectId: 'CH-2026-031',
  surveyorId: 'g-1',
  pointNumber: n,
  pointName: 'B$n',
  latitude: lat,
  longitude: lon,
  fixQuality: GnssFixQuality.fixed,
  satellitesCount: 18,
  pdop: 1.4,
  recordedAt: DateTime.utc(2026, 10, 24, 9, 30),
);

final draft = ParcelDraft(
  surveySessionId: 'CH-2026-031',
  points: [point(1, 6.13, 1.21), point(2, 6.13, 1.211), point(3, 6.131, 1.211)],
  commune: 'AG3',
  declaredStatus: DeclaredStatus.coutumier,
);

const parcelJson = {
  'id': 'TG-AG3-00457',
  'version': 1,
  'geometry': {'type': 'Polygon', 'coordinates': []},
  'areaM2': 6121.3,
  'perimeterM': 376.6,
  'locality': null,
  'legalStatus': 'INCONNU',
  'certified': true,
  'geometryHash':
      'a3f9c2e15d87b8aa0c4e9f1d2b3a4c5d6e7f8091a2b3c4d5e6f708191c04d8ce',
  'surveyor': {'id': 'g-1'},
  'boundaries': [
    {
      'pointNumber': 1,
      'name': 'B1',
      'surveyPointId': 'pt-1',
      'fixQuality': 'FIXED',
      'pdop': 1.4,
    },
  ],
  'createdAt': '2026-10-24T09:42:00.000Z',
  'updatedAt': '2026-10-24T09:42:00.000Z',
};

http.Response json(Object body, int status) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  late List<http.Request> requests;
  LandApi api(
    Future<http.Response> Function(http.Request) handler, {
    String? token = 'jeton',
  }) {
    requests = [];
    return LandApi(
      MockClient((r) {
        requests.add(r);
        return handler(r);
      }),
      baseUrl: 'http://api.test/',
      token: () async => token,
    );
  }

  test('cree une parcelle avec jeton et cle d idempotence', () async {
    final parcel = await api(
      (_) async => json(parcelJson, 201),
    ).createParcel(draft, idempotencyKey: 'cle-1');

    final r = requests.single;
    expect(r.method, 'POST');
    expect(r.url.toString(), 'http://api.test/parcels');
    expect(r.headers['Authorization'], 'Bearer jeton');
    expect(r.headers['Idempotency-Key'], 'cle-1');
    expect(jsonDecode(r.body)['commune'], 'AG3');
    expect(parcel.id, 'TG-AG3-00457');
    expect(parcel.surveyorId, 'g-1');
    expect(parcel.boundaries.single.isFixed, isTrue);
  });

  test('remonte le 409 de chevauchement avec ses details', () async {
    final call = api(
      (_) async => json({
        'code': 'PARCEL_OVERLAP',
        'message': 'Cette parcelle recouvre une parcelle deja enregistree.',
        'details': {
          'conflicts': [
            {'parcelId': 'TG-AG3-00412', 'overlapAreaM2': 18.4},
          ],
          'auditSeq': 4812,
        },
      }, 409),
    ).createParcel(draft, idempotencyKey: 'cle-2');

    await expectLater(
      call,
      throwsA(
        isA<LandApiException>()
            .having((e) => e.status, 'status', 409)
            .having((e) => e.code, 'code', 'PARCEL_OVERLAP')
            .having(
              (e) => (e.details!['conflicts'] as List).length,
              'conflits',
              1,
            ),
      ),
    );
  });

  test('distingue l absence de reseau', () async {
    await expectLater(
      api(
        (_) async => throw const SocketException('hors ligne'),
      ).getParcel('TG-AG3-00457'),
      throwsA(
        isA<LandApiException>().having((e) => e.isNetwork, 'reseau', isTrue),
      ),
    );
  });

  test('tolere une erreur sans corps JSON', () async {
    await expectLater(
      api(
        (_) async => http.Response('Bad Gateway', 502),
      ).getParcel('TG-AG3-00457'),
      throwsA(
        isA<LandApiException>().having((e) => e.code, 'code', 'HTTP_502'),
      ),
    );
  });

  test('emet l attestation et lit les versions', () async {
    final client = api((r) async {
      if (r.url.path.endsWith('/attestations')) {
        return json({
          'number': 'AT-2026-000031',
          'parcelId': 'TG-AG3-00457',
          'parcelVersion': 2,
          'geometryHash': 'x',
          'documentHash': 'y',
          'issuedAt': '2026-10-24T11:02:00.000Z',
          'mention': 'Ne vaut pas titre foncier',
          'pdfUrl': '/attestations/AT-2026-000031/pdf',
        }, 201);
      }
      return json([
        {
          'version': 2,
          'geometryHash': 'h2',
          'areaM2': 452.18,
          'reason': 'Reprise B3',
          'authorId': 'g-1',
          'createdAt': '2026-10-24T09:42:00Z',
        },
        {
          'version': 1,
          'geometryHash': 'h1',
          'areaM2': 450.02,
          'reason': null,
          'authorId': 'g-1',
          'createdAt': '2026-10-14T10:05:00Z',
        },
      ], 200);
    });

    final attestation = await client.issueAttestation('TG-AG3-00457');
    expect(attestation.number, 'AT-2026-000031');
    final versions = await client.listVersions('TG-AG3-00457');
    expect(versions.map((v) => v.version), [2, 1]);
    expect(versions.first.reason, 'Reprise B3');
  });

  test('demandes de leve : filtre, creation et prise', () async {
    final request = {
      'id': 'r-1',
      'state': 'OUVERTE',
      'agentId': 'a-1',
      'surveyorId': null,
      'locality': 'Baguida',
      'description': 'Lot a lever.',
      'createdAt': '2026-10-27T08:00:00Z',
    };
    final client = api((r) async {
      if (r.method == 'GET') return json([request], 200);
      if (r.url.path.endsWith('/take')) {
        return json({...request, 'state': 'PRISE', 'surveyorId': 'g-1'}, 200);
      }
      return json(request, 201);
    }, token: null);

    expect(
      (await client.listSurveyRequests(state: 'OUVERTE')).single.locality,
      'Baguida',
    );
    expect(requests.last.url.query, 'state=OUVERTE');
    expect(requests.last.headers.containsKey('Authorization'), isFalse);
    await client.createSurveyRequest(
      locality: 'Baguida',
      description: 'Lot a lever.',
    );
    expect(jsonDecode(requests.last.body), {
      'locality': 'Baguida',
      'description': 'Lot a lever.',
    });
    expect((await client.takeSurveyRequest('r-1')).state, 'PRISE');
  });
}
