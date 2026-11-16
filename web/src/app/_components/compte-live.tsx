"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileUp, LogOut } from "lucide-react";

// Mon compte (EF-403) : tout compte se connecte, y compris en attente de
// validation, pour deposer ses pieces justificatives. Sans elles,
// l'administration ne peut pas valider le compte.

type Actor = {
  id: string;
  role: string;
  accountActive: boolean;
  registeredSurveyor?: boolean;
  agentCertified?: boolean;
  fullName?: string;
};

type Category = "IDENTITY" | "PROFESSIONAL_CARD" | "APPROVAL" | "RCCM" | "ORDER_REGISTRATION";

type DocumentInfo = {
  id: string;
  category: Category;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

export const CATEGORY_LABEL: Record<Category, string> = {
  IDENTITY: "Pièce d’identité",
  PROFESSIONAL_CARD: "Carte professionnelle",
  APPROVAL: "Agrément",
  RCCM: "RCCM",
  ORDER_REGISTRATION: "Attestation d’inscription à l’Ordre",
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrateur",
  GEOMETRE: "Géomètre",
  TOPOGRAPHE: "Topographe",
  AGENT: "Agent immobilier",
  CLIENT: "Client",
};

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

/// Pieces exigees par l'administration pour valider le compte (EF-403).
export function requiredDocuments(role: string): string[] {
  const required = ["la pièce d’identité"];
  if (role === "AGENT") {
    required.push("une pièce professionnelle (carte professionnelle, agrément ou RCCM)");
  }
  if (role === "GEOMETRE") required.push("l’attestation d’inscription à l’Ordre");
  return required;
}

/// Contrôle avant envoi, comme le serveur : JPEG, PNG ou PDF, 5 Mo au plus.
export function fileProblem(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Format accepté : JPEG, PNG ou PDF.";
  if (file.size > MAX_DOCUMENT_BYTES) return "Le fichier dépasse 5 Mo.";
  if (file.size === 0) return "Le fichier est vide.";
  return null;
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String(body.message)
        : `Erreur du serveur (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AccountLiveScreen() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/compte/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { actor?: Actor } | null) => {
        if (active) setActor(body?.actor ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (checking) return <div className="gs-skeleton mx-auto mt-10 h-8 w-64" />;
  if (!actor) return <AccountLogin onLoggedIn={setActor} />;
  return <AccountPanel actor={actor} onLogout={() => setActor(null)} />;
}

function AccountLogin({ onLoggedIn }: { onLoggedIn: (actor: Actor) => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const body = await readJson<{ actor: Actor }>(
        await fetch("/api/compte/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password }),
        }),
      );
      onLoggedIn(body.actor);
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm p-6 md:p-10">
      <h1 className="gs-h1 gs-display">Se connecter</h1>
      <p className="mt-2 text-[13px] text-[var(--text-muted)]">
        Un compte en attente de validation peut se connecter pour déposer ses pièces
        justificatives.
      </p>
      <form className="gs-card mt-5 grid gap-3 p-4" onSubmit={submit}>
        <label className="gs-label" htmlFor="acc-phone">Téléphone</label>
        <input id="acc-phone" className="gs-input" autoComplete="username" value={phone}
          onChange={(e) => setPhone(e.target.value)} />
        <label className="gs-label" htmlFor="acc-password">Mot de passe</label>
        <input id="acc-password" className="gs-input" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="gs-alert gs-alert--danger" role="alert">{error}</p>}
        <button className="gs-btn gs-btn--primary" disabled={sending}>
          {sending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
      <p className="mt-4 text-[13px]">
        Pas encore de compte ? <Link className="underline" href="/inscription">Créer un compte</Link>
      </p>
    </div>
  );
}

function AccountPanel({ actor, onLogout }: { actor: Actor; onLogout: () => void }) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category>("IDENTITY");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sending, setSending] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/compte/documents", { cache: "no-store" })
      .then((r) => readJson<DocumentInfo[]>(r))
      .then((list) => {
        if (active) setDocuments(list);
      })
      .catch((e: unknown) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const upload = async () => {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError("");
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("file", file);
      await readJson(await fetch("/api/compte/documents", { method: "POST", body: form }));
      setFile(null);
      setToast(`${CATEGORY_LABEL[category]} déposée.`);
      setLoading(true);
      setVersion((v) => v + 1);
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  const roleLabel = ROLE_LABEL[actor.role] ?? "Rôle à attribuer par l’administration";

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="gs-h1 gs-display">Mon compte</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            {actor.fullName ?? "Compte"} · {roleLabel}
          </p>
        </div>
        <button className="gs-btn gs-btn--secondary gs-btn--sm" onClick={async () => {
          await fetch("/api/compte/logout", { method: "POST" });
          onLogout();
        }}>
          <LogOut size={15} aria-hidden /> Se déconnecter
        </button>
      </div>

      {actor.accountActive ? (
        <p className="gs-alert gs-alert--success mt-4">Compte validé et actif.</p>
      ) : (
        <p className="gs-alert gs-alert--warning mt-4">
          Compte en attente de validation (ou suspendu). Pour être validé, déposez{" "}
          {requiredDocuments(actor.role).join(" et ")}.
        </p>
      )}

      {actor.accountActive && actor.role === "AGENT" && (
        <Link className="gs-btn gs-btn--primary mt-4" href="/agent">Ouvrir l’espace agent</Link>
      )}
      {actor.accountActive && actor.role === "ADMIN" && (
        <Link className="gs-btn gs-btn--primary mt-4" href="/admin">Ouvrir l’administration</Link>
      )}

      <section className="gs-card mt-5 p-4">
        <h2 className="font-semibold">Pièces justificatives</h2>
        <p className="gs-help mt-1">
          JPEG, PNG ou PDF, 5 Mo au plus. Vos pièces ne sont visibles que par vous et par
          l’administration.
        </p>
        {error && <p className="gs-alert gs-alert--danger mt-3" role="alert">{error}</p>}
        {toast && <p className="gs-alert gs-alert--success mt-3" role="status">{toast}</p>}
        {loading ? (
          <p className="gs-help mt-3">Chargement…</p>
        ) : documents.length === 0 ? (
          <p className="gs-help mt-3">Aucune pièce déposée.</p>
        ) : (
          <ul className="mt-3 grid gap-1 text-[14px]">
            {documents.map((d) => (
              <li key={d.id}>
                {CATEGORY_LABEL[d.category] ?? d.category} ·{" "}
                <span className="text-[var(--text-muted)]">
                  {new Date(d.uploadedAt).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label className="gs-label" htmlFor="doc-category">Type de pièce</label>
            <select id="doc-category" className="gs-select" value={category}
              onChange={(e) => setCategory(e.target.value as Category)}>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="gs-label" htmlFor="doc-file">Fichier</label>
            <input id="doc-file" className="gs-input" type="file" accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <button className="gs-btn gs-btn--primary" disabled={!file || sending} onClick={() => void upload()}>
            <FileUp size={15} aria-hidden /> {sending ? "Envoi…" : "Déposer"}
          </button>
        </div>
      </section>
    </div>
  );
}
