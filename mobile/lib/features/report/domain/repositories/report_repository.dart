abstract interface class ReportRepository {
  Future<List<int>> createPdf({
    required String title,
    required String qrPayload,
  });
}