import 'dart:math' as math;

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../gnss/domain/entities/survey_point.dart';
import '../../gnss/domain/entities/survey_session.dart';
import '../../gnss/domain/services/survey_measurements.dart';
import '../../gnss/domain/services/utm31n.dart';
import '../domain/repositories/report_repository.dart';

/// Plan PDF du leve (EF-108), genere sur le telephone.
///
/// Les bornes sont stockees en WGS84 ; le dessin, les distances, le
/// perimetre et la surface sont calcules en UTM 31N (EF-107), comme sur le
/// serveur. Le texte reste en ASCII : la police par defaut du PDF ne couvre
/// pas tous les accents.
class PdfReportRepository implements ReportRepository {
  const PdfReportRepository({this.compress = true});

  /// Faux dans les tests, pour lire le texte du PDF.
  final bool compress;

  static const double _drawingWidth = 480;
  static const double _drawingHeight = 300;
  static const double _margin = 24;

  @override
  Future<List<int>> createSurveyPlan(SurveySession session) async {
    final points = [...session.points]
      ..sort((a, b) => a.pointNumber.compareTo(b.pointNumber));
    if (points.length < 3) {
      throw ArgumentError.value(
        points.length,
        'points',
        'Le plan exige au moins trois bornes.',
      );
    }
    final measures = SurveyMeasurements.fromPoints(points);
    final utm = [for (final p in points) toUtm31N(p.latitude, p.longitude)];
    final edges = [
      ...measures.edgeMeters,
      SurveyMeasurements.distanceBetweenSurveyPoints(points.last, points.first),
    ];

    final document = pw.Document(
      compress: compress,
      title: 'Plan du leve - ${session.title}',
    );
    document.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        footer: (context) => pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(
              'Document technique de leve. Ne vaut pas titre foncier.',
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
            ),
            pw.Text(
              'Page ${context.pageNumber} / ${context.pagesCount}',
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
            ),
          ],
        ),
        build: (context) => [
          _header(session, points),
          pw.SizedBox(height: 12),
          _drawing(points, utm, edges),
          pw.SizedBox(height: 12),
          _summary(measures),
          pw.SizedBox(height: 12),
          _pointsTable(points, utm),
          pw.SizedBox(height: 12),
          _edgesTable(points, edges),
        ],
      ),
    );
    return document.save();
  }

  pw.Widget _header(SurveySession session, List<SurveyPoint> points) {
    final instruments = {for (final p in points) p.instrument}.join(', ');
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(
          'Plan du leve',
          style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold),
        ),
        pw.SizedBox(height: 4),
        pw.Text(session.title, style: const pw.TextStyle(fontSize: 13)),
        pw.SizedBox(height: 6),
        _line('Chantier', session.projectId),
        _line('Mission', session.clientId),
        _line('Debut', _date(session.createdAt)),
        if (session.completedAt != null)
          _line('Fin', _date(session.completedAt!)),
        _line('Instrument', instruments),
        _line('Projection', 'UTM zone 31 Nord (EPSG:32631), bornes en WGS84'),
      ],
    );
  }

  pw.Widget _line(String label, String value) => pw.Padding(
    padding: const pw.EdgeInsets.only(bottom: 2),
    child: pw.RichText(
      text: pw.TextSpan(
        children: [
          pw.TextSpan(
            text: '$label : ',
            style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
          ),
          pw.TextSpan(text: value, style: const pw.TextStyle(fontSize: 9)),
        ],
      ),
    ),
  );

  /// Polygone a l'echelle, bornes numerotees, longueur des cotes, nord et
  /// barre d'echelle.
  pw.Widget _drawing(
    List<SurveyPoint> points,
    List<Utm31NCoordinate> utm,
    List<double> edges,
  ) {
    final minE = utm.map((c) => c.easting).reduce(math.min);
    final maxE = utm.map((c) => c.easting).reduce(math.max);
    final minN = utm.map((c) => c.northing).reduce(math.min);
    final maxN = utm.map((c) => c.northing).reduce(math.max);
    final spanE = math.max(maxE - minE, 0.01);
    final spanN = math.max(maxN - minN, 0.01);
    final scale = math.min(
      (_drawingWidth - 2 * _margin) / spanE,
      (_drawingHeight - 2 * _margin) / spanN,
    );
    final offsetX = (_drawingWidth - spanE * scale) / 2;
    final offsetY = (_drawingHeight - spanN * scale) / 2;

    // Repere du PDF : origine en bas a gauche, comme Est / Nord.
    PdfPoint toPdf(Utm31NCoordinate c) => PdfPoint(
      offsetX + (c.easting - minE) * scale,
      offsetY + (c.northing - minN) * scale,
    );
    final pdf = [for (final c in utm) toPdf(c)];
    final scaleMeters = niceScaleLength(_drawingWidth / 4 / scale);

    final labels = <pw.Widget>[];
    for (var i = 0; i < pdf.length; i++) {
      labels.add(
        pw.Positioned(
          left: pdf[i].x + 4,
          top: _drawingHeight - pdf[i].y - 12,
          child: pw.Text(
            points[i].pointName.isEmpty
                ? 'B${points[i].pointNumber}'
                : points[i].pointName,
            style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold),
          ),
        ),
      );
      final next = pdf[(i + 1) % pdf.length];
      labels.add(
        pw.Positioned(
          left: (pdf[i].x + next.x) / 2 + 2,
          top: _drawingHeight - (pdf[i].y + next.y) / 2 - 4,
          child: pw.Text(
            '${edges[i].toStringAsFixed(2)} m',
            style: const pw.TextStyle(fontSize: 7, color: PdfColors.blue800),
          ),
        ),
      );
    }

    return pw.Container(
      width: _drawingWidth,
      height: _drawingHeight,
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: PdfColors.grey500, width: 0.5),
      ),
      child: pw.Stack(
        children: [
          pw.CustomPaint(
            size: const PdfPoint(_drawingWidth, _drawingHeight),
            painter: (canvas, size) {
              canvas
                ..setFillColor(PdfColors.teal50)
                ..moveTo(pdf.first.x, pdf.first.y);
              for (final p in pdf.skip(1)) {
                canvas.lineTo(p.x, p.y);
              }
              canvas
                ..closePath()
                ..fillPath()
                ..setStrokeColor(PdfColors.teal800)
                ..setLineWidth(1.2)
                ..moveTo(pdf.first.x, pdf.first.y);
              for (final p in pdf.skip(1)) {
                canvas.lineTo(p.x, p.y);
              }
              canvas
                ..closePath()
                ..strokePath()
                ..setFillColor(PdfColors.red800);
              for (final p in pdf) {
                canvas
                  ..drawEllipse(p.x, p.y, 2.2, 2.2)
                  ..fillPath();
              }
              // Fleche du nord, en haut a droite.
              final nx = size.x - 20;
              final ny = size.y - 14;
              canvas
                ..setFillColor(PdfColors.black)
                ..moveTo(nx, ny)
                ..lineTo(nx - 5, ny - 14)
                ..lineTo(nx + 5, ny - 14)
                ..closePath()
                ..fillPath();
              // Barre d'echelle, en bas a gauche.
              final barLength = scaleMeters * scale;
              canvas
                ..setStrokeColor(PdfColors.black)
                ..setLineWidth(1.5)
                ..moveTo(10, 12)
                ..lineTo(10 + barLength, 12)
                ..strokePath();
            },
          ),
          ...labels,
          pw.Positioned(
            right: 16,
            top: 30,
            child: pw.Text(
              'N',
              style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
            ),
          ),
          pw.Positioned(
            left: 10,
            bottom: 16,
            child: pw.Text(
              '${_meters(scaleMeters)} m',
              style: const pw.TextStyle(fontSize: 7),
            ),
          ),
        ],
      ),
    );
  }

  pw.Widget _summary(SurveyMeasurements measures) {
    final area = measures.areaSquareMeters;
    return pw.Row(
      children: [
        _figure(
          'Perimetre',
          '${measures.perimeterMeters.toStringAsFixed(2)} m',
        ),
        pw.SizedBox(width: 12),
        _figure(
          'Surface',
          '${area.toStringAsFixed(2)} m2 (${(area / 10000).toStringAsFixed(4)} ha)',
        ),
      ],
    );
  }

  pw.Widget _figure(String label, String value) => pw.Container(
    padding: const pw.EdgeInsets.all(8),
    decoration: pw.BoxDecoration(
      color: PdfColors.grey100,
      border: pw.Border.all(color: PdfColors.grey400, width: 0.5),
    ),
    child: pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(label, style: const pw.TextStyle(fontSize: 8)),
        pw.Text(value, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
      ],
    ),
  );

  pw.Widget _pointsTable(
    List<SurveyPoint> points,
    List<Utm31NCoordinate> utm,
  ) => pw.TableHelper.fromTextArray(
    headerStyle: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold),
    cellStyle: const pw.TextStyle(fontSize: 8),
    headers: const [
      'Borne',
      'Latitude',
      'Longitude',
      'Est (m)',
      'Nord (m)',
      'Alt. (m)',
      'Fix',
      'Precision',
    ],
    data: [
      for (var i = 0; i < points.length; i++)
        [
          points[i].pointName.isEmpty
              ? 'B${points[i].pointNumber}'
              : points[i].pointName,
          points[i].latitude.toStringAsFixed(8),
          points[i].longitude.toStringAsFixed(8),
          utm[i].easting.toStringAsFixed(3),
          utm[i].northing.toStringAsFixed(3),
          points[i].altitude?.toStringAsFixed(2) ?? '-',
          points[i].fixQuality.serialized,
          points[i].accuracy == null
              ? '-'
              : '${(points[i].accuracy! * 100).toStringAsFixed(1)} cm',
        ],
    ],
  );

  pw.Widget _edgesTable(List<SurveyPoint> points, List<double> edges) {
    String name(SurveyPoint p) =>
        p.pointName.isEmpty ? 'B${p.pointNumber}' : p.pointName;
    return pw.TableHelper.fromTextArray(
      headerStyle: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold),
      cellStyle: const pw.TextStyle(fontSize: 8),
      headers: const ['Cote', 'Longueur (m)'],
      data: [
        for (var i = 0; i < points.length; i++)
          [
            '${name(points[i])} - ${name(points[(i + 1) % points.length])}',
            edges[i].toStringAsFixed(2),
          ],
      ],
    );
  }

  static String _date(DateTime value) {
    final utc = value.toUtc();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(utc.day)}/${two(utc.month)}/${utc.year} '
        '${two(utc.hour)}:${two(utc.minute)} UTC';
  }

  static String _meters(double value) =>
      value >= 1 ? value.toStringAsFixed(0) : value.toStringAsFixed(2);
}

/// Longueur ronde (1, 2 ou 5 x 10^n metres) la plus proche par defaut de
/// [target], pour la barre d'echelle.
double niceScaleLength(double target) {
  if (target <= 0) return 1;
  final power = math.pow(10, (math.log(target) / math.ln10).floor()).toDouble();
  for (final step in const [5, 2, 1]) {
    if (step * power <= target) return step * power;
  }
  return power;
}
