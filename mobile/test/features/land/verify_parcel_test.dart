import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/data/parcel_status_api.dart';
import 'package:geosmart_mobile/features/land/data/parcel_status_cache.dart';
import 'package:geosmart_mobile/features/land/domain/entities/parcel_public_status.dart';
import 'package:geosmart_mobile/features/land/domain/usecases/check_parcel.dart';
import 'package:geosmart_mobile/features/land/presentation/verify_parcel_page.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// Reponse du serveur pour la maquette C1 (parcelle en litige).
const litige = {
  'id': 'TG-AG3-00377',
  'legalStatus': 'EN_LITIGE',
  'statusSource': 'Tribunal de Lome, ordonnance 2026/88',
  'statusDate': '2026-09-12',
  'titleNumber': null,
  'disputeNote': 'Un voisin conteste la limite est.',
  'certified': false,
  'areaM2': 612.4,
  'version': 3,
  'versionsCount': 3,
  'lastSurveyAt': '2026-10-14T10:05:00.000Z',
  'bornage': {
    'neighboursTotal': 3,
    'neighboursPresent': 2,
    'heldAt': '2026-10-14T09:00:00Z',
  },
  'updatedAt': '2026-10-14T10:05:00.000Z',
  'warnings': ['Ne vaut pas titre foncier.'],
};

/// Faux serveur : repond selon l'identifiant, ou coupe le reseau.
class FakeServer {
  bool online = true;
  final requested = <Uri>[];

  http.Client get client => MockClient((request) async {
    requested.add(request.url);
    if (!online) throw const SocketException('hors ligne');
    if (request.url.path == '/parcels/TG-AG3-00377/status') {
      return http.Response(
        jsonEncode(litige),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    return http.Response(
      '{"code":"NOT_FOUND","message":"Parcelle introuvable."}',
      404,
    );
  });
}

void main() {
  group('ParcelStatusApi', () {
    test('lit le statut public du contrat', () async {
      final server = FakeServer();
      final status = await ParcelStatusApi(
        server.client,
        baseUrl: 'http://api.test/',
      ).fetch('TG-AG3-00377');
      expect(
        server.requested.single.toString(),
        'http://api.test/parcels/TG-AG3-00377/status',
      );
      expect(status.inDispute, isTrue);
      expect(status.bornage, (neighboursTotal: 3, neighboursPresent: 2));
      expect(
        ParcelPublicStatus.fromJson(status.toJson()).toJson(),
        status.toJson(),
      );
    });

    test('distingue introuvable et hors ligne', () async {
      final server = FakeServer();
      final api = ParcelStatusApi(server.client, baseUrl: 'http://api.test');
      await expectLater(
        api.fetch('TG-AG3-99999'),
        throwsA(
          isA<ParcelStatusException>().having(
            (e) => e.kind,
            'kind',
            ParcelStatusFailure.notFound,
          ),
        ),
      );
      server.online = false;
      await expectLater(
        api.fetch('TG-AG3-00377'),
        throwsA(
          isA<ParcelStatusException>().having(
            (e) => e.kind,
            'kind',
            ParcelStatusFailure.network,
          ),
        ),
      );
    });
  });

  group('CheckParcel', () {
    test('garde le resultat et le ressert hors ligne avec sa date', () async {
      final server = FakeServer();
      final cache = MemoryParcelStatusCache();
      final consulted = DateTime.utc(2026, 10, 24, 11, 20);
      final check = CheckParcel(
        ParcelStatusApi(server.client, baseUrl: 'http://api.test'),
        cache,
        clock: () => consulted,
      );

      expect(await check('TG-AG3-00377'), isA<FreshResult>());
      server.online = false;
      final offline = await check('TG-AG3-00377');
      expect(offline, isA<OfflineResult>());
      expect((offline as OfflineResult).cached.consultedAt, consulted);

      final unknown = await check('TG-AG3-00457');
      expect(
        unknown,
        isA<CheckFailed>().having(
          (f) => f.kind,
          'kind',
          ParcelStatusFailure.network,
        ),
      );
    });
  });

  group('VerifyParcelPage', () {
    Future<FakeServer> pump(
      WidgetTester tester,
      MemoryParcelStatusCache cache,
    ) async {
      final server = FakeServer();
      tester.view.physicalSize = const Size(1080, 2600);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          home: VerifyParcelPage(
            checkParcel: CheckParcel(
              ParcelStatusApi(server.client, baseUrl: 'http://api.test'),
              cache,
              clock: () => DateTime.utc(2026, 10, 24, 11, 20),
            ),
            cache: cache,
          ),
        ),
      );
      return server;
    }

    testWidgets('affiche le resultat de la maquette C1', (tester) async {
      await pump(tester, MemoryParcelStatusCache());
      await tester.enterText(find.byType(TextField), 'tg-ag3-00377');
      await tester.tap(find.text('Vérifier'));
      await tester.pumpAndSettle();

      expect(find.text('TG-AG3-00377'), findsWidgets);
      expect(find.text('En litige'), findsOneWidget);
      expect(find.text('Non certifiée'), findsOneWidget);
      expect(find.text('14/10/2026 · v3'), findsOneWidget);
      expect(find.text('2 voisins sur 3'), findsOneWidget);
      expect(find.text('Litige signalé le 12/09/2026'), findsOneWidget);
      expect(
        find.text("NE VAUT PAS TITRE FONCIER · CONSULTEZ L'ANDF"),
        findsOneWidget,
      );
      expect(
        find.text(
          "Résultat gardé sur l'appareil · consulté le 24/10/2026 à 11:20",
        ),
        findsOneWidget,
      );
    });

    testWidgets('refuse un identifiant mal forme', (tester) async {
      final server = await pump(tester, MemoryParcelStatusCache());
      await tester.enterText(find.byType(TextField), 'AG3-457');
      await tester.tap(find.text('Vérifier'));
      await tester.pump();
      expect(find.textContaining('Format attendu'), findsOneWidget);
      expect(server.requested, isEmpty);
    });

    testWidgets('montre le dernier resultat garde a l ouverture, hors ligne', (
      tester,
    ) async {
      final cache = MemoryParcelStatusCache();
      await cache.save(
        ParcelPublicStatus.fromJson(litige),
        DateTime.utc(2026, 10, 20, 8, 5),
      );
      await pump(tester, cache);
      await tester.pumpAndSettle();

      expect(find.text("Résultat gardé sur l'appareil"), findsOneWidget);
      expect(
        find.textContaining('Consulté le 20/10/2026 à 08:05'),
        findsOneWidget,
      );
      expect(find.text('2 voisins sur 3'), findsOneWidget);
    });
  });
}
