import 'dart:async';
import 'dart:math' as math;

import '../../domain/entities/gnss_fix_quality.dart';
import '../../domain/entities/gnss_position.dart';
import '../../domain/repositories/gnss_position_source.dart';

/// Source GNSS simulee, utilisee tant que le pont Kotlin n'est pas branche.
///
/// Les positions sont toujours annoncees comme simulees. La qualite reste en
/// Float pendant les trois premieres epoques, puis passe en RTK Fixed : aucune
/// precision RTK n'est revendiquee.
class SimulatedGnssSource implements GnssPositionSource {
  SimulatedGnssSource({
    this.interval = const Duration(seconds: 1),
    this.fixedAfterEpochs = 3,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final Duration interval;
  final int fixedAfterEpochs;
  final DateTime Function() _clock;

  final StreamController<GnssPosition> _controller =
      StreamController<GnssPosition>.broadcast();
  Timer? _timer;
  int _epoch = 0;

  @override
  Stream<GnssPosition> get positions => _controller.stream;

  @override
  bool get isSimulation => true;

  @override
  Future<void> start() async {
    if (_timer != null) return;
    _emit();
    _timer = Timer.periodic(interval, (_) => _emit());
  }

  @override
  Future<void> stop() async {
    _timer?.cancel();
    _timer = null;
  }

  void _emit() {
    if (_controller.isClosed) return;
    final fixed = _epoch >= fixedAfterEpochs;
    final wave = math.sin(_epoch / 3) * 0.000004;
    _controller.add(
      GnssPosition(
        latitude: 6.13192 + wave,
        longitude: 1.22281 + wave,
        altitude: 12.5 + math.cos(_epoch / 4) * 0.03,
        accuracy: fixed ? 0.012 : 0.410,
        fixQuality: fixed ? GnssFixQuality.fixed : GnssFixQuality.float,
        satellitesCount: fixed ? 18 : 13,
        pdop: fixed ? 1.4 : 2.6,
        hdop: fixed ? 0.8 : 1.5,
        vdop: fixed ? 1.1 : 2.1,
        instrument: 'UM982 (simulation)',
        recordedAt: _clock().toUtc(),
      ),
    );
    _epoch++;
  }
}
