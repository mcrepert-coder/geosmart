import 'property_summary.dart';

class PropertyPage {
  const PropertyPage({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.total,
  });

  final List<PropertySummary> items;
  final int page;
  final int pageSize;
  final int total;

  factory PropertyPage.fromJson(Map<String, dynamic> json) {
    final items = json['items'];
    if (items is! List) {
      throw const FormatException('The properties response has no items list.');
    }
    return PropertyPage(
      items: items
          .map(
            (item) => PropertySummary.fromJson(
              Map<String, dynamic>.from(item as Map),
            ),
          )
          .toList(growable: false),
      page: _intFromJson(json['page']),
      pageSize: _intFromJson(json['pageSize']),
      total: _intFromJson(json['total']),
    );
  }
}

int _intFromJson(Object? value) =>
    value is num ? value.toInt() : int.tryParse(value?.toString() ?? '') ?? 0;
