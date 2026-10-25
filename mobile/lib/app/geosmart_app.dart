import 'package:flutter/material.dart';

import '../features/gnss/presentation/gnss_page.dart';

class GeoSmartApp extends StatelessWidget {
  const GeoSmartApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GeoSmart',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF176B5B)),
      home: const GnssPage(),
    );
  }
}