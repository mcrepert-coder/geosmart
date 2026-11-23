"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { ArrowLeft, Briefcase, ImagePlus, LogOut, Plus, RefreshCw, Share2 } from "lucide-react";
import {
  EMPTY_DRAFT,
  listingPayload,
  validateDraft,
  type Draft,
  type ListingStatus as Status,
} from "@/lib/agent-listing-form";
import { errorText, isUnauthorized, readJson } from "@/lib/http";
import { LISTINGS_API_PATH } from "@/lib/listings-api";
import { loginPhone } from "@/lib/phone";
import { formatPrice } from "@/lib/format";
import { LogoMark } from "../logo";
import { PasswordField } from "../password-field";

// Espace agent relie a l'API (EF-301, EF-302, EF-308, CA-5, CA-6) : connexion
// d'un compte AGENT, ses biens, publication rattachee a une parcelle, photos
// et partage. L'API reste juge : un agent non actif ne publie pas (RG-05).

export type AgentActor = {
  id: string;
  role: string;
  accountActive: boolean;
  agentCertified?: boolean;
  fullName?: string;
};

/* Status imported as ListingStatus (alias Status) */

type AgentListing = {
  id: string;
  parcelId: string;
  type: "TERRAIN" | "MAISON";
  transaction: "VENTE" | "LOCATION";
  title: string;
  price: number;
  pricePeriod: "MOIS" | "AN" | null;
  zone: string | null;
  status: Status;
  badges: { parcelCertified: boolean; agentCertified: boolean };
  primaryPhotoUrl: string | null;
};

type SharePayload = {
  publicUrl: string;
  whatsapp: { url: string; message: string };
  // TikTok et Instagram n'ont pas de lien de publication : l'agent copie le
  // lien et publie l'image principale (EF-308).
  tiktok?: { url: string; imageUrl: string | null };
  instagram?: { url: string; imageUrl: string | null };
};

const STATUS_LABEL: Record<Status, string> = {
  BROUILLON: "Brouillon",
  PUBLIE: "Publiée",
  RETIRE: "Retirée",
};

const AgentContext = createContext<AgentActor | null>(null);

export function useAgent(): AgentActor {
  const actor = useContext(AgentContext);
  if (!actor) throw new Error("useAgent hors de AgentLiveShell");
  return actor;
}

export { readJson };

/// Statut affiche a l'agent : il sait pourquoi il peut ou non publier.
export function agentStatusLabel(actor: AgentActor): { label: string; tone: string } {
  if (!actor.accountActive) {
    return { label: "Compte en attente ou suspendu", tone: "gs-badge--warning" };
  }
  return actor.agentCertified
    ? { label: "Agent certifié", tone: "gs-badge--success" }
    : { label: "Agent actif, non certifié", tone: "gs-badge--warning" };
}

export function AgentLiveShell({ children }: { children: React.ReactNode }) {
  const [actor, setActor] = useState<AgentActor | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/agent/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { actor?: AgentActor } | null) => {
        if (active) setActor(body?.actor ?? null);
      })
      .catch(() => {
        if (active) setActor(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="flex-1 p-8">
        <div className="gs-skeleton h-8 w-64" />
      </div>
    );
  }
  if (!actor) return <AgentLogin onLoggedIn={setActor} />;

  const status = agentStatusLabel(actor);
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 md:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Accueil" className="flex items-center gap-2">
            <ArrowLeft size={16} aria-hidden />
            <LogoMark />
          </Link>
          <span className="font-semibold">Espace agent</span>
          <span className={`gs-badge ${status.tone}`}>{status.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--text-muted)]">
            {actor.fullName ?? "Agent"}
          </span>
          <button
            className="gs-btn gs-btn--secondary gs-btn--sm"
            onClick={async () => {
              await fetch("/api/agent/logout", { method: "POST" });
              setActor(null);
            }}
          >
            <LogOut size={15} aria-hidden /> Se déconnecter
          </button>
        </div>
      </header>
      <AgentContext.Provider value={actor}>{children}</AgentContext.Provider>
    </div>
  );
}

