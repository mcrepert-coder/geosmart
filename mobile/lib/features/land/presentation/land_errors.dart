import '../data/land_api.dart';
import 'land_style.dart';

/// Ce que le geometre envoyait quand le serveur a refuse.
enum LandAction { create, update }

/// Message a montrer pour un refus de l'API fonciere. Sert a l'ecran de
/// modification et a la file d'envoi (module sync de Beni) quand un leve
/// revient refuse : meme ton que la maquette OverlapAlert, la regle et la
/// suite a donner, sans accuser.
String landErrorMessage(
  LandApiException e, {
  LandAction action = LandAction.create,
}) {
  if (e.isNetwork) return e.message;
  return switch (e.code) {
    'PARCEL_OVERLAP' => _overlapMessage(e, action),
    'VERSION_CONFLICT' =>
      'La parcelle a été modifiée entre-temps (version ${e.details?['currentVersion'] ?? '?'}). Rouvrez sa fiche pour partir de la dernière version.',
    'UNAUTHORIZED' => 'Votre session a expiré. Reconnectez-vous puis renvoyez.',
    // Le serveur ne distingue pas un role insuffisant d'un compte suspendu.
    'FORBIDDEN' =>
      'Action refusée : votre rôle ne le permet pas, ou votre compte est suspendu ou pas encore validé. Contactez l\'administrateur si c\'est une erreur.',
    _ => e.message,
  };
}

String _overlapMessage(LandApiException e, LandAction action) {
  final conflicts = [
    for (final c in (e.details?['conflicts'] as List?) ?? const [])
      if (c is Map<String, dynamic>) c,
  ];
  if (conflicts.isEmpty) return e.message;
  final first = conflicts.first;
  final area = (first['overlapAreaM2'] as num?)?.toDouble();
  final others = conflicts.length - 1;
  final subject = action == LandAction.update
      ? 'La nouvelle limite'
      : 'Le levé';
  return '$subject recouvre ${first['parcelId']}'
      '${area == null ? '' : ' sur ${formatArea(area)}'}'
      '${others > 0 ? ' et $others autre${others > 1 ? 's' : ''} parcelle${others > 1 ? 's' : ''}' : ''}. '
      'Vérifiez les bornes ou signalez un litige. L\'alerte a été journalisée.';
}
