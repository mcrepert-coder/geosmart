import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../../domain/entities/ntrip_caster.dart';

/// Ouvre le flux RTCM d'un caster NTRIP.
///
/// Le port isole Dio pour que la reconnexion et l'injection RTCM se testent
/// sans reseau.
abstract interface class NtripClient {
  Future<Stream<List<int>>> open(NtripCaster caster);
}

/// Client NTRIP base sur Dio, avec Basic Auth et TLS optionnel.
class DioNtripClient implements NtripClient {
  DioNtripClient({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;

  @override
  Future<Stream<List<int>>> open(NtripCaster caster) async {
    final response = await _dio.getUri(
      caster.uri,
      options: Options(
        responseType: ResponseType.stream,
        followRedirects: true,
        headers: {
          if (caster.username.isNotEmpty)
            'Authorization':
                'Basic ${base64Encode('${caster.username}:${caster.password}'.codeUnits)}',
          'User-Agent': 'GeosmartNtripClient/1.0',
          'Accept': '*/*',
          'Connection': 'keep-alive',
        },
      ),
    );
    if (response.statusCode != 200) {
      throw NtripException('Le caster NTRIP a repondu ${response.statusCode}.');
    }
    final data = response.data;
    if (data is! ResponseBody) {
      throw const NtripException('Flux RTCM illisible.');
    }
    return data.stream.map((chunk) => chunk);
  }
}

class NtripException implements Exception {
  const NtripException(this.message);

  final String message;

  @override
  String toString() => message;
}
