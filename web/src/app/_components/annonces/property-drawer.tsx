"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, Clapperboard, Link2, MessageCircle, Send, X } from "lucide-react";
import type { Property } from "@/lib/data";
import { TYPE_LABEL } from "@/lib/data";
import { formatPrice, formatSurface } from "@/lib/format";
import { errorText, readJson } from "@/lib/http";
import { LISTINGS_API_PATH } from "@/lib/listings-api";
import { loginPhone } from "@/lib/phone";
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
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState({ clientName: "", clientPhone: "", message: "" });
  const [sending, setSending] = useState(false);
  const sharePath = `/?bien=${encodeURIComponent(property.id)}`;

  useEffect(() => {
    if (contactOpen) document.getElementById("contact-name")?.focus();
  }, [contactOpen]);

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

  const submitContact = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!LISTINGS_API_PATH) {
      onToast("Le contact agent est indisponible en démonstration.");
      return;
    }
    const clientName = contact.clientName.trim();
    const clientPhone = loginPhone(contact.clientPhone);
    const text = contact.message.trim();
    const digits = clientPhone.replace(/\D/g, "");
    if (!clientName || text.length < 5 || digits.length < 8 || digits.length > 15) {
      onToast("Renseignez votre nom, un numéro valide et un message d'au moins 5 caractères.");
      return;
    }
    setSending(true);
    try {
      await readJson(
        await fetch(
          `${LISTINGS_API_PATH}/properties/${encodeURIComponent(property.id)}/contacts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientName, clientPhone, message: text }),
          },
        ),
      );
      setContact({ clientName: "", clientPhone: "", message: "" });
      setContactOpen(false);
      onToast("Message envoyé à l'agent. Il vous répondra au numéro indiqué.");
    } catch (submitError) {
      onToast(errorText(submitError));
    } finally {
      setSending(false);
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
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="gs-label">Contacter l&apos;agent</p>
                  <p className="mt-1 text-[13px] leading-[19px] text-[var(--text-muted)]">
                    Votre numéro reste privé : il est transmis uniquement à l&apos;agent qui a publié
                    cette annonce.
                  </p>
                </div>
                <button
                  type="button"
                  className="gs-btn gs-btn--primary gs-btn--sm"
                  aria-expanded={contactOpen}
                  aria-controls="property-contact-form"
                  onClick={() => setContactOpen((open) => !open)}
                >
                  <MessageCircle size={15} aria-hidden />
                  {contactOpen ? "Fermer" : "Contacter l'agent"}
                </button>
              </div>
              {contactOpen && (
                <form id="property-contact-form" className="mt-3 grid gap-2" onSubmit={submitContact}>
                  <label className="gs-label" htmlFor="contact-name">
                    Votre nom
                  </label>
                  <input
                    id="contact-name"
                    className="gs-input"
                    autoComplete="name"
                    maxLength={120}
                    placeholder="Votre nom complet"
                    value={contact.clientName}
                    onChange={(e) => setContact((c) => ({ ...c, clientName: e.target.value }))}
                    required
                  />
                  <label className="gs-label" htmlFor="contact-phone">
                    Téléphone ou WhatsApp
                  </label>
                  <input
                    id="contact-phone"
                    className="gs-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={30}
                    placeholder="+228 90 12 34 56"
                    value={contact.clientPhone}
                    onChange={(e) => setContact((c) => ({ ...c, clientPhone: e.target.value }))}
                    required
                  />
                  <label className="gs-label" htmlFor="contact-message">
                    Votre message
                  </label>
                  <textarea
                    id="contact-message"
                    className="gs-input"
                    rows={3}
                    maxLength={2000}
                    placeholder="Bonjour, ce bien est-il toujours disponible ?"
                    value={contact.message}
                    onChange={(e) => setContact((c) => ({ ...c, message: e.target.value }))}
                    required
                  />
                  <button className="gs-btn gs-btn--primary gs-btn--block" disabled={sending}>
                    <Send size={15} aria-hidden />
                    {sending ? "Envoi en cours…" : "Envoyer le message"}
                  </button>
                </form>
              )}
            </div>
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