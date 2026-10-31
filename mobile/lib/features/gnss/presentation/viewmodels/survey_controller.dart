// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../data/datasources/dio_sync_transport.dart';
import '../../domain/entities/gnss_fix_quality.dart';
import '../../domain/entities/gnss_position.dart';
import '../../domain/entities/survey_point.dart';
import '../../domain/entities/survey_session.dart';
import '../../domain/entities/survey_session_status.dart';
import '../../domain/repositories/gnss_position_source.dart';
import '../../domain/repositories/gnss_source_status.dart';
import '../../domain/repositories/survey_session_store.dart';
import '../../domain/repositories/sync_queue_store.dart';
import '../../domain/repositories/sync_transport.dart';
import '../../domain/services/survey_measurements.dart';
import '../../domain/services/sync_queue_processor.dart';

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

/// La mission vient de passer a `COMPLETED` avec ses mesures calculees.
class MissionCompleted extends SurveyEvent {
  const MissionCompleted(this.session);

  final SurveySession session;
}

/// Un passage de la file d'envoi est termine.
class SyncFinished extends SurveyEvent {
  const SyncFinished(this.result);

  final SyncQueueResult result;
}

/// Aucun serveur n'est configure pour envoyer la mission.
class SyncUnavailable extends SurveyEvent {
  const SyncUnavailable(this.message);

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
    required GnssPositionSource source,
    required this.sessionId,
    this.epochsRequired = 10,
    SyncQueueStore? queue,
    SyncTransport? syncTransport,
    String Function()? idGenerator,
    DateTime Function()? clock,
  }) : _source = source,
       queue =
           queue ?? (store is SyncQueueStore ? store as SyncQueueStore : null),
       _syncTransport = syncTransport ?? DioSyncTransport.fromEnvironment(),
       _idGenerator = idGenerator ?? _defaultId,
       _clock = clock ?? DateTime.now;

  final SurveySessionStore store;

  /// File locale des missions terminees. Par defaut, le depot SQLite sert
  /// aussi de file d'envoi.
  final SyncQueueStore? queue;

  final SyncTransport? _syncTransport;

  GnssPositionSource _source;

  GnssPositionSource get source => _source;

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
  bool _isFinishing = false;
  bool _isSyncing = false;
  int _pendingSyncCount = 0;
  String? _error;
  String? _syncError;

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

  /// Vrai quand le recepteur physique signale un Bluetooth desactive.
  ///
  /// Une source simulee n'implemente pas [GnssSourceStatus] : l'alerte reste
  /// donc invisible en mode simulation.
  bool get bluetoothDisabled {
    final status = _source is GnssSourceStatus
        ? _source as GnssSourceStatus
        : null;
    return status?.bluetoothDisabled ?? false;
  }

  bool get hasConnection => _position != null;

  int get epochsCollected => _epochs.length;

  double get measurementProgress =>
      epochsRequired == 0 ? 0 : _epochs.length / epochsRequired;

  String? get error => _error;

  Stream<SurveyEvent> get events => _events.stream;

  bool get isFinishing => _isFinishing;

  bool get isSyncing => _isSyncing;

  int get pendingSyncCount => _pendingSyncCount;

  String? get syncError => _syncError;

  /// Vrai quand un serveur est configure et qu'une file locale existe.
  bool get canSyncNow => queue != null && _syncTransport != null;

  /// La mission peut etre terminee avec ses mesures calculees.
  bool get canFinishMission =>
      !_loading &&
      !_isFinishing &&
      (_session?.copyWith(points: _points).canComplete ?? false);

  /// Mesures calculees de la mission terminee, nulles avant la fin du leve.
  SurveyMeasurements? get measurements {
    final session = _session;
    if (session?.perimeterMeters == null || session?.areaSquareMeters == null) {
      return null;
    }
    return SurveyMeasurements(
      edgeMeters: const [],
      perimeterMeters: session!.perimeterMeters!,
      areaSquareMeters: session.areaSquareMeters!,
    );
  }

  /// RG-01 : une borne ne s'enregistre que sur un point RTK Fixed, hors
  /// moyenne en cours.
  bool get canRecord =>
      !_loading && !_isAveraging && (_position?.canRecordPoint ?? false);

  /// Raison lisible du desaccord du bouton, nulle quand il est actif.
  String? get disabledReason {
    if (_loading) return 'Chargement de la mission locale.';
    if (_isAveraging) return 'Mesure en cours, ne bougez pas.';
    final status = _source is GnssSourceStatus
        ? _source as GnssSourceStatus
        : null;
    if (status?.bluetoothDisabled ?? false) {
      return status?.error ?? 'Bluetooth desactive.';
    }
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
        _session = _session!.copyWith(points: _points);
        _subscription = _source.positions.listen(_onPosition);
        await _source.start();
        try {
          _pendingSyncCount = await queue?.pendingCount() ?? 0;
        } catch (_) {
          _pendingSyncCount = 0;
        }
      }
    } catch (_) {
      _error = 'Impossible de charger la mission locale.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Relit l'etat Bluetooth du recepteur, par exemple au retour au premier
  /// plan apres un passage dans les reglages Android.
  Future<void> refreshBluetoothState() async {
    final status = _source is GnssSourceStatus
        ? _source as GnssSourceStatus
        : null;
    if (status == null) return;
    final wasDisabled = status.bluetoothDisabled;
    final enabled = await status.refreshBluetoothState();
    if (enabled && wasDisabled) {
      try {
        await _source.start();
      } catch (_) {
        _error = 'Impossible de demarrer la source GNSS.';
      }
    }
    notifyListeners();
  }

  /// Bascule vers une autre source GNSS sans quitter l'ecran de mesure
  /// (EF-105). La position courante et la moyenne en cours sont remises a zero.
  Future<void> switchSource(GnssPositionSource next) async {
    if (identical(next, _source)) return;
    final previous = _source;
    await _subscription?.cancel();
    _subscription = null;
    await previous.stop();
    _source = next;
    _position = null;
    _epochs.clear();
    _isAveraging = false;
    _error = null;
    _subscription = next.positions.listen(_onPosition);
    try {
      await next.start();
    } catch (_) {
      _error = 'Impossible de demarrer la source GNSS.';
    }
    notifyListeners();
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
      _session = _session?.copyWith(points: _points);
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
      _session = _session!.copyWith(
        points: _points,
        status: SurveySessionStatus.inProgress,
      );
      _error = null;
      _events.add(PointRecorded(point));
    } catch (_) {
      _error = "La borne n'a pas pu etre enregistree.";
      _events.add(const SurveyError("La borne n'a pas pu etre enregistree."));
    }
    notifyListeners();
  }

  /// Termine la mission, calcule perimetre et surface, puis l'enregistre
  /// localement avant de la mettre en file d'envoi (EF-107, RG-08).
  Future<bool> finishMission() async {
    final current = _session;
    if (current == null) {
      _fail('Mission introuvable sur l\'appareil.');
      return false;
    }
    final withPoints = current.copyWith(points: _points);
    if (!withPoints.canComplete) {
      _fail(
        'Il faut au moins trois bornes RTK Fixed pour terminer la mission.',
      );
      return false;
    }

    _isFinishing = true;
    _error = null;
    notifyListeners();
    try {
      final completed = withPoints.completeWithMeasurements(
        completedAt: _clock().toUtc(),
      );
      await store.saveSession(completed);
      _session = completed;
      await queue?.enqueue(completed);
      _pendingSyncCount = await queue?.pendingCount() ?? 0;
      _events.add(MissionCompleted(completed));
      notifyListeners();
      if (canSyncNow) await syncNow();
      return true;
    } catch (_) {
      _fail('La mission n\'a pas pu etre terminee.');
      return false;
    } finally {
      _isFinishing = false;
      notifyListeners();
    }
  }

  /// Rejoue la file d'envoi des missions terminees.
  Future<void> syncNow() async {
    final queueStore = queue;
    final transport = _syncTransport;
    if (queueStore == null || transport == null) {
      _syncError = 'Adresse du serveur non configuree.';
      _events.add(SyncUnavailable(_syncError!));
      notifyListeners();
      return;
    }
    if (_isSyncing) return;

    _isSyncing = true;
    _syncError = null;
    notifyListeners();
    try {
      final processor = SyncQueueProcessor(
        sessions: store,
        queue: queueStore,
        transport: transport,
      );
      final result = await processor.flush();
      _pendingSyncCount = result.remaining;
      _syncError = result.hasFailures
          ? 'Certaines missions n\'ont pas pu etre envoyees.'
          : null;
      final refreshed = await store.loadSession(sessionId);
      if (refreshed != null) _session = refreshed;
      _events.add(SyncFinished(result));
    } catch (_) {
      _syncError = 'La synchronisation a echoue.';
      _events.add(SurveyError(_syncError!));
    } finally {
      _isSyncing = false;
      notifyListeners();
    }
  }

  void _fail(String message) {
    _error = message;
    _events.add(SurveyError(message));
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
    unawaited(_source.stop());
    unawaited(_events.close());
    super.dispose();
  }
}
