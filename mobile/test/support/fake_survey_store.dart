import 'dart:async';

import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_point.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/survey_session_status.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/gnss_position_source.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/gnss_source_status.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/survey_session_store.dart';

/// Faux depot local en memoire pour les tests de la couche presentation.
class FakeSurveySessionStore implements SurveySessionStore {
  FakeSurveySessionStore({this.session, List<SurveyPoint>? points}) {
    if (points != null) this.points.addAll(points);
  }

  SurveySession? session;
  final List<SurveyPoint> points = [];
  bool failAdds = false;
  int addCalls = 0;

  @override
  Future<void> createSession(SurveySession value) async {
    session = value;
  }

  @override
  Future<SurveySession?> loadSession(String id) async {
    final current = session;
    if (current == null || current.id != id) return null;
    return current.copyWith(points: [...points]);
  }

  @override
  Future<void> saveSession(SurveySession value) async {
    session = value;
  }

  @override
  Future<List<SurveyPoint>> pointsFor(String sessionId) async => [...points];

  @override
  Future<void> addPoint(String sessionId, SurveyPoint point) async {
    addCalls++;
    if (failAdds) throw StateError('Ecriture refusee');
    points.add(point);
    session = session?.copyWith(status: SurveySessionStatus.inProgress);
  }

  @override
  Future<void> removePoint(String pointId) async {
    points.removeWhere((point) => point.id == pointId);
  }
}

/// Source GNSS pilotee a la main, sans minuterie, pour des tests deterministes.
class ManualGnssSource implements GnssPositionSource {
  final StreamController<GnssPosition> _controller =
      StreamController<GnssPosition>.broadcast();
  bool started = false;

  @override
  bool get isSimulation => true;

  @override
  Stream<GnssPosition> get positions => _controller.stream;

  @override
  Future<void> start() async {
    started = true;
  }

  @override
  Future<void> stop() async {
    if (!_controller.isClosed) await _controller.close();
  }

  void emit(GnssPosition position) => _controller.add(position);
}

/// Source native pilotable, avec un etat Bluetooth modifiable par le test.
class FakeStatusGnssSource implements GnssPositionSource, GnssSourceStatus {
  FakeStatusGnssSource({bool bluetoothDisabled = false})
    : _bluetoothEnabled = !bluetoothDisabled,
      _bluetoothDisabled = bluetoothDisabled;

  final StreamController<GnssPosition> _controller =
      StreamController<GnssPosition>.broadcast();
  bool started = false;
  int refreshCalls = 0;
  bool _bluetoothEnabled;
  bool _bluetoothDisabled;

  @override
  bool get bluetoothDisabled => _bluetoothDisabled;

  @override
  String? error;

  @override
  bool get isSimulation => false;

  @override
  Stream<GnssPosition> get positions => _controller.stream;

  /// Change l'etat materiel sans toucher a l'etat deja lu par la source.
  void setBluetoothEnabled(bool enabled) => _bluetoothEnabled = enabled;

  @override
  Future<void> start() async {
    started = true;
    await refreshBluetoothState();
  }

  @override
  Future<void> stop() async {
    started = false;
    if (!_controller.isClosed) await _controller.close();
  }

  @override
  Future<bool> refreshBluetoothState() async {
    refreshCalls++;
    _bluetoothDisabled = !_bluetoothEnabled;
    error = _bluetoothDisabled ? 'Bluetooth desactive.' : null;
    return _bluetoothEnabled;
  }

  void emit(GnssPosition position) => _controller.add(position);
}
