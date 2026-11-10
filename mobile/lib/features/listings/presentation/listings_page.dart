import 'package:flutter/material.dart';

import '../data/listings_repository.dart';
import '../domain/property_page.dart';
import '../domain/property_summary.dart';
import 'property_detail_page.dart';

class ListingsPage extends StatefulWidget {
  const ListingsPage({super.key, this.repository});

  final ListingsRepository? repository;

  @override
  State<ListingsPage> createState() => _ListingsPageState();
}

class _ListingsPageState extends State<ListingsPage> {
  late final ListingsRepository _repository;
  late final bool _ownsRepository;
  final _zoneController = TextEditingController();
  final _minPriceController = TextEditingController();
  final _maxPriceController = TextEditingController();
  String? _type;
  String? _transaction;
  String? _legalStatus;
  String _sort = 'recent';
  bool? _parcelCertified;
  bool? _agentCertified;
  String? _priceError;
  int _page = 1;
  Future<PropertyPage>? _request;

  @override
  void initState() {
    super.initState();
    _ownsRepository = widget.repository == null;
    _repository = widget.repository ?? ListingsRepository();
    _load();
  }

  @override
  void dispose() {
    _zoneController.dispose();
    _minPriceController.dispose();
    _maxPriceController.dispose();
    if (_ownsRepository) _repository.close();
    super.dispose();
  }

  void _load({bool resetPage = true}) {
    final minText = _minPriceController.text.trim();
    final maxText = _maxPriceController.text.trim();
    final minPrice = minText.isEmpty ? null : int.tryParse(minText);
    final maxPrice = maxText.isEmpty ? null : int.tryParse(maxText);
    var priceError = '';
    if ((minText.isNotEmpty && minPrice == null) ||
        (maxText.isNotEmpty && maxPrice == null)) {
      priceError = 'Saisissez un prix entier valide.';
    } else if ((minPrice != null && minPrice < 0) ||
        (maxPrice != null && maxPrice < 0)) {
      priceError = 'Le prix doit être positif ou nul.';
    } else if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
      priceError = 'Le prix minimum doit être inférieur au prix maximum.';
    }

