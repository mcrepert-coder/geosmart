import 'package:flutter/widgets.dart';
import 'package:qr_flutter/qr_flutter.dart';

class ReportQrCode extends StatelessWidget {
  const ReportQrCode({required this.data, super.key});

  final String data;

  @override
  Widget build(BuildContext context) {
    return QrImageView(data: data, version: QrVersions.auto);
  }
}
