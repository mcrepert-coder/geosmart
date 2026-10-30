import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../domain/entities/gnss_fix_quality.dart';
import '../../domain/entities/gnss_position.dart';
import '../../domain/entities/survey_point.dart';
import '../../domain/entities/survey_session.dart';
import '../../domain/repositories/gnss_position_source.dart';
import '../../domain/repositories/survey_session_store.dart';

/// Evenements destines a la vue (toast, annulation, erreur).
sealed class SurveyEvent {
  const SurveyEvent();
}

class PointRecorded extends SurveyEvent {
  const PointRecorded(this.point);

  final SurveyPoint point;
}

class MeasurementCancelled extends SurveyEvent {
  const MeasurementCancelled(this.reason);

  final String reason;
}

class SurveyError extends SurveyEvent {
  const SurveyError(this.message);

  final String message;
}

/// ViewModel de l'ecran de mesure (MVVM).
///
/// Il porte l'etat de la mission, la position courante, la moyenne de dix
/// epoques et l'enregistrement local. La vue ne fait qu'afficher cet etat et
/// relayer les actions. La regle RG-01 reste dans le domaine, via
/// [GnssFixQuality.canRecordPoint].
class SurveyController extends ChangeNotifier {
  SurveyController({
    required this.store,
    required this.source,
    required this.sessionId,
    this.epochsRequired = 10,
    String Function()? idGenerator,
    DateTime Function()? clock,
  }) : _idGenerator = idGenerator ?? _defaultId,
       _clock = clock ?? DateTime.now;

  final SurveySessionStore store;
  final GnssPositionSource source;
  final String sessionId;

  /// Nombre d'epoques moyennes avant l'enregistrement d'une borne.
  final int epochsRequired;

  final String Function() _idGenerator;
  final DateTime Function() _clock;
  final StreamController<SurveyEvent> _events =
      StreamController<SurveyEvent>.broadcast();

  SurveySession? _session;
  List<SurveyPoint> _points = const [];
  GnssPosition? _position;
  final List<GnssPosition> _epochs = [];
  StreamSubscription<GnssPosition>? _subscription;
  bool _loading = true;
  bool _isAveraging = false;
  bool _started = false;
  bool _disposed = false;
  String? _error;

  static int _idCounter = 0;

  static String _defaultId() {
    _idCounter++;
    return '${DateTime.now().toUtc().microsecondsSinceEpoch}-$_idCounter';
  }

  SurveySession? get session => _session;

  List<SurveyPoint> get points => List.unmodifiable(_points);

  GnssPosition? get position => _position;

  bool get isLoading => _loading;

  bool get isAveraging => _isAveraging;

  bool get isSimulation => source.isSimulation;

  bool get hasConnection => _position != null;

  int get epochsCollected => _epochs.length;

  double get measurementProgress =>
      epochsRequired == 0 ? 0 : _epochs.length / epochsRequired;

  String? get error => _error;

  Stream<SurveyEvent> get events => _events.stream;

  /// RG-01 : une borne ne s'enregistre que sur un point RTK Fixed, hors
  /// moyenne en cours.
  bool get canRecord =>
      !_loading && !_isAveraging && (_position?.canRecordPoint ?? false);

  /// Raison lisible du desaccord du bouton, nulle quand il est actif.
  String? get disabledReason {
    if (_loading) return 'Chargement de la mission locale.';
    if (_isAveraging) return 'Mesure en cours, ne bougez pas.';
    if (_position == null) {
      return _error ?? 'En attente du recepteur GNSS.';
    }
    if (_position!.canRecordPoint) return null;
    return _error ??
        switch (_position!.fixQuality) {
          GnssFixQuality.fixed => null,
          GnssFixQuality.float =>
            'RTK Float : attendez le RTK Fixed pour enregistrer.',
          GnssFixQuality.dgps => 'DGPS : passez en RTK Fixed pour enregistrer.',
          GnssFixQuality.autonomous =>
            'Mode autonome : passez en RTK Fixed pour enregistrer.',
          GnssFixQuality.invalid => 'Fix invalide : position non exploitable.',
        };
  }

