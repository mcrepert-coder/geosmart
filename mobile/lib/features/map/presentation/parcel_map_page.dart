import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../domain/map_parcel.dart';
import 'parcel_map_style.dart';
import 'viewmodels/parcel_map_controller.dart';

/// Carte des parcelles coloree par statut juridique, avec filtres (EF-406).
///
/// Les parcelles viennent de GET /parcels?bbox=... (contracts/land.yaml) et
/// sont rechargees quand la carte s'arrete de bouger hors de la zone deja
/// chargee. Une parcelle non certifiee a un contour en tirets.
class ParcelMapPage extends StatefulWidget {
  const ParcelMapPage({
    super.key,
    required this.controller,
    this.initialCenter = const LatLng(6.1375, 1.2123), // Lome
    this.initialZoom = 15,
    this.tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    this.onOpenParcel,
    this.onVerify,
  });

  final ParcelMapController controller;
  final LatLng initialCenter;
  final double initialZoom;

  /// Fond de carte ; null pour ne pas charger de tuiles (tests).
  final String? tileUrl;

  /// Ouvre la fiche de la parcelle choisie (module foncier).
  final void Function(MapParcel parcel)? onOpenParcel;

  /// Ouvre la verification d'une parcelle par son identifiant (EF-206).
  final VoidCallback? onVerify;

  @override
  State<ParcelMapPage> createState() => _ParcelMapPageState();
}

class _ParcelMapPageState extends State<ParcelMapPage> {
  final MapController _map = MapController();
  Timer? _debounce;

  ParcelMapController get _controller => widget.controller;

  @override
  void dispose() {
    _debounce?.cancel();
    _map.dispose();
    super.dispose();
  }

  MapBounds _visibleBounds(MapCamera camera) {
    final b = camera.visibleBounds;
    return MapBounds(
      minLon: b.west,
      minLat: b.south,
      maxLon: b.east,
      maxLat: b.north,
    );
  }

  void _scheduleLoad(MapCamera camera) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      unawaited(_controller.onViewChanged(_visibleBounds(camera)));
    });
  }

  void _onTap(LatLng point) {
    final tapped = GeoPoint(point.latitude, point.longitude);
    final hits = _controller.visibleParcels.where((p) => p.contains(tapped));
    _controller.select(hits.isEmpty ? null : hits.last);
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Carte des parcelles'),
        actions: [
          if (widget.onVerify != null)
            IconButton(
              tooltip: 'Verifier une parcelle',
              icon: const Icon(Icons.fact_check_outlined),
              onPressed: widget.onVerify,
            ),
        ],
      ),
      body: ListenableBuilder(
        listenable: _controller,
        builder: (context, _) {
          final parcels = _controller.visibleParcels;
          return Stack(
            children: [
              FlutterMap(
                mapController: _map,
                options: MapOptions(
                  initialCenter: widget.initialCenter,
                  initialZoom: widget.initialZoom,
                  minZoom: 5,
                  maxZoom: 19,
                  onMapReady: () => unawaited(
                    _controller.onViewChanged(_visibleBounds(_map.camera)),
                  ),
                  onPositionChanged: (camera, _) => _scheduleLoad(camera),
                  onTap: (_, point) => _onTap(point),
                ),
                children: [
                  if (widget.tileUrl != null)
                    TileLayer(
                      urlTemplate: widget.tileUrl,
                      userAgentPackageName: 'com.geosmart.geosmart_mobile',
                    ),
                  PolygonLayer(
                    polygons: [
                      for (final parcel in parcels)
                        Polygon(
                          points: [
                            for (final p in parcel.outline)
                              LatLng(p.latitude, p.longitude),
                          ],
                          color: parcelFillColor(parcel, dark: dark),
                          borderColor: parcelStatusColor(
                            parcel.legalStatus,
                            dark: dark,
                          ),
                          borderStrokeWidth:
                              parcel.id == _controller.selected?.id ? 4 : 2,
                          pattern: parcel.certified
                              ? const StrokePattern.solid()
                              : StrokePattern.dashed(segments: const [8, 6]),
                        ),
                    ],
                  ),
                  if (widget.tileUrl != null)
                    // Couleur passee explicitement : flutter_map lit sinon
                    // l'ancien theme de package:flutter/material.dart, que
                    // l'application ne fournit plus depuis material_ui.
                    SimpleAttributionWidget(
                      source: const Text('OpenStreetMap contributors'),
                      backgroundColor: Theme.of(context).colorScheme.surface,
                    ),
                ],
              ),
              Positioned(
                top: 8,
                left: 8,
                right: 8,
                child: _FilterBar(controller: _controller, dark: dark),
              ),
              if (_controller.loading)
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(),
                ),
              if (_controller.error != null)
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: _ErrorBanner(
                    message: _controller.error!,
                    onRetry: () =>
                        _controller.retry(_visibleBounds(_map.camera)),
                  ),
                )
              else if (_controller.selected != null)
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: _ParcelCard(
                    parcel: _controller.selected!,
                    dark: dark,
                    onClose: () => _controller.select(null),
                    onOpen: widget.onOpenParcel == null
                        ? null
                        : () => widget.onOpenParcel!(_controller.selected!),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Legende et filtres : un bouton par statut, plus « Certifiees ».
class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.controller, required this.dark});

  final ParcelMapController controller;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final filter = controller.filter;
    return Material(
      elevation: 2,
      borderRadius: BorderRadius.circular(12),
      color: Theme.of(context).colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final status in MapLegalStatus.values)
              FilterChip(
                key: ValueKey('filtre-${status.serialized}'),
                avatar: CircleAvatar(
                  backgroundColor: parcelStatusColor(status, dark: dark),
                  radius: 6,
                ),
                label: Text(status.label),
                selected: filter.statuses.contains(status),
                onSelected: (_) => controller.toggleStatus(status),
              ),
            FilterChip(
              key: const ValueKey('filtre-certifiees'),
              label: const Text('Certifiées seulement'),
              selected: filter.certifiedOnly,
              onSelected: controller.setCertifiedOnly,
            ),
          ],
        ),
      ),
    );
  }
}

class _ParcelCard extends StatelessWidget {
  const _ParcelCard({
    required this.parcel,
    required this.dark,
    required this.onClose,
    this.onOpen,
  });

  final MapParcel parcel;
  final bool dark;
  final VoidCallback onClose;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final color = parcelStatusColor(parcel.legalStatus, dark: dark);
    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    parcel.id,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    parcel.legalStatus.label,
                    style: TextStyle(color: color, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${formatArea(parcel.areaM2)} · '
                    '${parcel.certified ? 'Certifiée par un géomètre' : 'Non certifiée'}',
                  ),
                ],
              ),
            ),
            if (onOpen != null)
              TextButton(onPressed: onOpen, child: const Text('Voir la fiche')),
            IconButton(
              tooltip: 'Fermer',
              icon: const Icon(Icons.close),
              onPressed: onClose,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
      child: Row(
        children: [
          Expanded(child: Text(message)),
          TextButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    ),
  );
}

/// Affichee quand l'application n'a pas de client API (mode sans compte).
class ParcelMapUnavailablePage extends StatelessWidget {
  const ParcelMapUnavailablePage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Carte des parcelles')),
    body: const Center(
      child: Text('La carte demande une connexion au serveur.'),
    ),
  );
}
