/// Recepteur GNSS Bluetooth renvoye par `startScan` du pont natif.
class GnssDevice {
  const GnssDevice({
    required this.name,
    required this.address,
    this.isBonded = false,
  });

  /// Nom affiche par Android, par exemple `UM982_GNSS`.
  final String name;

  /// Adresse MAC utilisee par `connectDevice`.
  final String address;

  /// Vrai quand l'appareil est deja apparie avec le telephone.
  final bool isBonded;

  /// Vrai quand le nom ressemble a un recepteur GNSS connu.
  bool get looksLikeReceiver {
    final value = name.toLowerCase();
    return value.contains('um980') ||
        value.contains('um982') ||
        value.contains('gnss') ||
        value.contains('rtk') ||
        value.contains('u-blox') ||
        value.contains('ublox') ||
        value.contains('f9p');
  }

  static GnssDevice? tryParse(Object? value) {
    if (value is! Map) return null;
    final address = (value['address'] as String?)?.trim() ?? '';
    if (address.isEmpty) return null;
    final rawName = (value['name'] as String?)?.trim() ?? '';
    return GnssDevice(
      name: rawName.isEmpty ? 'Recepteur inconnu' : rawName,
      address: address,
      isBonded: value['isBonded'] == true,
    );
  }

  Map<String, Object?> toMap() {
    return {'name': name, 'address': address, 'isBonded': isBonded};
  }
}
