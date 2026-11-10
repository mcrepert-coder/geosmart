class PropertySummary {
  const PropertySummary({
    required this.id,
    required this.parcelId,
    required this.type,
    required this.transaction,
    required this.title,
    required this.description,
    required this.price,
    required this.currency,
    required this.pricePeriod,
    required this.zone,
    required this.parcelCertified,
    required this.agentCertified,
    required this.parcel,
    required this.primaryPhotoUrl,
    required this.publishedAt,
    required this.status,
  });

  final String id;
  final String parcelId;
  final String type;
  final String transaction;
  final String title;
  final String description;
  final num price;
  final String currency;
  final String? pricePeriod;
  final String? zone;
  final bool parcelCertified;
  final bool agentCertified;
  final PropertyParcel parcel;
  final String? primaryPhotoUrl;
  final DateTime? publishedAt;
  final String status;

  factory PropertySummary.fromJson(Map<String, dynamic> json) {
    final badges = _mapFromJson(json['badges']);
    return PropertySummary(
      id: _stringFromJson(json['id']),
      parcelId: _stringFromJson(json['parcelId']),
      type: _stringFromJson(json['type']),
      transaction: _stringFromJson(json['transaction']),
      title: _stringFromJson(json['title']),
      description: _stringFromJson(json['description']),
      price: _numberFromJson(json['price']),
      currency: _stringFromJson(json['currency']),
      pricePeriod: _nullableStringFromJson(json['pricePeriod']),
      zone: _nullableStringFromJson(json['zone']),
      parcelCertified: badges['parcelCertified'] as bool? ?? false,
      agentCertified: badges['agentCertified'] as bool? ?? false,
      parcel: PropertyParcel.fromJson(_mapFromJson(json['parcel'])),
      primaryPhotoUrl: _nullableStringFromJson(json['primaryPhotoUrl']),
      publishedAt: DateTime.tryParse(_stringFromJson(json['publishedAt'])),
      status: _stringFromJson(json['status']),
    );
  }
}

class PropertyParcel {
  const PropertyParcel({
    required this.id,
    required this.legalStatus,
    required this.certified,
    required this.areaM2,
    required this.latitude,
    required this.longitude,
  });

  final String id;
  final String legalStatus;
  final bool certified;
  final num? areaM2;
  final double? latitude;
  final double? longitude;

  factory PropertyParcel.fromJson(Map<String, dynamic> json) {
    final location = _mapFromJson(json['approximateLocation']);
    return PropertyParcel(
      id: _stringFromJson(json['id']),
      legalStatus: _stringFromJson(json['legalStatus']),
      certified: json['certified'] as bool? ?? false,
      areaM2: _nullableNumberFromJson(json['areaM2']),
      latitude: _nullableNumberFromJson(location['latitude'])?.toDouble(),
      longitude: _nullableNumberFromJson(location['longitude'])?.toDouble(),
    );
  }
}

Map<String, dynamic> _mapFromJson(Object? value) =>
    value is Map<String, dynamic> ? value : const {};

String _stringFromJson(Object? value) => value?.toString() ?? '';

String? _nullableStringFromJson(Object? value) => value?.toString();

num _numberFromJson(Object? value) => _nullableNumberFromJson(value) ?? 0;

num? _nullableNumberFromJson(Object? value) {
  if (value is num) return value;
  return num.tryParse(value?.toString() ?? '');
}
