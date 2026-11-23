/// Etat materiel optionnel d'une source GNSS.
///
/// Une source simulee n'implemente pas cette interface : seuls les recepteurs
/// physiques exposent l'etat de l'adaptateur Bluetooth.
abstract interface class GnssSourceStatus {
  /// Vrai quand l'adaptateur Bluetooth est desactive.
  bool get bluetoothDisabled;

  /// Dernier refus ou echec lisible, nul quand la source fonctionne.
  String? get error;

  /// Relit l'etat de l'adaptateur Bluetooth.
  Future<bool> refreshBluetoothState();
}
