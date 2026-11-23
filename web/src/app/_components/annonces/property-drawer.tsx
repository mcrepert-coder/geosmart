"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Camera, Clapperboard, Link2, X } from "lucide-react";
import type { Property } from "@/lib/data";
import { TYPE_LABEL } from "@/lib/data";
import { formatPrice, formatSurface } from "@/lib/format";
import { downloadShareCard, type ShareFormat } from "@/lib/share-card";
import { CertBadge, LegalBadge } from "../badges";
import { Notice } from "../notice";
import { useDialog } from "../use-dialog";
import { PropertyGallery } from "./property-gallery";

export function PropertyDrawer({
  property,
  onClose,
  onToast,
}: {
  property: Property;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  useDialog(true, onClose, drawerRef);

  const [exporting, setExporting] = useState<ShareFormat | null>(null);
  const sharePath = `/?bien=${encodeURIComponent(property.id)}`;

  const absoluteUrl = () =>
    typeof window === "undefined" ? sharePath : `${window.location.origin}${sharePath}`;
  const message = (url: string) =>
    `Réf. ${property.parcelId} - ${property.title} - ${formatPrice(property.price)} - ${formatSurface(property.surfaceM2)} - ${property.parcelCertified ? "Parcelle certifiée" : "Parcelle non certifiée"} - ${url}`;

  const copy = async (then: string) => {
    try {
      await navigator.clipboard.writeText(absoluteUrl());
      onToast(then);
    } catch {
      onToast("Copie impossible sur ce navigateur");
    }
  };

  const shareWhatsapp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message(absoluteUrl()))}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const exportVisual = async (format: ShareFormat, label: string) => {
    setExporting(format);
    try {
      await downloadShareCard(property, format, absoluteUrl());
      onToast(`Visuel ${label} téléchargé, prêt à publier.`);
    } catch {
      onToast("Export impossible sur ce navigateur");
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <div className="gs-scrim" onClick={onClose} aria-hidden />
      <aside
        ref={drawerRef}
        className="gs-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Fiche du bien ${property.title}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <span className="gs-module">Annonces · Fiche du bien</span>
          <button className="gs-iconbtn" onClick={onClose} aria-label="Fermer la fiche">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PropertyGallery key={property.id} property={property} />
          <div className="flex flex-col gap-4 p-5">
            <div>
              <p className="gs-display text-[24px] font-bold leading-[32px]">
                {formatPrice(property.price)}
                {property.transaction === "LOCATION" && (
                  <span className="text-[15px] font-medium text-[var(--text-muted)]">
                    {property.pricePeriod === "AN" ? " /an" : " /mois"}
                  </span>
                )}
              </p>
              <h2 className="gs-h3 mt-1">{property.title}</h2>
              <p className="text-[13px] text-[var(--text-muted)]">{property.zone}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <LegalBadge status={property.legalStatus} />
              <CertBadge certified={property.agentCertified} kind="agent" />
            </div>
            <dl className="gs-rows">
              <div>
                <dt>Surface levée</dt>
                <dd>{formatSurface(property.surfaceM2)}</dd>
              </div>
              <div>
                <dt>Identifiant de parcelle</dt>
                <dd className="gs-data">{property.parcelId}</dd>
              </div>
              <div>
                <dt>Type de bien</dt>
                <dd>{TYPE_LABEL[property.type]}</dd>
              </div>
              <div>
                <dt>Transaction</dt>
                <dd>{property.transaction === "VENTE" ? "Vente" : "Location"}</dd>
              </div>
              {property.agentName && (
                <div>
                  <dt>Agent</dt>
                  <dd>{property.agentName}</dd>
                </div>
              )}
            </dl>
            <p className="text-[14px] leading-[22px] text-[var(--text-muted)]">
              {property.description}
            </p>
            <Link
              className="font-semibold text-[var(--primary)] underline"
              href={`/parcelle?id=${encodeURIComponent(property.parcelId)}`}
            >
              Vérifier le statut de la parcelle
            </Link>
            <Notice>Ne vaut pas titre foncier</Notice>
            <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
              <p className="gs-label">Partager l&apos;annonce</p>
              <button
                type="button"
                className="gs-btn gs-btn--primary gs-btn--block"
                onClick={shareWhatsapp}
              >
                Partager sur WhatsApp
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="gs-btn gs-btn--secondary"
                  disabled={exporting !== null}
                  onClick={() => exportVisual("story", "TikTok")}
                >
                  <Clapperboard size={16} /> {exporting === "story" ? "Export..." : "TikTok"}
                </button>
                <button
                  className="gs-btn gs-btn--secondary"
                  disabled={exporting !== null}
                  onClick={() => exportVisual("feed", "Instagram")}
                >
                  <Camera size={16} /> {exporting === "feed" ? "Export..." : "Instagram"}
                </button>
              </div>
              <p className="text-[12px] leading-[18px] text-[var(--text-muted)]">
                Export visuel prêt à publier : story 9:16 pour TikTok, feed 4:5 pour Instagram.
              </p>
              <button className="gs-btn gs-btn--ghost gs-btn--block" onClick={() => copy("Lien copié")}>
                <Link2 size={16} /> Copier le lien
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}