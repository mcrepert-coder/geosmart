import 'package:flutter/material.dart';

import '../features/gnss/presentation/gnss_page.dart';
import '../features/gnss/presentation/viewmodels/survey_controller.dart';
import 'theme/geosmart_theme.dart';

/// Application GeoSmart Field (MVVM).
///
/// La composition est faite dans `main.dart` : la base locale, la mission et
/// la source GNSS sont injectees dans [SurveyController], puis la vue T3/T4
/// recoit ce ViewModel.
class GeoSmartApp extends StatelessWidget {
  const GeoSmartApp({super.key, required this.controller});

  final SurveyController controller;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GeoSmart Field',
      theme: GeoSmartTheme.light,
      darkTheme: GeoSmartTheme.dark,
      debugShowCheckedModeBanner: false,
      home: GnssPage(controller: controller),
    );
  }
}
