import { BadgeCheck } from "lucide-react";
import type { LegalStatus } from "../_lib/api";
import { legalStatusLabel } from "../_lib/format";

const STATUS_CLASS: Record<LegalStatus, string> = {
  TITRE: "gs-badge--titre",
  COUTUMIER_NON_TITRE: "gs-badge--coutumier",
  EN_LITIGE: "gs-badge--litige",
  INCONNU: "gs-badge--neutral",
};

// ParcelStatus (EF-203) : le statut est toujours ecrit, la couleur et les
// hachures ne font que le renforcer.
export function ParcelStatusBadge({ status }: { status: LegalStatus }) {
  return (
    <span className={`gs-badge ${STATUS_CLASS[status]}`}>{legalStatusLabel(status)}</span>
  );
}

// CertBadge (EF-302) : affiche seulement ce que le serveur confirme ; une
// parcelle non certifiee le dit en clair.
export function CertBadge({ certified }: { certified: boolean }) {
  if (!certified) {
    return (
      <span
        className="gs-badge gs-badge--uncert"
        title="Levé sans attestation : géomètre non inscrit, borne hors RTK Fixed ou conflit."
      >
        Parcelle non certifiée
      </span>
    );
  }
  return (
    <span
      className="gs-badge gs-badge--cert"
      title="Levé par un géomètre inscrit, toutes bornes en RTK Fixed, sans conflit. Ne vaut pas titre foncier."
    >
      <BadgeCheck aria-hidden size={16} strokeWidth={2} />
      Parcelle certifiée
    </span>
  );
}
