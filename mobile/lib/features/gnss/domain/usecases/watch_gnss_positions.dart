import '../entities/gnss_position.dart';
import '../repositories/gnss_repository.dart';

class WatchGnssPositions {
  const WatchGnssPositions(this._repository);

  final GnssRepository _repository;

  Stream<GnssPosition> call() => _repository.positions;
}
