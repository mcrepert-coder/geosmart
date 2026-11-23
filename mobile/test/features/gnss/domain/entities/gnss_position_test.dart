import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';

void main() {
  group('GnssPosition', () {
    final now = DateTime.utc(2026, 10, 26, 8, 15);

    test(
      'canRecordPoint et isRtkFixed deleguent a fixQuality.canRecordPoint',
      () {
        final fixedPos = GnssPosition(
          latitude: 6.137,
          longitude: 1.212,
          recordedAt: now,
          fixQuality: GnssFixQuality.fixed,
        );
        expect(fixedPos.canRecordPoint, isTrue);
        expect(fixedPos.isRtkFixed, isTrue);

        final floatPos = GnssPosition(
          latitude: 6.137,
          longitude: 1.212,
          recordedAt: now,
          fixQuality: GnssFixQuality.float,
        );
        expect(floatPos.canRecordPoint, isFalse);
        expect(floatPos.isRtkFixed, isFalse);
      },
    );

    test('toMap et fromMap preservent fixQuality et metadonnees RG-04', () {
      final pos = GnssPosition(
        latitude: 6.137254,
        longitude: 1.212547,
        altitude: 24.35,
        accuracy: 0.012,
        fixQuality: GnssFixQuality.fixed,
        satellitesCount: 18,
        pdop: 1.2,
        hdop: 0.8,
        vdop: 0.9,
        speed: 0.05,
        instrument: 'UM982',
        recordedAt: now,
      );

      final map = pos.toMap();
      expect(map['fix_quality'], 'FIXED');

      final restored = GnssPosition.fromMap(map);
      expect(restored.latitude, pos.latitude);
      expect(restored.longitude, pos.longitude);
      expect(restored.altitude, pos.altitude);
      expect(restored.accuracy, pos.accuracy);
      expect(restored.fixQuality, GnssFixQuality.fixed);
      expect(restored.satellitesCount, 18);
      expect(restored.pdop, 1.2);
      expect(restored.instrument, 'UM982');
      expect(restored.canRecordPoint, isTrue);
    });

    test('copyWith met a jour les champs sans alterer les autres', () {
      final initial = GnssPosition(
        latitude: 6.137,
        longitude: 1.212,
        recordedAt: now,
        fixQuality: GnssFixQuality.float,
      );

      final updated = initial.copyWith(
        fixQuality: GnssFixQuality.fixed,
        satellitesCount: 16,
      );

      expect(updated.latitude, 6.137);
      expect(updated.fixQuality, GnssFixQuality.fixed);
      expect(updated.satellitesCount, 16);
      expect(updated.canRecordPoint, isTrue);
    });
  });
}
