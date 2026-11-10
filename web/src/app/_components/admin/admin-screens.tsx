"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Search, X } from "lucide-react";
import {
  ADMIN_STATS,
  ALERTS,
  ATTESTATIONS,
  PROPERTIES,
  ROLE_LABEL,
  type Attestation,
  type LegalStatus,
  type Property,
} from "@/lib/data";
import { chainIntegrity, resetDemo, useDemoStore } from "@/lib/demo-store";
import { formatDate, formatPrice, formatStamp, formatSurface } from "@/lib/format";
import { downloadAttestation } from "@/lib/pdf";
import { CertBadge, LegalBadge } from "../badges";
import { Notice } from "../notice";

export function Dashboard() {
  const { accounts, journal, examined } = useDemoStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const pending = accounts.filter((a) => a.status === "EN_ATTENTE");
  const newAlerts = ALERTS.filter((a) => !examined.includes(a.id));

  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 5000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const tiles = [
    { label: "Parcelles référencées", value: ADMIN_STATS.parcellesTotal, href: "/admin/parcelles", sub: "référentiel national" },
    { label: "Annonces en ligne", value: PROPERTIES.length, href: "/", sub: "site public" },
    { label: "Comptes en attente", value: pending.length, href: "/admin/comptes", sub: "rôle à attribuer" },
    { label: "Alertes nouvelles", value: newAlerts.length, href: "/admin/alertes", sub: "chevauchements refusés" },
  ];

  return (
    <div className="p-4 md:p-8">
      <h1 className="gs-h1 gs-display">Tableau de bord</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Vue d&apos;ensemble de la plateforme · aucune limite de parcelle n&apos;est modifiable ici.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="gs-kpi-tile">
            <span className="gs-label">{t.label}</span>
            <span className="gs-kpi gs-display block">{t.value}</span>
            <span className="mt-1 block text-[12px] text-[var(--text-muted)]">{t.sub}</span>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="gs-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="gs-h3 gs-display">À traiter</h2>
            <Link href="/admin/comptes" className="text-[13px] font-semibold text-[var(--primary)] underline">
              File des comptes
            </Link>
          </div>
          <div className="mt-3 flex flex-col">
            {pending.slice(0, 4).map((a) => (
              <Link
                key={a.id}
                href="/admin/comptes"
                className="flex items-center justify-between gap-3 border-t border-[var(--border)] py-3 first:border-t-0"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <span className="gs-caption">{ROLE_LABEL[a.roleRequested]}</span>
                </span>
                <span className="gs-badge gs-badge--warning">En attente</span>
              </Link>
            ))}
            {newAlerts.map((a) => (
              <Link
                key={a.id}
                href={`/admin/alertes/${a.id}`}
                className="flex items-center justify-between gap-3 border-t border-[var(--border)] py-3"
              >
                <span className="min-w-0">
                  <span className="gs-mono block font-semibold">{a.id}</span>
                  <span className="gs-caption">
                    {a.existing.parcelId} / {a.submitted.parcelId} · {formatSurface(a.overlapM2)}
                  </span>
                </span>
                <span className="gs-badge gs-badge--danger">Refusée · 409</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="gs-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="gs-h3 gs-display">Journal récent</h2>
            <Link href="/admin/journal" className="text-[13px] font-semibold text-[var(--primary)] underline">
              Journal complet
            </Link>
          </div>
          <div className="mt-3 flex flex-col">
            {journal.slice(0, 5).map((j) => (
              <div key={j.seq} className="border-t border-[var(--border)] py-3 first:border-t-0">
                <p className="text-[14px] font-semibold">{j.action}</p>
                <p className="gs-data-sm mt-0.5 text-[var(--text-muted)]">
                  {j.seq} · {formatStamp(j.at)} · {j.author}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {confirmReset ? (
          <>
            <button
              className="gs-btn gs-btn--danger gs-btn--sm"
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
              }}
            >
              Confirmer la réinitialisation
            </button>
            <button className="gs-btn gs-btn--ghost gs-btn--sm" onClick={() => setConfirmReset(false)}>
              Annuler
            </button>
            <span className="gs-caption">Comptes, journal et alertes reviennent aux données d&apos;exemple.</span>
          </>
        ) : (
          <button className="gs-btn gs-btn--ghost gs-btn--sm" onClick={() => setConfirmReset(true)}>
            Réinitialiser la démonstration
          </button>
        )}
      </div>
    </div>
  );
}

const JOURNAL_CATS = [
  { key: "TOUS", label: "Toutes les actions" },
  { key: "Compte", label: "Comptes" },
  { key: "Parcelle", label: "Parcelles" },
  { key: "Alerte", label: "Alertes" },
  { key: "SYSTEME", label: "Système" },
];

export function JournalScreen() {
  const { journal } = useDemoStore();
  const [cat, setCat] = useState("TOUS");
  const rows = useMemo(
    () =>
      journal.filter((j) =>
        cat === "TOUS" ? true : cat === "SYSTEME" ? j.author === "Système" : j.action.includes(cat),
      ),
    [journal, cat],
  );
  const intact = chainIntegrity(journal);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="gs-h1 gs-display">Journal</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Lignes chaînées : chaque empreinte reprend celle de la ligne précédente.
          </p>
        </div>
        {intact ? (
          <span className="gs-badge gs-badge--success">Chaîne intègre · {journal.length} lignes</span>
        ) : (
          <span className="gs-badge gs-badge--danger">Rupture de chaîne</span>
        )}
      </div>
      {!intact && (
        <div className="gs-alert gs-alert--danger mt-4" role="alert">
          <p className="text-[14px] font-semibold">
            Rupture de chaîne détectée : une empreinte précédente ne correspond pas. Contactez
            le responsable système.
          </p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="gs-label mb-0" htmlFor="journal-cat">
          Type d&apos;action
        </label>
        <select id="journal-cat" className="gs-select w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          {JOURNAL_CATS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="gs-caption">{rows.length} ligne{rows.length > 1 ? "s" : ""}</span>
      </div>
      <div className="gs-card gs-card--flush mt-3 overflow-x-auto">
        <table className="gs-table">
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
            {rows.map((j) => (
              <tr key={j.seq} className="cursor-default">
                <td className="gs-mono">{j.seq}</td>
                <td className="gs-mono whitespace-nowrap">{formatStamp(j.at)}</td>
                <td>{j.action}</td>
                <td className="whitespace-nowrap">{j.author}</td>
                <td className="gs-mono text-[var(--text-muted)]">{j.prevHash}</td>
                <td className="gs-mono">{j.hash}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[var(--text-muted)]">
                  Aucune ligne pour ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ParcellesScreen() {
  const [q, setQ] = useState("");
  const [legal, setLegal] = useState<"TOUS" | LegalStatus>("TOUS");
  const [sel, setSel] = useState<Property | null>(null);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const rows = PROPERTIES.filter((p) => {
    const okLegal = legal === "TOUS" || p.legalStatus === legal;
    const needle = q.trim().toLowerCase();
    const okQ =
      !needle ||
      p.parcelId.toLowerCase().includes(needle) ||
      p.zone.toLowerCase().includes(needle) ||
      p.title.toLowerCase().includes(needle);
    return okLegal && okQ;
  });

  const chips: { key: "TOUS" | LegalStatus; label: string }[] = [
    { key: "TOUS", label: "Toutes" },
    { key: "TITRE", label: "Titré" },
    { key: "COUTUMIER_NON_TITRE", label: "Coutumier non titré" },
    { key: "EN_LITIGE", label: "En litige" },
  ];

  return (
    <div className="p-4 md:p-8">
      <h1 className="gs-h1 gs-display">Parcelles</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Référentiel en lecture seule · {ADMIN_STATS.parcellesTotal} parcelles nationales, dont{" "}
        {PROPERTIES.length} dans le jeu de démonstration.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
          <input
            className="gs-input gs-input--sm pl-9"
            placeholder="Référence ou zone..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Rechercher une parcelle"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut juridique">
          {chips.map((c) => (
            <button
              key={c.key}
              className={`gs-chip ${legal === c.key ? "gs-chip--active" : ""}`}
              aria-pressed={legal === c.key}
              onClick={() => setLegal(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="gs-card gs-card--flush mt-3 overflow-x-auto">
        <table className="gs-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Zone</th>
              <th>Surface</th>
              <th>Statut</th>
              <th>Certification</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} tabIndex={0} onClick={() => setSel(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSel(p);
                }}
              >
                <td className="gs-mono font-semibold">{p.parcelId}</td>
                <td>{p.zone}</td>
                <td className="whitespace-nowrap">{formatSurface(p.surfaceM2)}</td>
                <td><LegalBadge status={p.legalStatus} /></td>
                <td><CertBadge certified={p.parcelCertified} kind="parcelle" /></td>
                <td className="text-right">
                  <Link
                    href={`/parcelle?id=${p.parcelId}`}
                    className="gs-btn gs-btn--secondary gs-btn--sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Vérifier
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[var(--text-muted)]">
                  Aucune parcelle ne correspond à cette recherche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sel && (
        <div>
          <div className="gs-scrim" onClick={() => setSel(null)} />
          <div className="gs-drawer overflow-y-auto p-5" role="dialog" aria-modal="true" aria-label={`Parcelle ${sel.parcelId}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="gs-mono gs-h3">{sel.parcelId}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <LegalBadge status={sel.legalStatus} />
                  <CertBadge certified={sel.parcelCertified} kind="parcelle" />
                </div>
              </div>
              <button className="gs-iconbtn" onClick={() => setSel(null)} aria-label="Fermer" autoFocus>
                <X size={18} />
              </button>
            </div>
            <dl className="gs-rows mt-4 text-[14px]">
              <div><dt>Zone</dt><dd>{sel.zone}</dd></div>
              <div><dt>Surface</dt><dd>{formatSurface(sel.surfaceM2)}</dd></div>
              <div><dt>Type</dt><dd>{sel.type === "TERRAIN" ? "Terrain" : "Maison"}</dd></div>
              <div><dt>Transaction</dt><dd>{sel.transaction === "VENTE" ? "Vente" : "Location"}</dd></div>
              <div><dt>Prix</dt><dd>{formatPrice(sel.price)}</dd></div>
              <div><dt>Agent</dt><dd>{sel.agentName}</dd></div>
            </dl>
            <p className="mt-4 text-[14px] leading-6 text-[var(--text-muted)]">{sel.description}</p>
            <div className="mt-5 flex flex-col gap-2">
              <Link href={`/parcelle?id=${sel.parcelId}`} className="gs-btn gs-btn--primary gs-btn--block">
                Vérifier la parcelle
              </Link>
              <Link href={`/?bien=${sel.id}`} className="gs-btn gs-btn--secondary gs-btn--block">
                Voir l&apos;annonce
              </Link>
            </div>
            <p className="gs-help mt-4">L&apos;administrateur ne modifie aucune limite de parcelle.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function AttestationsScreen() {
  const [preview, setPreview] = useState<Attestation | null>(null);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  return (
    <div className="p-4 md:p-8">
      <h1 className="gs-h1 gs-display">Attestations de levé</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Émises après levé certifié · vérification par empreinte SHA-256, sans QR code.
      </p>
      <div className="mt-4 max-w-xl">
        <Notice>Les informations affichées ne valent pas titre foncier</Notice>
      </div>
      <div className="mt-6 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ATTESTATIONS.map((a) => (
          <div key={a.id} className="gs-card p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="gs-mono font-bold">{a.id}</p>
              <FileText size={18} className="text-[var(--primary)]" aria-hidden />
            </div>
            <dl className="gs-rows mt-3 text-[14px]">
              <div><dt>Parcelle</dt><dd className="gs-mono">{a.parcelId} · v{a.version}</dd></div>
              <div><dt>Surface</dt><dd>{formatSurface(a.surfaceM2)}</dd></div>
              <div><dt>Périmètre</dt><dd>{a.perimeterM.toFixed(2).replace(".", ",")} m</dd></div>
              <div><dt>Bornes</dt><dd>{a.bornes.join(", ")}</dd></div>
              <div><dt>Levé</dt><dd>{formatDate(a.issuedAt)}</dd></div>
              <div><dt>Géomètre</dt><dd>{a.geometre}</dd></div>
            </dl>
            <p className="gs-module mt-3 text-[var(--text-muted)]">SHA-256</p>
            <p className="gs-mono mt-1 break-all text-[11px] leading-4 text-[var(--text-muted)]">{a.sha256}</p>
            <div className="mt-4 flex gap-2">
              <button className="gs-btn gs-btn--secondary gs-btn--sm flex-1" onClick={() => setPreview(a)}>
                <Eye size={15} aria-hidden />
                Aperçu
              </button>
              <button className="gs-btn gs-btn--primary gs-btn--sm flex-1" onClick={() => downloadAttestation(a)}>
                <Download size={15} aria-hidden />
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[1200] grid place-items-center p-4">
          <div className="gs-scrim" onClick={() => setPreview(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Aperçu ${preview.id}`}
            className="gs-card gs-rise relative z-10 max-h-[86vh] w-full max-w-lg overflow-y-auto p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="gs-notice">Ne vaut pas titre foncier</p>
              <button className="gs-iconbtn" onClick={() => setPreview(null)} aria-label="Fermer" autoFocus>
                <X size={18} />
              </button>
            </div>
            <p className="gs-h2 gs-display mt-5">Attestation de levé</p>
            <p className="gs-mono mt-1 text-[15px] font-semibold">{preview.id}</p>
            <dl className="gs-rows mt-4 text-[14px]">
              <div><dt>Parcelle</dt><dd className="gs-mono">{preview.parcelId} · v{preview.version}</dd></div>
              <div><dt>Surface</dt><dd>{formatSurface(preview.surfaceM2)}</dd></div>
              <div><dt>Périmètre</dt><dd>{preview.perimeterM.toFixed(2).replace(".", ",")} m (UTM 31N)</dd></div>
              <div><dt>Bornes</dt><dd>{preview.bornes.join(", ")}</dd></div>
              <div><dt>Date du levé</dt><dd>{formatDate(preview.issuedAt)}</dd></div>
              <div><dt>Géomètre</dt><dd>{preview.geometre}</dd></div>
            </dl>
            <p className="gs-module mt-4 text-[var(--text-muted)]">Empreinte SHA-256</p>
            <p className="gs-mono mt-1 break-all text-[12px] leading-5">{preview.sha256}</p>
            <p className="mt-4 text-[13px] text-[var(--text-muted)]">
              Mesure réalisée en RTK Fixed, moyenne de 10 époques par borne. Aucun QR code :
              la vérification se fait par l&apos;empreinte ci-dessus.
            </p>
            <p className="gs-notice mt-5">Ne vaut pas titre foncier · consultez l&apos;ANDF</p>
            <button className="gs-btn gs-btn--primary gs-btn--block mt-5" onClick={() => downloadAttestation(preview)}>
              <Download size={16} aria-hidden />
              Télécharger le PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}