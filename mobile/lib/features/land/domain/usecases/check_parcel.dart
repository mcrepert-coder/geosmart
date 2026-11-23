import '../../data/parcel_status_api.dart';
import '../../data/parcel_status_cache.dart';
import '../entities/parcel_public_status.dart';

/// Issue d'une verification : resultat frais, resultat garde hors ligne, ou
/// echec explique.
sealed class CheckOutcome {
  const CheckOutcome();
}

class FreshResult extends CheckOutcome {
  const FreshResult(this.status, this.consultedAt);

  final ParcelPublicStatus status;
  final DateTime consultedAt;
}

/// Pas de reseau : on montre le resultat garde, avec sa date (maquette C1).
class OfflineResult extends CheckOutcome {
  const OfflineResult(this.cached);

  final CachedParcelStatus cached;
}

class CheckFailed extends CheckOutcome {
  const CheckFailed(this.kind, this.message);

  final ParcelStatusFailure kind;
  final String message;
}

/// EF-206 : verifier une parcelle, garder le resultat pour le hors ligne.
class CheckParcel {
  CheckParcel(this._api, this._cache, {DateTime Function()? clock})
    : _clock = clock ?? DateTime.now;

  final ParcelStatusApi _api;
  final ParcelStatusCache _cache;
  final DateTime Function() _clock;

  Future<CheckOutcome> call(String parcelId) async {
    try {
      final status = await _api.fetch(parcelId);
      final now = _clock();
      await _cache.save(status, now);
      return FreshResult(status, now);
    } on ParcelStatusException catch (e) {
      if (e.kind == ParcelStatusFailure.network) {
        final cached = await _cache.find(parcelId);
        if (cached != null) return OfflineResult(cached);
      }
      return CheckFailed(e.kind, e.message);
    }
  }
}
