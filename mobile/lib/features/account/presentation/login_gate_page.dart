import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../../app/theme/geosmart_theme.dart';
import 'login_page.dart';
import 'viewmodels/auth_controller.dart';

/// Ecran d'accueil de l'utilisateur non connecte (EF-401).
///
/// Un carrousel horizontal en boucle occupe le quart superieur de l'ecran,
/// avec ses dots juste en dessous. Le message et le bouton restent centres
/// horizontalement ; le bouton est descendu vers les 3/4 de la hauteur.
/// Le formulaire complet est sur [LoginPage].
class LoginGatePage extends StatefulWidget {
  const LoginGatePage({super.key, required this.auth});

  final AuthController auth;

  @override
  State<LoginGatePage> createState() => _LoginGatePageState();
}

class _LoginGatePageState extends State<LoginGatePage> {
  /// Trois elements, repetes un grand nombre de fois pour un defilement
  /// sans retour en arriere visible quand on repasse du dernier au premier.
  static const List<String> _slides = [
    'Leve GNSS RTK : 1 a 2 cm de precision',
    'Parcelles securisees, sans chevauchement',
    'Annonces, visites et locations au meme endroit',
  ];

  static const int _cycles = 1000;
  static final int _initialPage = _slides.length * _cycles;
  static const Duration _autoScrollInterval = Duration(seconds: 3);
  static const Duration _slideAnimation = Duration(milliseconds: 400);

  late final PageController _pageController = PageController(
    initialPage: _initialPage,
  );
  Timer? _autoScrollTimer;
  int _currentPage = _initialPage;

  @override
  void initState() {
    super.initState();
    _autoScrollTimer = Timer.periodic(_autoScrollInterval, (_) => _nextSlide());
  }

  @override
  void dispose() {
    _autoScrollTimer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  void _nextSlide() {
    if (!mounted || !_pageController.hasClients) return;
    final page = (_pageController.page ?? _currentPage).round();
    _pageController.animateToPage(
      page + 1,
      duration: _slideAnimation,
      curve: Curves.easeInOut,
    );
  }

  Widget _buildSlide(BuildContext context, GeoSmartColors colors, int index) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: GeoSmartDimens.space1),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.border),
          borderRadius: BorderRadius.circular(GeoSmartDimens.radiusLg),
        ),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.all(GeoSmartDimens.space4),
            child: Text(
              _slides[index % _slides.length],
              style: GeoSmartText.bodyLg.copyWith(color: colors.text),
              textAlign: TextAlign.left,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDots(GeoSmartColors colors) {
    final active = _currentPage % _slides.length;
    return Row(
      key: const Key('login-carousel-dots'),
      mainAxisSize: MainAxisSize.min,
      children: List<Widget>.generate(_slides.length, (index) {
        final selected = index == active;
        return AnimatedContainer(
          key: ValueKey<String>('login-carousel-dot-$index'),
          duration: const Duration(milliseconds: 250),
          width: selected ? 16 : 8,
          height: 8,
          margin: const EdgeInsets.symmetric(horizontal: GeoSmartDimens.space1),
          decoration: BoxDecoration(
            color: selected ? colors.primary : colors.borderStrong,
            borderRadius: BorderRadius.circular(GeoSmartDimens.radiusPill),
          ),
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = GeoSmartColors.of(context);
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints.expand(),
          child: LayoutBuilder(
            builder: (context, constraints) {
              return Stack(
                children: [
                  Align(
                    alignment: Alignment.topCenter,
                    child: Padding(
                      padding: const EdgeInsets.only(top: GeoSmartDimens.space4),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: SizedBox(
                              height: constraints.maxHeight * 0.25,
                              child: PageView.builder(
                                controller: _pageController,
                                itemBuilder: (context, index) =>
                                    _buildSlide(context, colors, index),
                                onPageChanged: (index) => setState(
                                  () => _currentPage = index,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: GeoSmartDimens.space2),
                          _buildDots(colors),
                        ],
                      ),
                    ),
                  ),
                  Align(
                    alignment: const Alignment(0, 0.25),
                    child: Text(
                      'Veuillez vous connecter',
                      style: GeoSmartText.h2.copyWith(color: colors.text),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  Align(
                    // y = 0.5 place le centre du bouton a 75% de la hauteur.
                    alignment: const Alignment(0, 0.5),
                    child: FilledButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => LoginPage(auth: widget.auth),
                        ),
                      ),
                      child: const Text('Connexion'),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
