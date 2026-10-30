import '../entities/ntrip_caster.dart';

/// Conservation locale des parametres du caster NTRIP.
///
/// En production, le mot de passe ne doit jamais etre stocke en clair :
/// l'implementation Android le chiffre avec une cle du Keystore.
abstract interface class CasterCredentialStore {
  Future<void> save(NtripCaster caster);

  Future<NtripCaster?> load();

  Future<void> clear();
}

/// Implementation en memoire, utilisee par les tests et comme repli quand
/// aucun stockage securise n'est disponible.
class InMemoryCasterCredentialStore implements CasterCredentialStore {
  NtripCaster? _caster;

  @override
  Future<void> save(NtripCaster caster) async {
    _caster = caster;
  }

  @override
  Future<NtripCaster?> load() async => _caster;

  @override
  Future<void> clear() async {
    _caster = null;
  }
}
