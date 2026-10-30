import '../entities/gnss_position.dart';

/// Source de positions GNSS utilisee par l'ecran de mesure.
///
/// L'implementation reelle viendra du pont Kotlin (contrat
/// `contracts/gnss-channel.md`). En attendant, [SimulatedGnssSource] fournit
/// des positions annoncees comme simulees.
abstract interface class GnssPositionSource {
  /// Positions successives du recepteur, dans l'ordre d'arrivee.
  Stream<GnssPosition> get positions;

  /// Vrai quand les positions viennent du simulateur et non du UM982.
  bool get isSimulation;

  /// Demarre la source. Sans effet si elle tourne deja.
  Future<void> start();

  /// Arrete la source et libere ses ressources.
  Future<void> stop();
}
