import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/presentation/viewmodels/theme_controller.dart';

void main() {
  group('ThemeController', () {
    test('demarre en theme clair', () {
      final controller = ThemeController();
      addTearDown(controller.dispose);

      expect(controller.mode, ThemeMode.light);
      expect(controller.isDark, isFalse);
    });

    test('bascule entre clair et sombre', () {
      final controller = ThemeController();
      addTearDown(controller.dispose);
      var notifications = 0;
      controller.addListener(() => notifications++);

      controller.selectDark();
      expect(controller.mode, ThemeMode.dark);
      expect(controller.isDark, isTrue);

      controller.selectDark();
      expect(notifications, 1);

      controller.toggle();
      expect(controller.mode, ThemeMode.light);
      expect(notifications, 2);
    });
  });
}
