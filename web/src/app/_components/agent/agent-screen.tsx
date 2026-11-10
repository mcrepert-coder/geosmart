"use client";

import { useState } from "react";
import { LandPlot, Lock, Plus } from "lucide-react";
import {
  LISTING_STATUS_LABEL,
  SURVEYED_PARCELS,
  TYPE_LABEL,
  type AccountStatus,
  type ListingStatus,
  type PropertyType,
  type TransactionType,
} from "@/lib/data";
import {
  addListing,
  setListingPublished,
  setListingStatus,
  useDemoStore,
} from "@/lib/demo-store";
import { formatPrice } from "@/lib/format";

const GATE_MESSAGE: Record<AccountStatus, string> = {
  ACTIF: "",
  EN_ATTENTE:
    "Compte en attente de validation. L'administration GeoSmart doit approuver vos pièces (RCCM, carte professionnelle) avant toute création ou publication d'annonce.",
  REJETE:
    "Compte rejeté. La création et la publication d'annonces sont bloquées. Soumettez un nouveau dossier à l'administration.",
  SUSPENDU:
    "Compte suspendu. La publication est bloquée tant que l'administration n'a pas réactivé le compte.",
};

const STATUS_OPTIONS: ListingStatus[] = ["LIBRE", "LOUE", "VENDU"];

