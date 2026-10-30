import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/data/datasources/nmea_position_decoder.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_fix_quality.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/gnss_position.dart';

void main() {
  late NmeaPositionDecoder decoder;

  setUp(() {
    decoder = NmeaPositionDecoder(
      clock: () => DateTime.utc(2026, 10, 30, 14, 32),
    );
  });

  const ggaFixed =
      r'$GNGGA,143200.00,0607.9152,N,00113.3686,E,4,18,0.8,24.35,M,0.0,M,1.0,0000*6B';
  const gsa = r'$GNGSA,A,3,01,02,03,04,05,06,07,08,09,10,11,12,1.2,0.8,0.9*2D';
  const rmc =
      r'$GNRMC,143200.00,A,0607.9152,N,00113.3686,E,0.020,180.0,251026,,,D*4E';

  group('NmeaPositionDecoder', () {
    test('decode une trame GGA RTK Fixed', () {
      final position = decoder.feed(ggaFixed);

      expect(position, isNotNull);
      expect(position!.latitude, closeTo(6.13192, 0.0000001));
      expect(position.longitude, closeTo(1.22281, 0.0000001));
      expect(position.altitude, 24.35);
      expect(position.fixQuality, GnssFixQuality.fixed);
      expect(position.satellitesCount, 18);
      expect(position.hdop, 0.8);
      expect(position.instrument, 'UM982');
      expect(position.recordedAt, DateTime.utc(2026, 10, 30, 14, 32));
      expect(position.canRecordPoint, isTrue);
    });

    test('complete PDOP et VDOP avec la trame GSA', () {
      decoder.feed(gsa);
      final position = decoder.feed(ggaFixed);

      expect(position!.pdop, 1.2);
      expect(position.vdop, 0.9);
      expect(position.hdop, 0.8);
    });

    test('reprend la vitesse de la trame RMC', () {
      decoder.feed(rmc);
      final position = decoder.feed(ggaFixed);

      expect(position!.speed, closeTo(0.0102889, 0.0000001));
    });

    test('ignore une trame au controle de somme faux', () {
      final corrupted = '${ggaFixed.substring(0, ggaFixed.length - 2)}7A';

      expect(decoder.feed(corrupted), isNull);
    });

    test('ignore une trame tronquee', () {
      expect(decoder.feed(r'$GNGGA,143200.00,0607.9152*6B'), isNull);
    });

    test('lit un mode RTK Float sans autoriser la borne', () {
      final body =
          'GNGGA,143200.00,0607.9152,N,00113.3686,E,5,15,1.4,24.35,M,0.0,M,1.0,0000';

      final position = decoder.feed(_withChecksum(body));

      expect(position!.fixQuality, GnssFixQuality.float);
      expect(position.canRecordPoint, isFalse);
    });

    test('lit un mode autonome et un fix invalide', () {
      final autonomous = decoder.feed(
        _withChecksum(
          'GNGGA,143200.00,0607.9152,N,00113.3686,E,1,8,1.9,24.35,M,0.0,M,1.0,0000',
        ),
      );
      final invalid = decoder.feed(
        _withChecksum(
          'GNGGA,143200.00,0607.9152,N,00113.3686,E,0,3,9.9,24.35,M,0.0,M,1.0,0000',
        ),
      );

      expect(autonomous!.fixQuality, GnssFixQuality.autonomous);
      expect(autonomous.canRecordPoint, isFalse);
      expect(invalid!.fixQuality, GnssFixQuality.invalid);
      expect(invalid.canRecordPoint, isFalse);
    });

    test('lit les hemispheres sud et ouest', () {
      final position = decoder.feed(
        _withChecksum(
          'GNGGA,120000.00,3348.0000,S,07030.0000,W,4,12,0.9,10.0,M,0.0,M,1.0,0000',
        ),
      );

      expect(position!.latitude, closeTo(-33.8, 0.0000001));
      expect(position.longitude, closeTo(-70.5, 0.0000001));
    });

    test('ignore une coordonnee impossible', () {
      expect(
        decoder.feed(
          _withChecksum(
            'GNGGA,143200.00,9960.0000,N,00113.3686,E,4,18,0.8,24.35,M,0.0,M,1.0,0000',
          ),
        ),
        isNull,
      );
    });

    test('decode le fichier de simulation livre avec l application', () {
      final file = File('android/app/src/main/assets/nmea/simulation.txt');
      expect(file.existsSync(), isTrue, reason: 'Fichier NMEA absent');

      final positions = file
          .readAsLinesSync()
          .map(decoder.feed)
          .whereType<GnssPosition>()
          .toList();

      expect(positions, hasLength(10));
      expect(positions.first.latitude, closeTo(6.13192, 0.0000001));
      expect(positions.last.latitude, greaterThan(positions.first.latitude));
    });
  });
}

String _withChecksum(String body) {
  var checksum = 0;
  for (final unit in body.codeUnits) {
    checksum ^= unit;
  }
  return '\$$body*${checksum.toRadixString(16).toUpperCase().padLeft(2, '0')}';
}
