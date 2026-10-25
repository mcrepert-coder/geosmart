import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class NtripDataSource {
  NtripDataSource(this._client);

  final http.Client _client;

  Future<Stream<List<int>>> connect({
    required Uri casterUri,
    required String mountpoint,
    required String username,
    required String password,
  }) async {
    final request =
        http.Request(
            'GET',
            casterUri.resolve('/${mountpoint.replaceFirst(RegExp(r'^/'), '')}'),
          )
          ..headers['Authorization'] =
              'Basic ${base64Encode(utf8.encode('$username:$password'))}'
          ..headers['Accept'] = '*/*'
          ..headers['User-Agent'] = 'GeoSmart/1.0 NTRIP client'
          ..headers['Ntrip-Version'] = 'Ntrip/2.0';

    final response = await _client.send(request);
    if (response.statusCode != HttpStatus.ok) {
      await response.stream.drain<void>();
      throw HttpException(
        'NTRIP caster returned HTTP ${response.statusCode}',
        uri: casterUri,
      );
    }

    return response.stream;
  }
}
