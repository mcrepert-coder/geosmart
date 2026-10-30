import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/data/datasources/ntrip_client.dart';
import 'package:geosmart_mobile/features/gnss/data/datasources/ntrip_data_source.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/ntrip_caster.dart';
import 'package:geosmart_mobile/features/gnss/domain/repositories/rtcm_sink.dart';

class FakeNtripClient implements NtripClient {
  FakeNtripClient({this.stream, this.failure});

  Stream<List<int>>? stream;
  Object? failure;
  int calls = 0;

  @override
  Future<Stream<List<int>>> open(NtripCaster caster) async {
    calls++;
    final error = failure;
    if (error != null) throw error;
    return stream!;
  }
}

class RecordingRtcmSink implements RtcmSink {
  final List<Uint8List> blocks = [];

  @override
  Future<bool> sendRtcm(Uint8List bytes) async {
    blocks.add(bytes);
    return true;
  }
}

void main() {
  const caster = NtripCaster(
    host: 'caster.example',
    port: 2101,
    mountpoint: 'RTK31N',
    username: 'operateur',
    password: 'secret',
  );

  group('NtripDataSource', () {
    test('injecte les blocs RTCM dans le recepteur', () async {
      final chunks = StreamController<List<int>>();
      final client = FakeNtripClient(stream: chunks.stream);
      final sink = RecordingRtcmSink();
      final statuses = <bool>[];
      final source = NtripDataSource(
        caster: caster,
        sink: sink,
        client: client,
        onStatus: (streaming, _) => statuses.add(streaming),
      );

      expect(await source.start(), isTrue);
      expect(source.isStreaming, isTrue);
      expect(statuses, [true]);

      chunks.add([1, 2, 3]);
      chunks.add([4, 5]);
      await pumpEventQueue();

      expect(sink.blocks, hasLength(2));
      expect(sink.blocks.first, [1, 2, 3]);
      expect(sink.blocks.last, [4, 5]);

      await source.stop();
      expect(source.isStreaming, isFalse);
      await chunks.close();
    });

    test('signale un refus du caster et retente la connexion', () async {
      final client = FakeNtripClient(
        failure: const NtripException('Le caster a refuse la connexion.'),
      );
      final errors = <String?>[];
      final source = NtripDataSource(
        caster: caster,
        sink: RecordingRtcmSink(),
        client: client,
        retryDelay: const Duration(milliseconds: 20),
        onStatus: (_, error) => errors.add(error),
      );

      expect(await source.start(), isFalse);
      expect(source.isStreaming, isFalse);
      expect(errors.single, 'Le caster a refuse la connexion.');

      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect(client.calls, greaterThanOrEqualTo(2));

      await source.stop();
    });

    test('reconnecte apres la fermeture du flux', () async {
      final chunks = StreamController<List<int>>();
      final client = FakeNtripClient(stream: chunks.stream);
      final source = NtripDataSource(
        caster: caster,
        sink: RecordingRtcmSink(),
        client: client,
        retryDelay: const Duration(milliseconds: 20),
      );

      await source.start();
      await chunks.close();
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(client.calls, greaterThanOrEqualTo(2));

      await source.stop();
    });

    test('stop interrompt la reconnexion et le flux', () async {
      final chunks = StreamController<List<int>>();
      final client = FakeNtripClient(stream: chunks.stream);
      final sink = RecordingRtcmSink();
      final source = NtripDataSource(
        caster: caster,
        sink: sink,
        client: client,
        retryDelay: const Duration(milliseconds: 20),
      );

      await source.start();
      await source.stop();
      chunks.add([9, 9]);
      await pumpEventQueue();

      expect(sink.blocks, isEmpty);
      expect(source.isActive, isFalse);
      await chunks.close();
    });
  });
}
