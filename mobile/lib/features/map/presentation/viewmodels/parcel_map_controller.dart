import 'package:flutter/foundation.dart';

import '../../../land/data/land_api.dart';
import '../../domain/map_parcel.dart';

/// Charge les parcelles d'une zone (GET /parcels?bbox=...).
typedef ParcelLoader = Future<List<MapParcel>> Function(MapBounds bounds);

/// Etat de la carte des parcelles (EF-406) : parcelles de la zone chargee,
/// filtres par statut et parcelle selectionnee.
class ParcelMapController extends ChangeNotifier {
  ParcelMapController({required this.loader, this.margin = 0.25});

  /// Chargement des parcelles d'une zone (GET /parcels).
  final ParcelLoader loader;

  /// Marge chargee autour de l'ecran, en part de la zone visible.
  final double margin;

  List<MapParcel> _parcels = const [];
  MapBounds? _loaded;
  MapFilter _filter = const MapFilter();
  MapParcel? _selected;
  bool _loading = false;
  String? _error;
  int _request = 0;

  List<MapParcel> get parcels => _parcels;
  List<MapParcel> get visibleParcels =>
      _parcels.where(_filter.accepts).toList(growable: false);
  MapFilter get filter => _filter;
  MapParcel? get selected => _selected;
  bool get loading => _loading;
  String? get error => _error;

  /// Appele quand la carte s'arrete de bouger. Ne recharge que si la zone
  /// visible sort de la zone deja chargee (ou si [force]).
  Future<void> onViewChanged(MapBounds visible, {bool force = false}) async {
    final loaded = _loaded;
    if (!force && loaded != null && loaded.contains(visible)) return;
    final target = visible.expand(margin);
    final request = ++_request;
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final parcels = await loader(target);
      if (request != _request) return; // une requete plus recente a suivi
      _parcels = parcels;
      _loaded = target;
      if (_selected != null &&
          !parcels.any((parcel) => parcel.id == _selected!.id)) {
        _selected = null;
      }
    } on Object catch (error) {
      if (request != _request) return;
      _error = _messageOf(error);
    } finally {
      if (request == _request) {
        _loading = false;
        notifyListeners();
      }
    }
  }

  /// Relance le chargement de la derniere zone (bouton Reessayer).
  Future<void> retry(MapBounds visible) => onViewChanged(visible, force: true);

  void toggleStatus(MapLegalStatus status) {
    _filter = _filter.toggle(status);
    _dropHiddenSelection();
    notifyListeners();
  }

  void setCertifiedOnly(bool value) {
    _filter = _filter.withCertifiedOnly(value);
    _dropHiddenSelection();
    notifyListeners();
  }

  void select(MapParcel? parcel) {
    _selected = parcel;
    notifyListeners();
  }

  void _dropHiddenSelection() {
    if (_selected != null && !_filter.accepts(_selected!)) _selected = null;
  }

  static String _messageOf(Object error) => error is LandApiException
      ? error.message
      : 'Impossible de charger les parcelles.';
}