function AgentLogin({ onLoggedIn }: { onLoggedIn: (actor: AgentActor) => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const body = await readJson<{ actor: AgentActor }>(
        await fetch("/api/agent/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: loginPhone(phone), password }),
        }),
      );
      onLoggedIn(body.actor);
    } catch (loginError: unknown) {
      setError(errorText(loginError));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="gs-wrap gs-wrap--narrow flex flex-1 items-start justify-center py-12 md:py-20">
      <div className="w-full max-w-md">
        <form className="gs-card gs-form-card" onSubmit={submit}>
          <span className="gs-form-icon">
            <Briefcase size={24} aria-hidden />
          </span>
          <p className="gs-module text-[var(--primary)]">Espace agent</p>
          <h1 className="gs-h1 gs-display mt-2">Connexion</h1>
          <p className="mt-2 text-[14px] text-[var(--text-muted)]">
            Connectez-vous avec votre compte agent validé pour publier vos biens.
          </p>
          <div className="gs-form-stack">
            <div className="gs-field">
              <label className="gs-label" htmlFor="agent-phone">
                Téléphone
              </label>
              <input
                id="agent-phone"
                className="gs-input"
                type="tel"
                inputMode="tel"
                autoComplete="username"
                placeholder="+228 90 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <PasswordField
              id="agent-password"
              label="Mot de passe"
              value={password}
              onChange={setPassword}
            />
            {error && (
              <p className="gs-alert gs-alert--danger" role="alert">
                {error}
              </p>
            )}
            <div className="gs-form-actions">
              <button className="gs-btn gs-btn--primary gs-btn--lg gs-btn--block" disabled={sending}>
                {sending ? "Connexion…" : "Se connecter"}
              </button>
            </div>
          </div>
        </form>
        <p className="gs-help mt-5 text-center">
          Pas encore de compte ?{" "}
          <Link className="font-semibold text-[var(--primary)] underline" href="/devenir-agent">
            Devenir agent
          </Link>
        </p>
      </div>
    </div>
  );
}

export { EMPTY_DRAFT, listingPayload, validateDraft };

