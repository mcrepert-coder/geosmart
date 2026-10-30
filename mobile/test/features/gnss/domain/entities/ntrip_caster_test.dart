import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/gnss/domain/entities/ntrip_caster.dart';

void main() {
  test('NtripCaster uri includes mountpoint and credentials (TLS)', () {
    final caster = NtripCaster(
      host: 'example.com',
      port: 2101,
      mountpoint: 'MOUNT',
      username: 'user',
      password: 'pass',
      useTls: true,
    );
    final uri = caster.uri;
    expect(uri.scheme, 'https');
    expect(uri.host, 'example.com');
    expect(uri.port, 2101);
    expect(uri.path, '/MOUNT');
    expect(uri.userInfo, 'user:pass');
  });

  test('NtripCaster uri without credentials (no TLS)', () {
    final caster = NtripCaster(
      host: 'example.com',
      port: 2101,
      mountpoint: 'MOUNT',
      username: '',
      password: '',
    );
    final uri = caster.uri;
    expect(uri.scheme, 'http');
    expect(uri.userInfo, ':'); // empty username/password yields ':'
  });
}
