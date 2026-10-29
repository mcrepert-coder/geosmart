import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../domain/entities/parcel_draft.dart';
import '../land_style.dart';

/// Apercu du polygone en cours (maquette T5) : contour pointille parcel-draft,
/// bornes numerotees, longueur des cotes, cotes croises en rouge.
class PolygonPreview extends StatelessWidget {
  const PolygonPreview({super.key, required this.draft});

  final ParcelDraft draft;

  @override
  Widget build(BuildContext context) {
    final colors = LandColors.of(context);
    final names = draft.points.map((p) => p.pointName).join(', ');
    return Semantics(
      label: draft.points.length < 3
          ? 'Aperçu de la parcelle : ${draft.points.length} borne(s) relevée(s)'
          : 'Aperçu de la parcelle formée par les bornes $names',
      child: Container(
        height: 200,
        color: colors.mapLand,
        child: CustomPaint(
          painter: _PolygonPainter(draft: draft, colors: colors),
          size: Size.infinite,
        ),
      ),
    );
  }
}

class _PolygonPainter extends CustomPainter {
  _PolygonPainter({required this.draft, required this.colors});

  final ParcelDraft draft;
  final LandColors colors;

  @override
  void paint(Canvas canvas, Size size) {
    final v = draft.metrics.vertices;
    if (v.isEmpty) return;

    const margin = 32.0;
    final minE = v.map((p) => p.easting).reduce(math.min);
    final maxE = v.map((p) => p.easting).reduce(math.max);
    final minN = v.map((p) => p.northing).reduce(math.min);
    final maxN = v.map((p) => p.northing).reduce(math.max);
    final spanE = math.max(maxE - minE, 1.0);
    final spanN = math.max(maxN - minN, 1.0);
    final scale = math.min(
      (size.width - 2 * margin) / spanE,
      (size.height - 2 * margin) / spanN,
    );
    final offsetX = (size.width - spanE * scale) / 2;
    final offsetY = (size.height - spanN * scale) / 2;
    // Nord en haut : l'axe des y de l'ecran est inverse.
    Offset at(int i) => Offset(
      offsetX + (v[i].easting - minE) * scale,
      size.height - offsetY - (v[i].northing - minN) * scale,
    );

    final n = v.length;
    final crossed = <int>{
      for (final c in draft.metrics.crossings) ...[c.first, c.second],
    };
    final closed = n >= 3;

    if (closed && !draft.metrics.selfIntersects) {
      final fill = Path()..moveTo(at(0).dx, at(0).dy);
      for (var i = 1; i < n; i++) {
        fill.lineTo(at(i).dx, at(i).dy);
      }
      fill.close();
      canvas.drawPath(
        fill,
        Paint()..color = colors.accent.withValues(alpha: 0.10),
      );
    }

    final edges = closed ? n : n - 1;
    for (var i = 0; i < edges; i++) {
      final a = at(i), b = at((i + 1) % n);
      final isCrossed = crossed.contains(i);
      _dashedLine(
        canvas,
        a,
        b,
        Paint()
          ..color = isCrossed ? colors.danger : colors.accent
          ..strokeWidth = isCrossed ? 3 : 2,
      );
      if (i < draft.metrics.sideLengthsM.length) {
        _label(
          canvas,
          Offset.lerp(a, b, 0.5)!,
          formatMeters(draft.metrics.sideLengthsM[i]),
          isCrossed ? colors.danger : colors.text,
        );
      }
    }

    for (var i = 0; i < n; i++) {
      final p = at(i);
      final fixed = draft.points[i].fixQuality.canRecordPoint;
      canvas.drawCircle(p, 13, Paint()..color = Colors.white);
      canvas.drawCircle(
        p,
        11,
        Paint()..color = fixed ? colors.primary : colors.accent,
      );
      final tp = TextPainter(
        text: TextSpan(
          text: draft.points[i].pointName,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 10,
            fontWeight: FontWeight.w600,
            fontFamily: landMonoFont,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, p - Offset(tp.width / 2, tp.height / 2));
    }
  }

  void _dashedLine(Canvas canvas, Offset a, Offset b, Paint paint) {
    const dash = 6.0, gap = 4.0;
    final total = (b - a).distance;
    if (total == 0) return;
    final dir = (b - a) / total;
    for (var d = 0.0; d < total; d += dash + gap) {
      canvas.drawLine(a + dir * d, a + dir * math.min(d + dash, total), paint);
    }
  }

  void _label(Canvas canvas, Offset at, String text, Color color) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontFamily: landMonoFont,
          fontWeight: FontWeight.w600,
        ),
      ),
      textDirection: ui.TextDirection.ltr,
    )..layout();
    tp.paint(canvas, at - Offset(tp.width / 2, tp.height + 2));
  }

  @override
  bool shouldRepaint(_PolygonPainter old) =>
      old.draft != draft || old.colors != colors;
}
