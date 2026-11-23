/// Port d'envoi d'une mission vers `POST /sync`.
abstract interface class SyncTransport {
  Future<void> send(Map<String, dynamic> payload);
}
