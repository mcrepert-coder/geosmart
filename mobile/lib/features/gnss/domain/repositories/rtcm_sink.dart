import 'dart:typed_data';

/// Port d'injection des corrections RTCM vers le recepteur GNSS.
///
/// Le client NTRIP produit les octets, le pont natif les ecrit sur la liaison
/// serie Bluetooth. Le domaine ne connait ni Dio ni MethodChannel.
abstract interface class RtcmSink {
  /// Renvoie `false` quand le recepteur n'est pas pret a recevoir le bloc.
  Future<bool> sendRtcm(Uint8List bytes);
}