export function AgentLiveListings() {
  const actor = useAgent();
  const [items, setItems] = useState<AgentListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [shares, setShares] = useState<Record<string, SharePayload>>({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/agent/properties/mine?pageSize=100", { cache: "no-store" })
      .then((response) => readJson<{ items: AgentListing[] }>(response))
      .then((page) => {
        if (active) setItems(page.items);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        if (isUnauthorized(loadError)) { window.location.reload(); return; }
        setError(errorText(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const reload = () => {
    setLoading(true);
    setVersion((v) => v + 1);
  };

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError("");
    try {
      await action();
      setToast(done);
      reload();
    } catch (actionError: unknown) {
      if (isUnauthorized(actionError)) { window.location.reload(); return; }
      setError(errorText(actionError));
    } finally {
      setBusy(null);
    }
  };

  const create = async (status: Status) => {
    const invalid = validateDraft(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setCreating(true);
    setError("");
    try {
      await readJson(
        await fetch("/api/agent/properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(listingPayload(draft, status)),
        }),
      );
      setDraft(EMPTY_DRAFT);
      setToast(status === "PUBLIE" ? "Bien publié." : "Brouillon enregistré.");
      reload();
    } catch (createError: unknown) {
      if (isUnauthorized(createError)) { window.location.reload(); return; }
      setError(errorText(createError));
    } finally {
      setCreating(false);
    }
  };

  const setStatus = (item: AgentListing, status: Status) =>
    run(
      item.id,
      async () =>
        readJson(
          await fetch(`/api/agent/properties/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }),
        ),
      `Annonce « ${item.title} » : ${STATUS_LABEL[status].toLowerCase()}.`,
    );

  const uploadPhoto = (item: AgentListing, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return run(
      item.id,
      async () =>
        readJson(
          await fetch(`/api/agent/properties/${item.id}/photos`, {
            method: "POST",
            body: form,
          }),
        ),
      "Photo ajoutée.",
    );
  };

  const share = async (item: AgentListing) => {
    if (!LISTINGS_API_PATH) {
      setError("L’adresse de l’API n’est pas configurée pour le partage.");
      return;
    }
    try {
      const payload = await readJson<SharePayload>(
        await fetch(`${LISTINGS_API_PATH}/properties/${item.id}/share`),
      );
      setShares((current) => ({ ...current, [item.id]: payload }));
    } catch (shareError: unknown) {
      if (isUnauthorized(shareError)) { window.location.reload(); return; }
      setError(errorText(shareError));
    }
  };

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="gs-h1 gs-display">Mes biens</h1>
        <button className="gs-btn gs-btn--secondary gs-btn--sm" onClick={reload} disabled={loading}>
          <RefreshCw size={15} aria-hidden /> Actualiser
        </button>
      </div>
      {!actor.accountActive && (
        <p className="gs-alert gs-alert--warning mt-4">
          Votre compte n’est pas actif : la publication est bloquée jusqu’à sa validation par
          l’administration.
        </p>
      )}
      {error && (
        <p className="gs-alert gs-alert--danger mt-4" role="alert">
          {error}
        </p>
      )}
      {toast && (
        <p className="gs-alert gs-alert--success mt-4" role="status">
          {toast}
        </p>
      )}

      <section className="gs-card mt-5 p-4">
        <h2 className="font-semibold">Nouveau bien</h2>
        <p className="gs-help mt-1">
          Le bien est rattaché à une parcelle enregistrée (identifiant TG-XXX-#####). Une parcelle
          en litige ne peut pas être publiée.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="gs-label" htmlFor="lst-parcel">Parcelle</label>
            <input
              id="lst-parcel"
              className="gs-input"
              placeholder="TG-AG3-00457"
              pattern="TG-[A-Za-z0-9]{3}-[0-9]{5,6}"
              required
              {...field("parcelId")}
            />
          </div>
          <div>
            <label className="gs-label" htmlFor="lst-title">Titre</label>
            <input id="lst-title" className="gs-input" required {...field("title")} />
          </div>
          <div>
            <label className="gs-label" htmlFor="lst-type">Type</label>
            <select id="lst-type" className="gs-select" {...field("type")}>
              <option value="TERRAIN">Terrain</option>
              <option value="MAISON">Maison</option>
            </select>
          </div>
          <div>
            <label className="gs-label" htmlFor="lst-tx">Transaction</label>
            <select id="lst-tx" className="gs-select" {...field("transaction")}>
              <option value="VENTE">Vente</option>
              <option value="LOCATION">Location</option>
            </select>
          </div>
          <div>
            <label className="gs-label" htmlFor="lst-price">Prix (FCFA)</label>
            <input
              id="lst-price"
              className="gs-input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              required
              {...field("price")}
            />
          </div>
          {draft.transaction === "LOCATION" && (
            <div>
              <label className="gs-label" htmlFor="lst-period">Période</label>
              <select id="lst-period" className="gs-select" {...field("pricePeriod")}>
                <option value="MOIS">Par mois</option>
                <option value="AN">Par an</option>
              </select>
            </div>
          )}
          <div>
            <label className="gs-label" htmlFor="lst-zone">Quartier</label>
            <input id="lst-zone" className="gs-input" {...field("zone")} />
          </div>
          <div className="md:col-span-2">
            <label className="gs-label" htmlFor="lst-desc">Description</label>
            <textarea id="lst-desc" className="gs-input" rows={3} {...field("description")} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="gs-btn gs-btn--secondary"
            disabled={creating}
            onClick={() => void create("BROUILLON")}
          >
            Enregistrer en brouillon
          </button>
          <button
            className="gs-btn gs-btn--primary"
            disabled={creating || !actor.accountActive}
            onClick={() => void create("PUBLIE")}
          >
            <Plus size={15} aria-hidden /> Publier
          </button>
        </div>
      </section>

      {loading ? (
        <p className="gs-help mt-5" role="status">
          Chargement de vos biens…
        </p>
      ) : items.length === 0 ? (
        <p className="gs-help mt-5">Aucun bien pour l’instant.</p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="gs-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-[13px] text-[var(--text-muted)]">
                    <span className="gs-mono">{item.parcelId}</span> ·{" "}
                    {formatPrice(item.price)}
                    {item.pricePeriod ? ` / ${item.pricePeriod === "MOIS" ? "mois" : "an"}` : ""}
                    {item.zone ? ` · ${item.zone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="gs-badge">{STATUS_LABEL[item.status]}</span>
                  {item.badges.parcelCertified && (
                    <span className="gs-badge gs-badge--cert">Parcelle certifiée</span>
                  )}
                  {item.badges.agentCertified && (
                    <span className="gs-badge gs-badge--cert">Agent certifié</span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {item.status !== "PUBLIE" ? (
                  <button
                    className="gs-btn gs-btn--primary gs-btn--sm"
                    disabled={busy === item.id || !actor.accountActive}
                    onClick={() => void setStatus(item, "PUBLIE")}
                  >
                    Publier
                  </button>
                ) : (
                  <button
                    className="gs-btn gs-btn--secondary gs-btn--sm"
                    disabled={busy === item.id}
                    onClick={() => void setStatus(item, "RETIRE")}
                  >
                    Retirer
                  </button>
                )}
                <label className="gs-btn gs-btn--secondary gs-btn--sm cursor-pointer">
                  <ImagePlus size={15} aria-hidden /> Photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadPhoto(item, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {item.status === "PUBLIE" && (
                  <button
                    className="gs-btn gs-btn--secondary gs-btn--sm"
                    onClick={() => void share(item)}
                  >
                    <Share2 size={15} aria-hidden /> Partager
                  </button>
                )}
              </div>
              {shares[item.id] && (
                <div className="mt-3 grid gap-1 text-[13px]">
                  <a className="underline" href={shares[item.id].publicUrl}>
                    Lien public de l’annonce
                  </a>
                  <a
                    className="underline"
                    href={shares[item.id].whatsapp.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Partager sur WhatsApp
                  </a>
                  {shares[item.id].tiktok?.imageUrl ? (
                    <a
                      className="underline"
                      href={shares[item.id].tiktok!.imageUrl!}
                      target="_blank"
                      rel="noreferrer"
                      download
                    >
                      Image pour TikTok et Instagram (avec le lien public ci-dessus)
                    </a>
                  ) : (
                    <span className="text-[var(--text-muted)]">
                      Ajoutez une photo pour partager sur TikTok et Instagram.
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
