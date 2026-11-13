import 'package:flutter/material.dart';

import '../account/domain/entities/account_user.dart';
import '../gnss/domain/entities/survey_session.dart';
import '../gnss/domain/entities/survey_session_status.dart';
import '../gnss/domain/services/uuid_v4.dart';
import 'data/land_api.dart';
import 'data/parcel_status_cache.dart';
import 'domain/entities/parcel_draft.dart';
import 'domain/usecases/check_parcel.dart';
import 'presentation/attestation_gate_page.dart';
import 'presentation/create_parcel_page.dart';
import 'presentation/parcel_sheet.dart';
import 'presentation/survey_requests_page.dart';
import 'presentation/verify_parcel_page.dart';

/// Services du module foncier, composes dans main.dart.
class LandServices {
  const LandServices({
    required this.api,
    required this.checkParcel,
    required this.statusCache,
  });

  /// Routes protegees de contracts/land.yaml.
  final LandApi api;

  /// Verification publique d'une parcelle (EF-206), avec cache hors ligne.
  final CheckParcel checkParcel;
  final ParcelStatusCache statusCache;
}

/// Points d'entree des ecrans du foncier depuis l'application connectee.
/// Le serveur reste juge des droits (RG-06) : ces aiguillages n'affichent
/// que les actions utiles au role.
class LandEntryPoints {
  const LandEntryPoints(this.services);

  final LandServices services;

  LandViewer _viewer(AccountUser user) =>
      LandViewer(id: user.id, role: user.role.serialized);

  /// Fiche d'une parcelle (EF-203), depuis la carte. Le geometre peut y
  /// demander l'attestation de leve (EF-207).
  Future<void> openParcel(
    BuildContext context,
    AccountUser user,
    String parcelId,
  ) => showParcelSheet(
    context,
    parcelId: parcelId,
    api: services.api,
    viewer: _viewer(user),
    onAttestation: user.role == AccountRole.geometre
        ? (parcel) {
            Navigator.of(context).pop();
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => AttestationGatePage(
                  parcelId: parcel.id,
                  api: services.api,
                  registeredSurveyor: user.registeredSurveyor,
                ),
              ),
            );
          }
        : null,
  );

  /// Verification d'une parcelle par son identifiant (EF-206).
  Future<void> openVerify(BuildContext context) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => VerifyParcelPage(
        checkParcel: services.checkParcel,
        cache: services.statusCache,
      ),
    ),
  );

  /// Demandes de leve (EF-209) : l'agent demande, le geometre les prend.
  bool showsSurveyRequests(AccountUser user) =>
      user.role == AccountRole.agent ||
      user.role == AccountRole.geometre ||
      user.role == AccountRole.admin;

  Future<void> openSurveyRequests(BuildContext context, AccountUser user) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => SurveyRequestsPage(
            api: services.api,
            viewer: _viewer(user),
            accountActive: user.accountActive,
          ),
        ),
      );

  /// Une mission devient une parcelle par le geometre (POST /parcels) :
  /// mission terminee, au moins trois bornes.
  bool canCreateParcel(AccountUser user, SurveySession mission) =>
      user.role == AccountRole.geometre &&
      (mission.status == SurveySessionStatus.completed ||
          mission.status == SurveySessionStatus.synced);

  /// Ouvre la creation de la parcelle a partir des bornes de la mission.
  /// [mission] doit etre chargee avec ses bornes.
  Future<void> openCreateParcel(BuildContext context, SurveySession mission) {
    final points = [...mission.points]
      ..sort((a, b) => a.pointNumber.compareTo(b.pointNumber));
    // Une cle par ouverture : un renvoi depuis cet ecran ne cree pas de
    // doublon (Idempotency-Key, RG-08).
    final idempotencyKey = uuidV4();
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CreateParcelPage(
          initialDraft: ParcelDraft(
            surveySessionId: mission.clientId,
            points: points,
          ),
          onQueue: (draft) async {
            await services.api.createParcel(
              draft,
              idempotencyKey: idempotencyKey,
            );
          },
        ),
      ),
    );
  }
}
