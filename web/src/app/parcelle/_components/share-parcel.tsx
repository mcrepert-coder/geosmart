"use client";

import { Check, Link2, MessageCircle } from "lucide-react";
import { useState } from "react";
import type { ParcelPublicStatus } from "../_lib/api";
import { formatArea } from "../_lib/format";
import { legalStatusLabel } from "./badges";

// Message pre-rempli (EF-308, RG-07) : ce que la page affiche deja
// publiquement, le lien, et la mention obligatoire.
export function shareMessage(p: ParcelPublicStatus, url: string): string {
  return [
    `Parcelle ${p.id} sur GeoSmart Field`,
    `${legalStatusLabel(p.legalStatus)} · ${formatArea(p.areaM2)} · ${p.certified ? "parcelle certifiée" : "parcelle non certifiée"}`,
    url,
    "Ne vaut pas titre foncier.",
  ].join("\n");
}

export function shareUrl(origin: string, id: string): string {
  return `${origin}/parcelle?id=${encodeURIComponent(id)}`;
}

export function ShareParcel({ parcel }: { parcel: ParcelPublicStatus }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : shareUrl(window.location.origin, parcel.id);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(shareMessage(parcel, url))}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Presse-papiers refuse : le lien reste dans la barre d'adresse.
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="gs-btn gs-btn--primary flex-1"
      >
        <MessageCircle aria-hidden size={20} />
        Envoyer sur WhatsApp
      </a>
      <button type="button" onClick={copy} className="gs-btn gs-btn--secondary flex-1">
        {copied ? <Check aria-hidden size={20} /> : <Link2 aria-hidden size={20} />}
        {copied ? "Lien copié" : "Copier le lien"}
      </button>
    </div>
  );
}
