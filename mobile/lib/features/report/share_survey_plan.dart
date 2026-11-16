import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';

import '../gnss/domain/entities/survey_session.dart';
import 'data/pdf_report_repository.dart';
import 'domain/repositories/report_repository.dart';

/// Envoie un fichier PDF au partage du systeme (WhatsApp, e-mail,
/// enregistrement dans les fichiers...).
typedef PdfSharer = Future<void> Function(List<int> bytes, String fileName);

Future<void> shareWithSystem(List<int> bytes, String fileName) async {
  await SharePlus.instance.share(
    ShareParams(
      files: [
        XFile.fromData(
          Uint8List.fromList(bytes),
          mimeType: 'application/pdf',
          name: fileName,
        ),
      ],
      fileNameOverrides: [fileName],
      subject: 'Plan du leve',
    ),
  );
}

/// Genere le plan PDF d'une mission (EF-108) et le partage.
class SurveyPlanSharer {
  SurveyPlanSharer({ReportRepository? reports, PdfSharer? share})
    : _reports = reports ?? const PdfReportRepository(),
      _share = share ?? shareWithSystem;

  final ReportRepository _reports;
  final PdfSharer _share;

  /// Nom de fichier lisible et sans caracteres speciaux.
  static String fileNameFor(SurveySession mission) {
    final base = mission.title
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    return 'plan-${base.isEmpty ? 'leve' : base}.pdf';
  }

  /// [mission] doit etre chargee avec ses bornes (au moins trois).
  Future<void> share(SurveySession mission) async {
    final bytes = await _reports.createSurveyPlan(mission);
    await _share(bytes, fileNameFor(mission));
  }
}