    if (priceError.isNotEmpty) {
      setState(() => _priceError = priceError);
      return;
    }
    if (resetPage) _page = 1;
    setState(() {
      _priceError = null;
      _request = _repository.fetchProperties(
        type: _type,
        transaction: _transaction,
        priceMin: minPrice,
        priceMax: maxPrice,
        legalStatus: _legalStatus,
        parcelCertified: _parcelCertified,
        agentCertified: _agentCertified,
        zone: _zoneController.text,
        page: _page,
        sort: _sort,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Catalogue immobilier')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
              controller: _zoneController,
              decoration: const InputDecoration(
                labelText: 'Rechercher par zone',
                prefixIcon: Icon(Icons.search),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _load(),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _choice<String>(
                  label: 'Type',
                  value: _type,
                  values: const ['TERRAIN', 'MAISON'],
                  names: const ['Tous les types', 'Terrain', 'Maison'],
                  onChanged: (value) => setState(() => _type = value),
                ),
                _choice<String>(
                  label: 'Transaction',
                  value: _transaction,
                  values: const ['VENTE', 'LOCATION'],
                  names: const ['Toutes transactions', 'Vente', 'Location'],
                  onChanged: (value) => setState(() => _transaction = value),
                ),
                _choice<String>(
                  label: 'Statut légal',
                  value: _legalStatus,
                  values: const [
                    'TITRE',
                    'COUTUMIER_NON_TITRE',
                    'EN_LITIGE',
                    'INCONNU',
                  ],
                  names: const [
                    'Tous les statuts',
                    'Titre',
                    'Coutumier sans titre',
                    'En litige',
                    'Inconnu',
                  ],
                  onChanged: (value) => setState(() => _legalStatus = value),
                ),
                _choice<bool>(
                  label: 'Parcelle certifiée',
                  value: _parcelCertified,
                  values: const [true, false],
                  names: const ['Tous', 'Oui', 'Non'],
                  onChanged: (value) =>
                      setState(() => _parcelCertified = value),
                ),
                _choice<bool>(
                  label: 'Agent certifié',
                  value: _agentCertified,
                  values: const [true, false],
                  names: const ['Tous', 'Oui', 'Non'],
                  onChanged: (value) => setState(() => _agentCertified = value),
                ),
              ],
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _sort,
              decoration: const InputDecoration(labelText: 'Trier par'),
              items: const [
                DropdownMenuItem(value: 'recent', child: Text('Plus récents')),
                DropdownMenuItem(
                  value: 'price_asc',
                  child: Text('Prix croissant'),
                ),
                DropdownMenuItem(
                  value: 'price_desc',
                  child: Text('Prix décroissant'),
                ),
              ],
              onChanged: (value) {
                if (value == null) return;
                setState(() => _sort = value);
                _load();
              },
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _minPriceController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Prix min.'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _maxPriceController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Prix max.'),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(onPressed: _load, child: const Text('Filtrer')),
              ],
            ),
            const SizedBox(height: 16),
            if (_priceError != null)
              Text(
                _priceError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              )
            else
              FutureBuilder<PropertyPage>(
                future: _request,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: CircularProgressIndicator(),
                      ),
                    );
                  }
                  if (snapshot.hasError) {
                    return _LoadError(
                      message: snapshot.error.toString(),
                      onRetry: _load,
                    );
                  }
                  final result = snapshot.data;
                  if (result == null || result.items.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: Text('Aucun bien ne correspond.')),
                    );
                  }
                  final pageCount = result.pageSize > 0
                      ? (result.total / result.pageSize).ceil()
                      : 1;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('${result.total} bien(s)'),
                      const SizedBox(height: 8),
                      ...result.items.map(
                        (property) => _PropertyCard(
                          property,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => PropertyDetailPage(
                                propertyId: property.id,
                                repository: _repository,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          OutlinedButton(
                            onPressed: result.page > 1
                                ? () {
                                    _page = result.page - 1;
                                    _load(resetPage: false);
                                  }
                                : null,
                            child: const Text('Précédent'),
                          ),
                          Text('Page ${result.page} sur $pageCount'),
                          OutlinedButton(
                            onPressed:
                                result.page * result.pageSize < result.total
                                ? () {
                                    _page = result.page + 1;
                                    _load(resetPage: false);
                                  }
                                : null,
                            child: const Text('Suivant'),
                          ),
                        ],
                      ),
                    ],
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _choice<T>({
    required String label,
    required T? value,
    required List<T> values,
    required List<String> names,
    required ValueChanged<T?> onChanged,
  }) {
    return DropdownButton<T?>(
      value: value,
      hint: Text(label),
      underline: const SizedBox.shrink(),
      items: [
        DropdownMenuItem<T?>(value: null, child: Text(names.first)),
        for (var index = 0; index < values.length; index++)
          DropdownMenuItem<T?>(
            value: values[index],
            child: Text(names[index + 1]),
          ),
      ],
      onChanged: onChanged,
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text(message, textAlign: TextAlign.center),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Réessayer'),
      ),
    ],
  );
}

class _PropertyCard extends StatelessWidget {
  const _PropertyCard(this.property, {required this.onTap});

  final PropertySummary property;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final labels = <String>[
      if (property.parcelCertified) 'Parcelle certifiée',
      if (property.agentCertified) 'Agent certifié',
    ];
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (property.primaryPhotoUrl != null)
              Image.network(
                property.primaryPhotoUrl!,
                height: 170,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const SizedBox(
                  height: 40,
                  child: Center(
                    child: Icon(Icons.image_not_supported_outlined),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    property.title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    [
                      if (property.zone?.isNotEmpty == true) property.zone!,
                      _typeLabel(property.type),
                      _transactionLabel(property.transaction),
                    ].join(' · '),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${property.price} ${property.currency}'
                    '${property.pricePeriod == null ? '' : ' / ${property.pricePeriod}'}',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  if (property.parcel.areaM2 != null)
                    Text('${property.parcel.areaM2} m²'),
                  if (labels.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      children: labels
                          .map((label) => Chip(label: Text(label)))
                          .toList(),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _typeLabel(String type) => switch (type) {
  'TERRAIN' => 'Terrain',
  'MAISON' => 'Maison',
  _ => type,
};

String _transactionLabel(String transaction) => switch (transaction) {
  'VENTE' => 'Vente',
  'LOCATION' => 'Location',
  _ => transaction,
};
