import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/app/format/geosmart_formats.dart';

void main() {
  group('formatDecimal', () {
    test('groupe les milliers et utilise la virgule decimale', () {
      expect(formatDecimal(1234567.891, decimals: 2), '1 234 567,89');
    });

    test('affiche les petits nombres sans groupe', () {
      expect(formatDecimal(42.5, decimals: 1), '42,5');
    });

    test('gere les nombres negatifs', () {
      expect(formatDecimal(-1234.5, decimals: 2), '-1 234,50');
    });
  });

  group('formatUtm', () {
    test('affiche une coordonnee UTM avec deux decimales', () {
      expect(formatUtm(303336.1606), '303 336,16');
      expect(formatUtm(500000), '500 000,00');
    });
  });

  group('formatLatitude et formatLongitude', () {
    test('ajoute le bon cardinal', () {
      expect(formatLatitude(6.13192), '6.13192° N');
      expect(formatLatitude(-6.1), '6.10000° S');
      expect(formatLongitude(1.22281), '1.22281° E');
      expect(formatLongitude(-1.2), '1.20000° O');
    });
  });

  group('formatDop et formatSigma', () {
    test('affiche une dilution avec une decimale', () {
      expect(formatDop(1.44), '1,4');
      expect(formatDop(null), 'n.d.');
    });

    test('affiche une precision en metres avec trois decimales', () {
      expect(formatSigma(0.012), '0,012 m');
      expect(formatSigma(null), 'n.d.');
    });
  });

  group('dates', () {
    test('utilise le format local', () {
      final value = DateTime(2026, 10, 30, 9, 42);
      expect(formatDate(value), '30/10/2026');
      expect(formatTime(value), '09:42');
      expect(formatDateTime(value), '30/10/2026 à 09:42');
    });
  });
}
