import '../domain/entities/ntrip_caster.dart';
import '../domain/repositories/caster_credential_store.dart';
import 'gnss_channel.dart';

/// Conserve la configuration NTRIP dans le stockage natif Android.
///
/// Le mot de passe est chiffre avec une cle du Keystore par
/// `CasterCredentialVault`. Si le natif refuse, [save] leve une
/// [CasterCredentialException] pour ne jamais retomber sur un stockage clair.
class MethodChannelCasterCredentialStore implements CasterCredentialStore {
  MethodChannelCasterCredentialStore({GnssChannel? channel})
    : _channel = channel ?? GnssChannel();

  final GnssChannel _channel;

  @override
  Future<void> save(NtripCaster caster) async {
    final saved = await _channel.saveCaster(caster);
    if (!saved) {
      throw const CasterCredentialException(
        'Le stockage securise du caster est indisponible.',
      );
    }
  }

  @override
  Future<NtripCaster?> load() => _channel.loadCaster();

  @override
  Future<void> clear() async {
    await _channel.clearCaster();
  }
}

class CasterCredentialException implements Exception {
  const CasterCredentialException(this.message);

  final String message;

  @override
  String toString() => message;
}
