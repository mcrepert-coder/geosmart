import 'package:flutter/material.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'viewmodels/theme_controller.dart';

/// Ecran de parametres de l'application.
///
/// Le choix du theme est porte par [ThemeController] et s'applique a toutes
/// les pages, y compris la mesure d'une borne et les pages ouvertes depuis
/// la liste des missions.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key, required this.theme});

  final ThemeController theme;

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 72,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Parametres',
              style: GeoSmartText.h2.copyWith(color: colors.text),
            ),
            Text(
              "Reglages de l'application",
              style: GeoSmartText.caption.copyWith(color: colors.textMuted),
            ),
          ],
        ),
      ),
      body: ListenableBuilder(
        listenable: theme,
        builder: (context, _) {
          final current = GeoSmartColors.of(context);
          return ListView(
            padding: const EdgeInsets.all(GeoSmartDimens.space4),
            children: [
              Text(
                'Apparence',
                style: GeoSmartText.label.copyWith(color: current.text),
              ),
              const SizedBox(height: GeoSmartDimens.space2),
              _ThemeOption(
                colors: current,
                title: 'Theme clair',
                subtitle: 'Fond clair, lisible en plein soleil.',
                icon: Icons.light_mode_outlined,
                selected: theme.mode == ThemeMode.light,
                onTap: theme.selectLight,
              ),
              const SizedBox(height: GeoSmartDimens.space2),
              _ThemeOption(
                colors: current,
                title: 'Theme sombre',
                subtitle: 'Fond sombre, pour les leves de nuit.',
                icon: Icons.dark_mode_outlined,
                selected: theme.mode == ThemeMode.dark,
                onTap: theme.selectDark,
              ),
              const SizedBox(height: GeoSmartDimens.space4),
              Container(
                padding: const EdgeInsets.all(GeoSmartDimens.space3),
                decoration: BoxDecoration(
                  color: current.primarySoft,
                  borderRadius: BorderRadius.circular(GeoSmartDimens.radiusMd),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, size: 20, color: current.primary),
                    const SizedBox(width: GeoSmartDimens.space2),
                    Expanded(
                      child: Text(
                        "Le theme choisi s'applique a toutes les pages de "
                        "l'application, y compris la mesure d'une borne.",
                        style: GeoSmartText.body.copyWith(color: current.text),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ThemeOption extends StatelessWidget {
  const _ThemeOption({
    required this.colors,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final GeoSmartColors colors;
  final String title;
  final String subtitle;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? colors.primarySoft : colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        side: BorderSide(
          color: selected ? colors.primary : colors.border,
          width: selected ? 2 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(GeoSmartDimens.space3),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: selected ? colors.surface : colors.surfaceSunken,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  icon,
                  size: 22,
                  color: selected ? colors.primary : colors.textMuted,
                ),
              ),
              const SizedBox(width: GeoSmartDimens.space3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GeoSmartText.bodyStrong.copyWith(
                        color: colors.text,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: GeoSmartText.caption.copyWith(
                        color: colors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: GeoSmartDimens.space2),
              Icon(
                selected ? Icons.check_circle : Icons.radio_button_unchecked,
                size: 24,
                color: selected ? colors.primary : colors.borderStrong,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
