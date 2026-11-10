import { ShieldCheck } from "lucide-react";
import { LEGAL_LABEL, type LegalStatus } from "@/lib/data";

export function LegalBadge({ status }: { status: LegalStatus }) {
  const cls =
    status === "TITRE"
      ? "gs-badge--titre"
      : status === "COUTUMIER_NON_TITRE"
        ? "gs-badge--coutumier"
        : status === "EN_LITIGE"
          ? "gs-badge--litige"
          : "gs-badge--neutral";
  return <span className={`gs-badge ${cls}`}>{LEGAL_LABEL[status]}</span>;
}

export function CertBadge({
  certified,
  kind,
}: {
  certified: boolean;
  kind: "parcelle" | "agent";
}) {
  const word = kind === "parcelle" ? "Parcelle" : "Agent";
  if (certified) {
    return (
      <span className="gs-badge gs-badge--cert">
        <ShieldCheck aria-hidden size={14} strokeWidth={2} />
        {word} certifié{kind === "parcelle" ? "e" : ""}
      </span>
    );
  }
  return (
    <span className="gs-badge gs-badge--uncert">
      {word} non certifié{kind === "parcelle" ? "e" : ""}
    </span>
  );
}