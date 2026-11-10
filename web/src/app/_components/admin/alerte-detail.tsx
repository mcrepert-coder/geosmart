"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, Lock, Send, X } from "lucide-react";
import { ALERTS, type OverlapAlert } from "@/lib/data";
import { chainIntegrity, contactGeometre, markExamined, useDemoStore } from "@/lib/demo-store";
import { formatDate, formatStamp, formatSurface } from "@/lib/format";
import { CertBadge, LegalBadge } from "../badges";
import { OverlapMap } from "./overlap-map";

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(iso));
}

export function AlerteDetail({ alert }: { alert: OverlapAlert }) {
  const { journal, examined, accounts } = useDemoStore();
  const [contactOpen, setContactOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isExamined = examined.includes(alert.id);

  const surname = alert.submitted.author.split(" ").pop() ?? "";
  const geometre = accounts.find((a) => a.name.endsWith(surname));
  const [message, setMessage] = useState(
    `Bonjour, votre levé ${alert.submitted.parcelId} (v${alert.submitted.version}) chevauche ${alert.existing.parcelId} de ${formatSurface(alert.overlapM2)} (${alert.bornes}). Merci de corriger vos bornes ou de signaler un litige.`,
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!contactOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setContactOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contactOpen]);

  const intact = chainIntegrity(journal);

  return (
    <div className="p-4 md:p-8">
      <nav className="flex items-center gap-2 text-[13px]" aria-label="Fil d'Ariane">
        <Link href="/admin/alertes" className="font-semibold text-[var(--primary)] underline">
          Alertes
        </Link>
        <span className="text-[var(--text-muted)]">/</span>
        <span className="gs-mono text-[var(--text-muted)]">{alert.id}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="gs-h1 gs-display">
          Chevauchement refusé · {alert.submitted.parcelId}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {isExamined && <span className="gs-badge gs-badge--success">Examinée · journalisée</span>}
          <button className="gs-btn gs-btn--secondary" onClick={() => setContactOpen(true)}>
            Contacter le géomètre
          </button>
          <button
            className="gs-btn gs-btn--primary"
            disabled={isExamined}
            title={isExamined ? "Alerte déjà examinée" : undefined}
            onClick={() => {
              markExamined(alert.id);
              setToast(`Alerte ${alert.id} marquée comme examinée.`);
            }}
          >
            Marquer comme examinée
          </button>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="gs-map overflow-hidden">
          <OverlapMap alert={alert} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="gs-card p-4">
            <p className="gs-module text-[var(--text-muted)]">Parcelle existante</p>
            <p className="gs-mono mt-1 text-[16px] font-semibold">
              {alert.existing.parcelId} · v{alert.existing.version}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <LegalBadge status={alert.existing.legal} />
              <CertBadge certified={alert.existing.certified} kind="parcelle" />
            </div>
            <p className="gs-caption mt-3">
              Levée le {formatDate(alert.existing.surveyedAt)} par {alert.existing.surveyor}
            </p>
          </div>
          <div className="gs-card p-4">
            <p className="gs-module text-[var(--text-muted)]">Parcelle soumise</p>
            <p className="gs-mono mt-1 text-[16px] font-semibold">
              {alert.submitted.parcelId} · v{alert.submitted.version}
            </p>
            <div className="mt-2">
              <span className="gs-badge gs-badge--danger">Refusée · {alert.submitted.refusedCode}</span>
            </div>
            <p className="gs-caption mt-3">
              {alert.submitted.author} · reçue le {formatDate(alert.submitted.receivedAt)} à{" "}
              {timeOf(alert.submitted.receivedAt)} · contrôle en{" "}
              {String(alert.submitted.controlSeconds).replace(".", ",")} s
            </p>
          </div>
          <div className="gs-alert gs-alert--info">
            <Lock size={18} className="mt-0.5 flex-none text-[var(--primary)]" aria-hidden />
            <p className="text-[13px] font-semibold leading-5">
              L&apos;administrateur ne modifie aucune limite. Le géomètre corrige ses bornes ou
              signale un litige.
            </p>
          </div>
        </div>
      </div>

      {!intact && (
        <div className="gs-alert gs-alert--danger mt-6" role="alert">
          <p className="text-[14px] font-semibold">
            Rupture de chaîne détectée : l&apos;empreinte d&apos;une ligne ne correspond pas à la
            précédente. Contactez le responsable système.
          </p>
        </div>
      )}

      <div className="gs-card gs-card--flush mt-6 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="gs-h3 gs-display">Journal chaîné</h2>
          <div className="flex items-center gap-3">
            {intact && (
              <span className="gs-badge gs-badge--success">Chaîne intègre · {journal.length} lignes</span>
            )}
            <Link href="/admin/journal" className="text-[13px] font-semibold text-[var(--primary)] underline">
              Journal complet
            </Link>
          </div>
        </div>
        <table className="gs-table mt-2">
          <thead>
            <tr>
              <th>#</th>
              <th>Horodatage</th>
              <th>Action</th>
              <th>Auteur</th>
              <th>Empreinte précédente</th>
              <th>Empreinte</th>
            </tr>
          </thead>
          <tbody>
            {journal.slice(0, 5).map((j) => (
              <tr key={j.seq} className="cursor-default">
                <td className="gs-mono">{j.seq}</td>
                <td className="gs-mono whitespace-nowrap">{formatStamp(j.at)}</td>
                <td>{j.action}</td>
                <td className="whitespace-nowrap">{j.author}</td>
                <td className="gs-mono text-[var(--text-muted)]">{j.prevHash}</td>
                <td className="gs-mono">{j.hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contactOpen && (
        <div className="fixed inset-0 z-[1200] grid place-items-center p-4">
          <div className="gs-scrim" onClick={() => setContactOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Contacter le géomètre"
            className="gs-card gs-rise relative z-10 w-full max-w-md p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="gs-h3 gs-display">Contacter le géomètre</p>
                <p className="gs-caption mt-1">
                  {alert.submitted.author}
                  {geometre ? ` · ${geometre.phone}` : ""}
                </p>
              </div>
              <button className="gs-iconbtn" onClick={() => setContactOpen(false)} aria-label="Fermer" autoFocus>
                <X size={18} />
              </button>
            </div>
            <label className="gs-label mt-4" htmlFor="contact-message">
              Message
            </label>
            <textarea
              id="contact-message"
              className="gs-input h-auto min-h-[120px] py-3 text-[15px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="gs-help mt-2">
              L&apos;envoi est journalisé. En démonstration, aucun SMS réel n&apos;est transmis.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                className="gs-btn gs-btn--primary flex-1"
                disabled={!message.trim()}
                onClick={() => {
                  contactGeometre(alert.id, message.trim());
                  setContactOpen(false);
                  setToast(`Message journalisé · transmis à ${alert.submitted.author} (démo).`);
                }}
              >
                <Send size={16} aria-hidden />
                Envoyer
              </button>
              <button
                className="gs-btn gs-btn--secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message);
                    setToast("Message copié.");
                  } catch {
                    setToast("Copie impossible : sélectionnez le texte manuellement.");
                  }
                }}
              >
                <Copy size={16} aria-hidden />
                Copier
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="gs-toast" role="status">
          <span>{toast}</span>
          <button aria-label="Fermer" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export function AlertesList() {
  const { examined } = useDemoStore();
  const router = useRouter();
  const open = (id: string) => router.push(`/admin/alertes/${id}`);
  return (
    <div className="p-4 md:p-8">
      <h1 className="gs-h1 gs-display">Alertes de chevauchement</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Contrôle RG-02 : chaque refus 409 est conservé avec son motif, sa zone commune et sa
        surface.
      </p>
      <div className="gs-card gs-card--flush mt-6 overflow-x-auto">
        <table className="gs-table">
          <thead>
            <tr>
              <th>Alerte</th>
              <th>Parcelles</th>
              <th>Zone commune</th>
              <th>Reçue</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ALERTS.map((a) => (
              <tr key={a.id} onClick={() => open(a.id)} tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open(a.id);
                }}
              >
                <td className="gs-mono font-semibold">{a.id}</td>
                <td>
                  <span className="gs-mono">{a.existing.parcelId}</span>
                  <span className="mx-2 text-[var(--text-muted)]">/</span>
                  <span className="gs-mono">{a.submitted.parcelId}</span>
                </td>
                <td className="whitespace-nowrap">
                  {formatSurface(a.overlapM2)} · {a.bornes}
                </td>
                <td className="whitespace-nowrap">{formatDate(a.submitted.receivedAt)}</td>
                <td>
                  {examined.includes(a.id) ? (
                    <span className="gs-badge gs-badge--success">Examinée</span>
                  ) : (
                    <span className="gs-badge gs-badge--warning">Nouvelle</span>
                  )}
                </td>
                <td className="text-right">
                  <Link
                    href={`/admin/alertes/${a.id}`}
                    className="gs-btn gs-btn--secondary gs-btn--sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Examiner
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}