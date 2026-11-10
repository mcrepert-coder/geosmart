import 'package:flutter/material.dart';

import '../data/listings_repository.dart';
import '../domain/property_summary.dart';

class PropertyDetailPage extends StatelessWidget {
  const PropertyDetailPage({
    super.key,
    required this.propertyId,
    required this.repository,
  });

  final String propertyId;
  final ListingsRepository repository;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Détail du bien')),
      body: FutureBuilder<PropertySummary>(
        future: repository.fetchProperty(propertyId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      snapshot.error.toString(),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.arrow_back),
                      label: const Text('Retour au catalogue'),
                    ),
                  ],
                ),
              ),
            );
          }

          final property = snapshot.data;
          if (property == null) {
            return const Center(child: Text('Bien introuvable.'));
          }
          return _PropertyDetails(property: property);
        },
      ),
    );
  }
}

class _PropertyDetails extends StatelessWidget {
  const _PropertyDetails({required this.property});

  final PropertySummary property;

  @override
  Widget build(BuildContext context) {
    final location = property.parcel;
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        if (property.primaryPhotoUrl != null)
          Image.network(
            property.primaryPhotoUrl!,
            height: 240,
            width: double.infinity,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const SizedBox(
              height: 120,
              child: Center(child: Icon(Icons.image_not_supported_outlined)),
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                property.title,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                '${_typeLabel(property.type)} · ${_transactionLabel(property.transaction)}',
              ),
              if (property.zone?.isNotEmpty == true) Text(property.zone!),
              const SizedBox(height: 12),
              Text(
                '${_formatPrice(property.price)} ${property.currency}'
                '${property.pricePeriod == null ? '' : ' / ${_periodLabel(property.pricePeriod!)}'}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (property.description.trim().isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(
                  'Description',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(property.description),
              ],
              const SizedBox(height: 20),
              Text(
                'Informations foncières',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text('Parcelle : ${property.parcelId}'),
              Text(
                'Statut juridique : ${_legalStatusLabel(location.legalStatus)}',
              ),
              if (location.areaM2 != null)
                Text('Surface : ${_formatArea(location.areaM2!)} m²'),
              Text(
                location.certified
                    ? 'Parcelle certifiée'
                    : 'Parcelle non certifiée',
              ),
              if (property.agentCertified) const Text('Agent certifié'),
              if (location.latitude != null && location.longitude != null) ...[
                const SizedBox(height: 12),
                const Text(
                  'Localisation approximative (ne constitue pas une limite foncière)',
                ),
                Text(
                  '${location.latitude!.toStringAsFixed(2)}, '
                  '${location.longitude!.toStringAsFixed(2)}',
                ),
              ],
              const SizedBox(height: 16),
              const Text('Ces informations ne valent pas titre foncier.'),
            ],
          ),
        ),
      ],
    );
  }
}

String _typeLabel(String type) => switch (type) {
  'TERRAIN' => 'Terrain',
  'MAISON' => 'Maison',
  _ => type,
};

String _transactionLabel(String transaction) => switch (transaction) {
  'VENTE' => 'À vendre',
  'LOCATION' => 'À louer',
  _ => transaction,
};

String _periodLabel(String period) => switch (period) {
  'MOIS' => 'mois',
  'AN' => 'an',
  _ => period,
};

String _legalStatusLabel(String status) => switch (status) {
  'TITRE' => 'Titre',
  'COUTUMIER_NON_TITRE' => 'Coutumier sans titre',
  'EN_LITIGE' => 'En litige',
  'INCONNU' => 'Inconnu',
  _ => status,
};

String _formatPrice(num price) => price
    .toStringAsFixed(0)
    .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (match) => ' ');

String _formatArea(num area) =>
    area.toStringAsFixed(area == area.roundToDouble() ? 0 : 1);
