class GnssPosition {
  const GnssPosition({
    required this.latitude,
    required this.longitude,
    required this.recordedAt,
    this.altitude,
    this.accuracy,
  });

  final double latitude;
  final double longitude;
  final DateTime recordedAt;
  final double? altitude;
  final double? accuracy;
}