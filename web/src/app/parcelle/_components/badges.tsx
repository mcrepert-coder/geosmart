import { BadgeCheck } from "lucide-react";
import type { LegalStatus } from "../_lib/api";

const STATUS: Record<LegalStatus, { label: string; className: string }> = {
  TITRE: { label: "Titré", className: "gs-badge--titre" },
  COUTUMIER_NON_TITRE: { label: "Coutumier non titré", className: "gs-badge--coutumier" },
  EN_LITIGE: { label: "En litige", className: "gs-badge--litige" },
  INCONNU: { label: "Statut non renseigné", className: "gs-badge--neutral" },
};

export function legalStatusLabel(status: LegalStatus): string {
  return STATUS[status].label;
}

// ParcelStatus (EF-203) : le statut est toujours ecrit, la couleur et les
// hachures ne font que le renforcer.
export function ParcelStatusBadge({ status }: { status: LegalStatus }) {
  const { label, className } = STATUS[status];
  return <span className={`gs-badge ${className}`}>{label}</span>;
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
