import 'package:dio/dio.dart';

import '../../domain/repositories/sync_transport.dart';

/// Envoie une mission a `POST /sync`.
///
/// L'adresse vient de `--dart-define=GEOSMART_API_BASE_URL`. Sans adresse,
/// [fromEnvironment] renvoie `null` : la mission reste dans la file locale.
class DioSyncTransport implements SyncTransport {
  DioSyncTransport({required this.baseUrl, Dio? dio}) : _dio = dio ?? Dio();

  final String baseUrl;
  final Dio _dio;

  static DioSyncTransport? fromEnvironment() {
    const baseUrl = String.fromEnvironment('GEOSMART_API_BASE_URL');
    final normalized = baseUrl.trim().replaceFirst(RegExp(r'/$'), '');
    if (normalized.isEmpty) return null;
    return DioSyncTransport(baseUrl: normalized);
  }

  @override
  Future<void> send(Map<String, dynamic> payload) async {
    await _dio.post<Object?>('$baseUrl/sync', data: payload);
  }
}
