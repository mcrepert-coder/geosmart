import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/main.dart';

void main() {
  test('la simulation n est pas activee par defaut', () {
    expect(useSimulatedGnss, isFalse);
  });
}