  /// Charge la mission locale puis ecoute le flux GNSS.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    _loading = true;
    notifyListeners();
    try {
      final session = await store.loadSession(sessionId);
      if (session == null) {
        _error = "Mission introuvable sur l'appareil.";
      } else {
        _session = session;
        _points = [...session.points]
          ..sort((a, b) => a.pointNumber.compareTo(b.pointNumber));
        _subscription = source.positions.listen(_onPosition);
        await source.start();
      }
    } catch (_) {
      _error = 'Impossible de charger la mission locale.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Demarre la moyenne des dix epoques (RG-01).
  void startMeasurement() {
    if (!canRecord) return;
    _epochs.clear();
    _isAveraging = true;
    notifyListeners();
  }

  /// Annule une moyenne en cours sur demande de l'operateur.
  void cancelMeasurement() {
    if (!_isAveraging) return;
    _cancelMeasurement('Mesure annulee.');
    notifyListeners();
  }

  /// Supprime une borne enregistree, par exemple apres le toast `Annuler`.
  Future<void> undoPoint(String pointId) async {
    final index = _points.indexWhere((point) => point.id == pointId);
    if (index < 0) return;
    try {
      await store.removePoint(pointId);
      _points = [..._points]..removeAt(index);
      notifyListeners();
    } catch (_) {
      _error = 'La borne n\'a pas pu etre supprimee.';
      _events.add(const SurveyError("La borne n'a pas pu etre supprimee."));
      notifyListeners();
    }
  }

  void _onPosition(GnssPosition position) {
    if (_disposed) return;
    _position = position;
    if (_isAveraging) {
      if (!position.canRecordPoint) {
        _cancelMeasurement('RTK Fixed perdu, mesure annulee.');
      } else {
        _epochs.add(position);
        if (_epochs.length >= epochsRequired) {
          unawaited(_finishMeasurement());
        }
      }
    }
    notifyListeners();
  }

  void _cancelMeasurement(String reason) {
    _isAveraging = false;
    _epochs.clear();
    _events.add(MeasurementCancelled(reason));
  }

  Future<void> _finishMeasurement() async {
    if (_session == null) return;
    final epochs = List<GnssPosition>.from(_epochs);
    _isAveraging = false;
    _epochs.clear();
    if (epochs.length < epochsRequired) {
      notifyListeners();
      return;
    }

    final last = epochs.last;
    final averaged = GnssPosition(
      latitude: _mean(epochs, (epoch) => epoch.latitude),
      longitude: _mean(epochs, (epoch) => epoch.longitude),
      altitude: _meanOrNull(epochs, (epoch) => epoch.altitude),
      accuracy: _meanOrNull(epochs, (epoch) => epoch.accuracy),
      fixQuality: GnssFixQuality.fixed,
      satellitesCount: last.satellitesCount,
      pdop: _meanOrNull(epochs, (epoch) => epoch.pdop),
      hdop: _meanOrNull(epochs, (epoch) => epoch.hdop),
      vdop: _meanOrNull(epochs, (epoch) => epoch.vdop),
      instrument: last.instrument,
      recordedAt: _clock().toUtc(),
    );

    final number = (_points.isEmpty ? 0 : _points.last.pointNumber) + 1;
    final point = SurveyPoint.fromPosition(
      id: _idGenerator(),
      clientId: _idGenerator(),
      projectId: _session!.projectId,
      surveyorId: _session!.surveyorId,
      pointNumber: number,
      pointName: 'B$number',
      position: averaged,
    );

    try {
      await store.addPoint(_session!.id, point);
      _points = [..._points, point];
      _error = null;
      _events.add(PointRecorded(point));
    } catch (_) {
      _error = "La borne n'a pas pu etre enregistree.";
      _events.add(const SurveyError("La borne n'a pas pu etre enregistree."));
    }
    notifyListeners();
  }

  double _mean(
    List<GnssPosition> epochs,
    double Function(GnssPosition) select,
  ) {
    var sum = 0.0;
    for (final epoch in epochs) {
      sum += select(epoch);
    }
    return sum / epochs.length;
  }

  double? _meanOrNull(
    List<GnssPosition> epochs,
    double? Function(GnssPosition) select,
  ) {
    final values = <double>[
      for (final epoch in epochs)
        if (select(epoch) != null) select(epoch)!,
    ];
    if (values.isEmpty) return null;
    return values.reduce((a, b) => a + b) / values.length;
  }

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _subscription?.cancel();
    unawaited(source.stop());
    unawaited(_events.close());
    super.dispose();
  }
}
