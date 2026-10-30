import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/data/land_api.dart';
import 'package:geosmart_mobile/features/land/presentation/land_errors.dart';

LandApiException overlap(List<Map<String, dynamic>> conflicts) =>
    LandApiException(
      409,
      'PARCEL_OVERLAP',
      'Le leve chevauche une parcelle existante.',
      {'conflicts': conflicts, 'auditSeq': 12},
    );

void main() {
  test('explique un chevauchement a la creation', () {
    final message = landErrorMessage(
      overlap([
        {'parcelId': 'TG-AG3-00001', 'overlapAreaM2': 42.5},
      ]),
    );
    expect(message, startsWith('Le levé recouvre TG-AG3-00001 sur 42,50'));
    expect(message, contains('Vérifiez les bornes ou signalez un litige.'));
  });

  test('parle de la nouvelle limite a la modification', () {
    final message = landErrorMessage(
      overlap([
        {'parcelId': 'TG-AG3-00001', 'overlapAreaM2': 42.5},
      ]),
      action: LandAction.update,
    );
    expect(message, startsWith('La nouvelle limite recouvre TG-AG3-00001'));
  });

  test('compte les autres parcelles en conflit', () {
    final message = landErrorMessage(
      overlap([
        {'parcelId': 'TG-AG3-00001', 'overlapAreaM2': 42.5},
        {'parcelId': 'TG-AG3-00002', 'overlapAreaM2': 3.0},
        {'parcelId': 'TG-AG3-00003', 'overlapAreaM2': 1.0},
      ]),
    );
    expect(message, contains('et 2 autres parcelles.'));
  });

  test('garde le message du serveur sans detail de conflit', () {
    expect(
      landErrorMessage(overlap(const [])),
      'Le leve chevauche une parcelle existante.',
    );
  });

  test('explique un refus pour role ou compte suspendu (403)', () {
    final message = landErrorMessage(
      const LandApiException(
        403,
        'FORBIDDEN',
        'Action non autorisee pour votre role.',
      ),
    );
    expect(message, contains('votre compte est suspendu'));
    expect(message, contains('Contactez l\'administrateur'));
  });

  test('demande de se reconnecter (401)', () {
    expect(
      landErrorMessage(
        const LandApiException(401, 'UNAUTHORIZED', 'Connexion requise.'),
      ),
      'Votre session a expiré. Reconnectez-vous puis renvoyez.',
    );
  });

  test('donne la version actuelle en cas de conflit de version', () {
    expect(
      landErrorMessage(
        const LandApiException(409, 'VERSION_CONFLICT', 'Conflit.', {
          'currentVersion': 4,
        }),
        action: LandAction.update,
      ),
      contains('(version 4)'),
    );
  });

  test('garde le message du serveur pour le reseau et le reste', () {
    expect(
      landErrorMessage(
        const LandApiException(0, 'NETWORK', 'Le serveur ne répond pas.'),
      ),
      'Le serveur ne répond pas.',
    );
    expect(
      landErrorMessage(
        const LandApiException(
          400,
          'VALIDATION_ERROR',
          'Le champ boundaries contient au plus 500 bornes.',
        ),
      ),
      'Le champ boundaries contient au plus 500 bornes.',
    );
  });
}
