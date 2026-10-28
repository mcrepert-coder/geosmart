import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';

void main() {
  group('GnssFixQuality', () {
    test('fromNmeaCode mappe correctement les codes standards GGA', () {
      expect(GnssFixQuality.fromNmeaCode(4), GnssFixQuality.fixed);
      expect(GnssFixQuality.fromNmeaCode(5), GnssFixQuality.float);
      expect(GnssFixQuality.fromNmeaCode(1), GnssFixQuality.autonomous);
      expect(GnssFixQuality.fromNmeaCode(2), GnssFixQuality.dgps);
      expect(GnssFixQuality.fromNmeaCode(0), GnssFixQuality.invalid);
      expect(GnssFixQuality.fromNmeaCode(null), GnssFixQuality.invalid);
      expect(GnssFixQuality.fromNmeaCode(99), GnssFixQuality.invalid);
    });

    test('fromString deserialise les libelles standards et alias', () {
      expect(GnssFixQuality.fromString('FIXED'), GnssFixQuality.fixed);
      expect(GnssFixQuality.fromString('RTK_FIXED'), GnssFixQuality.fixed);
      expect(GnssFixQuality.fromString('FLOAT'), GnssFixQuality.float);
      expect(GnssFixQuality.fromString('RTK_FLOAT'), GnssFixQuality.float);
      expect(GnssFixQuality.fromString('AUTONOME'), GnssFixQuality.autonomous);
      expect(
        GnssFixQuality.fromString('AUTONOMOUS'),
        GnssFixQuality.autonomous,
      );
      expect(GnssFixQuality.fromString('DGPS'), GnssFixQuality.dgps);
      expect(GnssFixQuality.fromString('INVALIDE'), GnssFixQuality.invalid);

      // Espaces et casse
      expect(GnssFixQuality.fromString('  fixed  '), GnssFixQuality.fixed);
      expect(GnssFixQuality.fromString('float'), GnssFixQuality.float);

      // Valeurs vides ou inconnues
      expect(GnssFixQuality.fromString(''), GnssFixQuality.invalid);
      expect(GnssFixQuality.fromString(null), GnssFixQuality.invalid);
      expect(GnssFixQuality.fromString('INCONNU'), GnssFixQuality.invalid);
    });

    test('serialized et toSerializedString retournent la chaine canonique', () {
      expect(GnssFixQuality.fixed.serialized, 'FIXED');
      expect(GnssFixQuality.fixed.toSerializedString(), 'FIXED');

      expect(GnssFixQuality.float.serialized, 'FLOAT');
      expect(GnssFixQuality.float.toSerializedString(), 'FLOAT');

      expect(GnssFixQuality.autonomous.serialized, 'AUTONOME');
      expect(GnssFixQuality.autonomous.toSerializedString(), 'AUTONOME');

      expect(GnssFixQuality.dgps.serialized, 'DGPS');
      expect(GnssFixQuality.dgps.toSerializedString(), 'DGPS');

      expect(GnssFixQuality.invalid.serialized, 'INVALIDE');
      expect(GnssFixQuality.invalid.toSerializedString(), 'INVALIDE');
    });

    test('canRecordPoint applique strictement RG-01 et RG-03', () {
      expect(GnssFixQuality.fixed.canRecordPoint, isTrue);
      expect(GnssFixQuality.float.canRecordPoint, isFalse);
      expect(GnssFixQuality.autonomous.canRecordPoint, isFalse);
      expect(GnssFixQuality.dgps.canRecordPoint, isFalse);
      expect(GnssFixQuality.invalid.canRecordPoint, isFalse);
    });
  });
}
