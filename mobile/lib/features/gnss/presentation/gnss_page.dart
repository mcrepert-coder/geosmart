import 'package:flutter/material.dart';

class GnssPage extends StatelessWidget {
  const GnssPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('GeoSmart')),
      body: const Center(child: Text('GNSS prêt à être configuré')),
    );
  }
}