export function AgentScreen() {
  const { accounts, listings, agentSessionId } = useDemoStore();
  const agent = accounts.find((a) => a.id === agentSessionId) ?? null;
  const canPublish =
    accounts.find((a) => a.id === agentSessionId)?.status === "ACTIF";
  const myListings = listings.filter((l) => l.agentId === agent?.id);

  const [formOpen, setFormOpen] = useState(false);
  const [parcelId, setParcelId] = useState("");
  const [type, setType] = useState<PropertyType>("TERRAIN");
  const [transaction, setTransaction] = useState<TransactionType>("VENTE");
  const [price, setPrice] = useState("");
  const [title, setTitle] = useState("");

  const linkable = SURVEYED_PARCELS.filter(
    (p) =>
      p.certified &&
      p.legalStatus !== "EN_LITIGE" &&
      !myListings.some((l) => l.parcelId === p.parcelId),
  );
  const parcel = SURVEYED_PARCELS.find((p) => p.parcelId === parcelId) ?? null;

  const published = myListings.filter((l) => l.published).length;
  const drafts = myListings.length - published;
  const parcelsLinked = new Set(myListings.map((l) => l.parcelId)).size;

  const submit = () => {
    if (!agent || !parcel) return;
    const value = Number(price.replace(/\s/g, ""));
    if (!value || value <= 0) return;
    addListing({
      agentId: agent.id,
      parcelId: parcel.parcelId,
      title: title.trim() || `${TYPE_LABEL[type]} ${parcel.surfaceM2} m² · ${parcel.zone}`,
      type,
      transaction,
      price: value,
      surfaceM2: parcel.surfaceM2,
      zone: parcel.zone,
    });
    setFormOpen(false);
    setParcelId("");
    setPrice("");
    setTitle("");
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="gs-h1 gs-display">Catalogue de biens</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Liez chaque annonce à une parcelle levée au RTK par un géomètre, puis publiez-la
            une fois votre compte validé.
          </p>
        </div>
        <button
          className="gs-btn gs-btn--primary"
          disabled={!canPublish}
          onClick={() => setFormOpen((v) => !v)}
          title={canPublish ? "Créer une annonce" : "Publication verrouillée : compte non validé"}
        >
          {canPublish ? <Plus size={16} /> : <Lock size={16} />} Nouvelle annonce
        </button>
      </div>

      {agent && !canPublish && (
        <div
          role="alert"
          className="mt-4 rounded-[12px] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-[14px] font-medium text-[var(--danger)]"
        >
          {GATE_MESSAGE[agent.status]}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="gs-kpi-tile">
          <span className="gs-label">Annonces publiées</span>
          <span className="gs-kpi gs-display block">{published}</span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">visibles sur le site</span>
        </div>
        <div className="gs-kpi-tile">
          <span className="gs-label">Brouillons</span>
          <span className="gs-kpi gs-display block">{drafts}</span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">non publiés</span>
        </div>
        <div className="gs-kpi-tile">
          <span className="gs-label">Parcelles liées</span>
          <span className="gs-kpi gs-display block">{parcelsLinked}</span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">levés RTK certifiés</span>
        </div>
        <div className="gs-kpi-tile">
          <span className="gs-label">Statut du compte</span>
          <span className="mt-2 block">
            <span
              className={`gs-badge ${
                agent?.status === "ACTIF"
                  ? "gs-badge--success"
                  : agent?.status === "EN_ATTENTE"
                    ? "gs-badge--warning"
                    : "gs-badge--danger"
              }`}
            >
              {agent ? LISTING_GATE_LABEL(agent.status) : "Aucun profil"}
            </span>
          </span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
            {canPublish ? "publication autorisée" : "publication verrouillée"}
          </span>
        </div>
      </div>

      {formOpen && canPublish && (
        <div className="gs-card mt-6 p-5">
          <h2 className="gs-h3 gs-display">Lier une annonce à une parcelle levée</h2>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Seules les parcelles certifiées hors litige, levées par un géomètre agréé, peuvent
            être reliées à une annonce.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="gs-label">Parcelle géoréférencée</span>
              <select
                className="gs-select mt-1 w-full"
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
              >
                <option value="">Choisir une parcelle levée</option>
                {linkable.map((p) => (
                  <option key={p.parcelId} value={p.parcelId}>
                    {p.parcelId} · {p.zone} · {p.surfaceM2} m²
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="gs-label">Titre de l&apos;annonce</span>
              <input
                className="gs-input mt-1 w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={parcel ? `${TYPE_LABEL[type]} ${parcel.surfaceM2} m² · ${parcel.zone}` : "Titre"}
              />
            </label>
            <label className="block">
              <span className="gs-label">Type de bien</span>
              <select
                className="gs-select mt-1 w-full"
                value={type}
                onChange={(e) => setType(e.target.value as PropertyType)}
              >
                <option value="TERRAIN">Terrain</option>
                <option value="MAISON">Maison</option>
              </select>
            </label>
            <label className="block">
              <span className="gs-label">Opération</span>
              <select
                className="gs-select mt-1 w-full"
                value={transaction}
                onChange={(e) => setTransaction(e.target.value as TransactionType)}
              >
                <option value="VENTE">Vente</option>
                <option value="LOCATION">Location</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="gs-label">Prix (FCFA)</span>
              <input
                className="gs-input mt-1 w-full"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="28 000 000"
              />
            </label>
          </div>
          {parcel && (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <LandPlot size={15} aria-hidden />
              Levé {parcel.surveyedAt} par {parcel.surveyor} · {parcel.surfaceM2} m² ·{" "}
              {parcel.zone}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button className="gs-btn gs-btn--primary" disabled={!parcel} onClick={submit}>
              Créer le brouillon
            </button>
            <button className="gs-btn gs-btn--ghost" onClick={() => setFormOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="gs-card gs-card--flush mt-6 overflow-x-auto">
        <table className="gs-table w-full">
          <thead>
            <tr>
              <th>Bien</th>
              <th>Parcelle liée</th>
              <th>Prix</th>
              <th>Statut</th>
              <th>Publication</th>
            </tr>
          </thead>
          <tbody>
            {myListings.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="block font-semibold">{l.title}</span>
                  <span className="gs-caption">
                    {TYPE_LABEL[l.type]} · {l.transaction === "VENTE" ? "Vente" : "Location"} ·{" "}
                    {l.zone}
                  </span>
                </td>
                <td>
                  <span className="gs-mono block">{l.parcelId}</span>
                  <span className="gs-caption">{l.surfaceM2} m²</span>
                </td>
                <td className="gs-data">{formatPrice(l.price)}</td>
                <td>
                  <select
                    className="gs-select gs-input--sm"
                    value={l.status}
                    onChange={(e) => setListingStatus(l.id, e.target.value as ListingStatus)}
                    aria-label={`Statut du bien ${l.parcelId}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {LISTING_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className={`gs-chip ${l.published ? "gs-chip--active" : ""}`}
                    disabled={!canPublish}
                    aria-pressed={l.published}
                    onClick={() => setListingPublished(l.id, !l.published)}
                    title={canPublish ? undefined : "Compte non validé : publication verrouillée"}
                  >
                    {l.published ? "Publiée" : "Brouillon"}
                  </button>
                </td>
              </tr>
            ))}
            {myListings.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[13px] text-[var(--text-muted)]">
                  Aucune annonce pour ce profil. Créez-en une une fois le compte validé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LISTING_GATE_LABEL(status: AccountStatus): string {
  switch (status) {
    case "ACTIF":
      return "Agent certifié";
    case "EN_ATTENTE":
      return "En attente";
    case "REJETE":
      return "Rejeté";
    case "SUSPENDU":
      return "Suspendu";
  }
}