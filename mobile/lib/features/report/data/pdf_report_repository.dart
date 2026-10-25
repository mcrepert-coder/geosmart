import 'package:pdf/widgets.dart' as pw;

import '../domain/repositories/report_repository.dart';

class PdfReportRepository implements ReportRepository {
  @override
  Future<List<int>> createPdf({
    required String title,
    required String qrPayload,
  }) async {
    final document = pw.Document();
    document.addPage(
      pw.Page(
        build: (context) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(title, style: pw.Theme.of(context).header2),
            pw.SizedBox(height: 24),
            pw.BarcodeWidget(
              barcode: pw.Barcode.qrCode(),
              data: qrPayload,
              width: 120,
              height: 120,
            ),
          ],
        ),
      ),
    );
    return document.save();
  }
}
