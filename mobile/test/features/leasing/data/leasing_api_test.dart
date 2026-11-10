import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/leasing/data/leasing_api.dart';
import 'package:geosmart_mobile/features/leasing/domain/entities/leasing_models.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  LeasingApi apiWith(
    Future<http.Response> Function(http.Request request) handler,
  ) => LeasingApi(
    MockClient(handler),
    baseUrl: 'https://api.test',
    token: () async => 'jeton',
  );

  http.Response json(Object? body, [int status = 200]) => http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json'},
  );

  const visitJson = {
    'id': 'visite-1',
    'propertyId': 'bien-1',
    'requesterId': 'compte-1',
    'status': 'DEMANDEE',
    'scheduledAt': null,
    'reminderAt': null,
    'createdAt': '2026-11-10T08:00:00.000Z',
    'updatedAt': '2026-11-10T08:00:00.000Z',
  };

  group('LeasingApi visites (EF-305)', () {
    test('demande une visite avec le jeton du compte', () async {
      late http.Request seen;
      final api = apiWith((request) async {
        seen = request;
        return json(visitJson, 201);
      });

      final visit = await api.requestVisit('bien-1');

      expect(seen.url.path, '/visits');
      expect(seen.method, 'POST');
      expect(seen.headers['Authorization'], 'Bearer jeton');
      expect(jsonDecode(seen.body), {'propertyId': 'bien-1'});
      expect(visit.status, VisitStatus.demandee);
      expect(visit.propertyId, 'bien-1');
    });

    test('liste mes visites', () async {
      final api = apiWith((request) async => json([visitJson]));

      final visits = await api.listVisits();

      expect(visits, hasLength(1));
      expect(visits.single.id, 'visite-1');
    });

    test('confirme une visite avec rappel', () async {
      late Map<String, dynamic> body;
      final api = apiWith((request) async {
        body = jsonDecode(request.body) as Map<String, dynamic>;
        return json({
          ...visitJson,
          'status': 'CONFIRMEE',
          'scheduledAt': '2026-11-12T10:00:00.000Z',
          'reminderAt': '2026-11-12T08:00:00.000Z',
        });
      });

      final visit = await api.updateVisitStatus(
        'visite-1',
        VisitStatus.confirmee,
        scheduledAt: DateTime.utc(2026, 11, 12, 10),
        reminderAt: DateTime.utc(2026, 11, 12, 8),
      );

      expect(body['status'], 'CONFIRMEE');
      expect(body['scheduledAt'], '2026-11-12T10:00:00.000Z');
      expect(visit.status, VisitStatus.confirmee);
      expect(visit.reminderAt, DateTime.utc(2026, 11, 12, 8));
    });

    test('bien inexistant : erreur 400 du serveur', () async {
      final api = apiWith(
        (request) async => json({
          'code': 'VALIDATION_ERROR',
          'message': 'Le bien est introuvable ou n est pas publie.',
        }, 400),
      );

      await expectLater(
        api.requestVisit('inconnu'),
        throwsA(
          isA<LeasingApiException>().having(
            (error) => error.message,
            'message',
            contains('introuvable'),
          ),
        ),
      );
    });
  });

  group('LeasingApi baux et loyers (EF-307)', () {
    const leaseJson = {
      'id': 'bail-1',
      'propertyId': 'bien-1',
      'agentId': 'agent-1',
      'tenantAccountId': null,
      'tenantName': 'Kossi',
      'monthlyRent': 100000,
      'startDate': '2026-12-01',
      'months': 2,
      'createdAt': '2026-11-10T08:00:00.000Z',
      'rents': [
        {
          'id': 'loyer-1',
          'dueDate': '2026-12-01',
          'amount': 100000,
          'status': 'A_PAYER',
          'paidAt': null,
        },
        {
          'id': 'loyer-2',
          'dueDate': '2027-01-01',
          'amount': 100000,
          'status': 'A_PAYER',
          'paidAt': null,
        },
      ],
    };

    test('cree un bail', () async {
      late Map<String, dynamic> body;
      final api = apiWith((request) async {
        body = jsonDecode(request.body) as Map<String, dynamic>;
        return json(leaseJson, 201);
      });

      final lease = await api.createLease(
        propertyId: 'bien-1',
        monthlyRent: 100000,
        startDate: '2026-12-01',
        months: 2,
        tenantName: 'Kossi',
      );

      expect(body['monthlyRent'], 100000);
      expect(body['tenantName'], 'Kossi');
      expect(lease.rents, hasLength(2));
      expect(lease.rents.first.status, RentStatus.aPayer);
      expect(lease.tenantName, 'Kossi');
    });

    test('un client ne cree pas de bail : 403 du serveur', () async {
      final api = apiWith(
        (request) async => json({
          'code': 'FORBIDDEN',
          'message': 'Action non autorisee pour votre role.',
        }, 403),
      );

      await expectLater(
        api.createLease(
          propertyId: 'bien-1',
          monthlyRent: 100000,
          startDate: '2026-12-01',
          months: 2,
        ),
        throwsA(
          isA<LeasingApiException>().having(
            (error) => error.status,
            'status',
            403,
          ),
        ),
      );
    });

    test('marque un loyer paye', () async {
      late http.Request seen;
      final api = apiWith((request) async {
        seen = request;
        return json({
          'id': 'loyer-1',
          'dueDate': '2026-12-01',
          'amount': 100000,
          'status': 'PAYEE',
          'paidAt': '2026-11-10T09:00:00.000Z',
        });
      });

      final rent = await api.markRentPaid('bail-1', 'loyer-1');

      expect(seen.url.path, '/leases/bail-1/rents/loyer-1/pay');
      expect(rent.status, RentStatus.payee);
      expect(rent.paidAt, isNotNull);
    });
  });

  group('LeasingApi etats des lieux (EF-306)', () {
    test('envoie clientId, kind et signature en base64', () async {
      late Map<String, dynamic> body;
      final api = apiWith((request) async {
        body = jsonDecode(request.body) as Map<String, dynamic>;
        return json({
          'id': 'etat-1',
          'leaseId': 'bail-1',
          'kind': 'ENTRY',
          'clientId': 'client-1',
          'notes': 'Rien a signaler.',
          'photos': [],
          'createdAt': '2026-11-10T09:00:00.000Z',
        }, 201);
      });

      final inspection = await api.createInspection(
        'bail-1',
        clientId: 'client-1',
        kind: InspectionKind.entry,
        tenantSignatureBase64: 'cG5n',
        notes: 'Rien a signaler.',
      );

      expect(body['clientId'], 'client-1');
      expect(body['kind'], 'ENTRY');
      expect(body['tenantSignatureBase64'], 'cG5n');
      expect(inspection.kind, InspectionKind.entry);
      expect(inspection.notes, 'Rien a signaler.');
    });

    test('renvoi du meme clientId : le serveur ne cree pas de doublon', () async {
      var calls = 0;
      final api = apiWith((request) async {
        calls++;
        return json({
          'id': 'etat-1',
          'leaseId': 'bail-1',
          'kind': 'EXIT',
          'clientId': 'client-1',
          'notes': null,
          'photos': [],
          'createdAt': '2026-11-10T09:00:00.000Z',
        }, 201);
      });

      final first = await api.createInspection(
        'bail-1',
        clientId: 'client-1',
        kind: InspectionKind.exit,
        tenantSignatureBase64: 'cG5n',
      );
      final resend = await api.createInspection(
        'bail-1',
        clientId: 'client-1',
        kind: InspectionKind.exit,
        tenantSignatureBase64: 'cG5n',
      );

      expect(calls, 2);
      expect(resend.id, first.id);
    });

    test('clientId reuse pour un contenu different : 409', () async {
      final api = apiWith(
        (request) async => json({
          'code': 'IDEMPOTENCY_CONFLICT',
          'message': 'Ce clientId est deja associe a un etat des lieux '
              'different.',
        }, 409),
      );

      await expectLater(
        api.createInspection(
          'bail-1',
          clientId: 'client-1',
          kind: InspectionKind.entry,
          tenantSignatureBase64: 'cG5n',
        ),
        throwsA(
          isA<LeasingApiException>().having(
            (error) => error.code,
            'code',
            'IDEMPOTENCY_CONFLICT',
          ),
        ),
      );
    });

    test('liste les etats des lieux d un bail', () async {
      final api = apiWith(
        (request) async => json([
          {
            'id': 'etat-1',
            'leaseId': 'bail-1',
            'kind': 'ENTRY',
            'clientId': 'client-1',
            'notes': null,
            'photos': [
              {
                'id': 'photo-1',
                'takenAt': '2026-11-10T09:00:00.000Z',
                'sizeBytes': 2048,
              },
            ],
            'createdAt': '2026-11-10T09:00:00.000Z',
          },
        ]),
      );

      final inspections = await api.listInspections('bail-1');

      expect(inspections.single.photos.single.sizeBytes, 2048);
    });
  });
}
