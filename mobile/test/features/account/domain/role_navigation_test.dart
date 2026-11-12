import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/account/domain/entities/account_user.dart';
import 'package:geosmart_mobile/features/account/domain/role_navigation.dart';

void main() {
  group('actionsForRole (EF-402)', () {
    test('un client voit les visites et son compte seulement', () {
      final actions = actionsForRole(AccountRole.client);

      expect(actions, containsAll([
        AccountAction.visits,
        AccountAction.account,
      ]));
      expect(actions, isNot(contains(AccountAction.leasing)));
      expect(actions, isNot(contains(AccountAction.admin)));
      expect(actions, isNot(contains(AccountAction.sync)));
    });

    test('un agent voit les visites et les baux', () {
      final actions = actionsForRole(AccountRole.agent);

      expect(actions, containsAll([
        AccountAction.visits,
        AccountAction.leasing,
        AccountAction.account,
      ]));
      expect(actions, isNot(contains(AccountAction.admin)));
    });

    test('un geometre et un topographe voient le leve et la synchronisation', () {
      for (final role in [AccountRole.geometre, AccountRole.topographe]) {
        final actions = actionsForRole(role);

        expect(actions, containsAll([
          AccountAction.survey,
          AccountAction.sync,
          AccountAction.account,
        ]));
        expect(actions, isNot(contains(AccountAction.visits)));
      }
    });

    test('un administrateur voit l espace administrateur', () {
      final actions = actionsForRole(AccountRole.admin);

      expect(actions, contains(AccountAction.admin));
    });

    test('un compte suspendu ne garde que la consultation de son compte', () {
      for (final role in AccountRole.values) {
        final actions = actionsForRole(role, accountActive: false);

        expect(actions, [AccountAction.account], reason: role.name);
      }
    });

    test('tous les roles actifs voient la carte des parcelles (EF-406)', () {
      for (final role in AccountRole.values) {
        expect(
          actionsForRole(role),
          contains(AccountAction.map),
          reason: role.name,
        );
      }
    });

    test('la barre de navigation garde au plus cinq entrees', () {
      for (final role in AccountRole.values) {
        // + Parametres, toujours present.
        expect(
          actionsForRole(role).length + 1,
          lessThanOrEqualTo(5),
          reason: role.name,
        );
      }
    });
  });

  group('AccountUser', () {
    test('lit le role renvoye par le serveur (RG-06)', () {
      final user = AccountUser.fromJson(const {
        'id': 'compte-1',
        'role': 'TOPOGRAPHE',
        'registeredSurveyor': false,
        'accountActive': true,
      });

      expect(user.role, AccountRole.topographe);
      expect(user.accountActive, isTrue);
    });
  });
}
