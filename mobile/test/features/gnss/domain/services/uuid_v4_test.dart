import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/services/uuid_v4.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/missions_controller.dart';

import '../../../../support/fake_multi_session_store.dart';

// Meme expression que le serveur (api/src/sync/sync.service.ts, UUID_RE).
final serverUuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

void main() {
  test('produit des UUID v4 acceptes par POST /sync, sans doublon', () {
    final ids = {for (var i = 0; i < 1000; i++) uuidV4()};
    expect(ids, hasLength(1000));
    for (final id in ids) {
      expect(serverUuid.hasMatch(id), isTrue, reason: id);
      expect(id[14], '4'); // version
      expect('89ab'.contains(id[19]), isTrue); // variante
    }
  });

  test('une nouvelle mission a un clientId UUID', () async {
    final missions = MissionsController(
      store: FakeMultiSessionStore(),
      defaultProjectId: 'chantier',
      defaultSurveyorId: 'topo',
    );
    addTearDown(missions.dispose);

    final session = await missions.createMission(title: 'Leve');

    expect(serverUuid.hasMatch(session!.clientId), isTrue);
  });
}
