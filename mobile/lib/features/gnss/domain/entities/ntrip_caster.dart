class NtripCaster {
  const NtripCaster({
    required this.host,
    required this.port,
    required this.mountpoint,
    required this.username,
    required this.password,
    this.useTls = false,
  });

  final String host;
  final int port;
  final String mountpoint;
  final String username;
  final String password;
  final bool useTls;

  /// Returns the full NTRIP URI including mountpoint and basic‑auth credentials.
  Uri get uri => Uri(
    scheme: useTls ? 'https' : 'http',
    host: host,
    port: port,
    path: '/$mountpoint',
    userInfo:
        '${Uri.encodeComponent(username)}:${Uri.encodeComponent(password)}',
  );
}
