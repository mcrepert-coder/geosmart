import '../entities/gnss_position.dart';

abstract interface class GnssRepository {
  Stream<GnssPosition> get positions;

  Future<void> savePosition(GnssPosition position);
}
