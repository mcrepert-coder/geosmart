import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Pavé de signature du locataire pour l'etat des lieux (EF-306), sans
/// dependance externe : le geste est dessine puis exporte en PNG base64.
class SignaturePad extends StatefulWidget {
  const SignaturePad({super.key, required this.onChanged, this.height = 180});

  /// Appelle a chaque fin de trait avec l'image actuelle, ou `null` si le
  /// pad est vide.
  final void Function(SignatureData? signature) onChanged;

  final double height;

  @override
  State<SignaturePad> createState() => SignaturePadState();
}

class SignatureData {
  const SignatureData({required this.base64Png, required this.isEmpty});

  final String base64Png;
  final bool isEmpty;
}

class SignaturePadState extends State<SignaturePad> {
  final List<List<Offset>> _strokes = [];

  bool get isEmpty => _strokes.every((stroke) => stroke.length < 2);

  Future<void> clear() async {
    setState(() => _strokes.clear());
    widget.onChanged(null);
  }

  /// Exporte les traits en PNG base64 pour l'envoi au serveur.
  Future<SignatureData?> export() async {
    if (_strokes.isEmpty) return null;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final size = context.size ?? Size(300, widget.height);
    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height),
      Paint()..color = Colors.white,
    );
    _paintStrokes(canvas);
    final image = await recorder
        .endRecording()
        .toImage(size.width.ceil(), size.height.ceil());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return null;
    return SignatureData(
      base64Png: base64Encode(bytes.buffer.asUint8List()),
      isEmpty: isEmpty,
    );
  }

  void _paintStrokes(Canvas canvas) {
    final paint = Paint()
      ..color = Colors.black
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final stroke in _strokes) {
      if (stroke.length < 2) {
        if (stroke.length == 1) {
          canvas.drawCircle(stroke.first, 1.5, Paint()..color = Colors.black);
        }
        continue;
      }
      final path = ui.Path()..moveTo(stroke.first.dx, stroke.first.dy);
      for (final point in stroke.skip(1)) {
        path.lineTo(point.dx, point.dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  Future<void> _emit() async {
    widget.onChanged(await export());
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onPanStart: (details) => setState(
        () => _strokes.add([details.localPosition]),
      ),
      onPanUpdate: (details) => setState(
        () => _strokes.last.add(details.localPosition),
      ),
      onPanEnd: (_) => _emit(),
      child: Container(
        height: widget.height,
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Theme.of(context).dividerColor),
          borderRadius: BorderRadius.circular(8),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: CustomPaint(
            painter: _SignaturePainter(_strokes, _paintStrokes),
            child: const SizedBox.expand(),
          ),
        ),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  const _SignaturePainter(this.strokes, this.paintStrokes);

  final List<List<Offset>> strokes;
  final void Function(Canvas canvas) paintStrokes;

  @override
  void paint(Canvas canvas, Size size) => paintStrokes(canvas);

  @override
  bool shouldRepaint(_SignaturePainter oldDelegate) => true;
}
