/// Formats d'affichage du design system GeoSmart Field.
///
/// Coordonnees UTM 31N en metres avec deux decimales, identifiants et
/// horodatages en chasse fixe, dates au format local.
library;

/// Groupe les milliers avec une espace et separe les decimales par une virgule.
String formatDecimal(double value, {int decimals = 2}) {
  final fixed = value.toStringAsFixed(decimals);
  final negative = fixed.startsWith('-');
  final parts = (negative ? fixed.substring(1) : fixed).split('.');
  final digits = parts.first;
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(digits[i]);
  }
  final body = decimals > 0 ? '$buffer,${parts.last}' : buffer.toString();
  return negative ? '-$body' : body;
}

/// Coordonnee UTM en metres, par exemple `303 336,16`.
String formatUtm(double meters) => formatDecimal(meters, decimals: 2);

/// Latitude WGS84, par exemple `6.13192° N`.
String formatLatitude(double degrees) {
  final suffix = degrees < 0 ? 'S' : 'N';
  return '${degrees.abs().toStringAsFixed(5)}° $suffix';
}

/// Longitude WGS84, par exemple `1.22281° E`.
String formatLongitude(double degrees) {
  final suffix = degrees < 0 ? 'O' : 'E';
  return '${degrees.abs().toStringAsFixed(5)}° $suffix';
}

/// Dilution de precision, par exemple `1,4`.
String formatDop(double? value) =>
    value == null ? 'n.d.' : formatDecimal(value, decimals: 1);

/// Precision horizontale en metres, trois decimales.
String formatSigma(double? meters) =>
    meters == null ? 'n.d.' : '${formatDecimal(meters, decimals: 3)} m';

/// Altitude en metres, deux decimales.
String formatAltitude(double? meters) =>
    meters == null ? 'n.d.' : '${formatDecimal(meters, decimals: 2)} m';

/// Date locale au format `30/10/2026`.
String formatDate(DateTime value) {
  final local = value.toLocal();
  return '${_two(local.day)}/${_two(local.month)}/${local.year}';
}

/// Heure locale au format `09:42`.
String formatTime(DateTime value) {
  final local = value.toLocal();
  return '${_two(local.hour)}:${_two(local.minute)}';
}

/// Date et heure locales, par exemple `30/10/2026 à 09:42`.
String formatDateTime(DateTime value) =>
    '${formatDate(value)} à ${formatTime(value)}';

String _two(int value) => value.toString().padLeft(2, '0');
