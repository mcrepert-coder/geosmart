"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/data";
import { PasswordField } from "../password-field";

type AdminActor = {
  id: string;
  role: "ADMIN";
  accountActive: true;
  fullName?: string;
};

type AccountStatus =
  "TELEPHONE_NON_VERIFIE" | "EN_ATTENTE" | "ACTIF" | "REJETE" | "SUSPENDU";

type AdminAccount = {
  id: string;
  phone: string;
  status: AccountStatus;
  role: Role | null;
  rejectionReason: string | null;
  createdAt: string;
};

type AdminDocument = {
  id: string;
  category:
    | "IDENTITY"
    | "PROFESSIONAL_CARD"
    | "APPROVAL"
    | "RCCM"
    | "ORDER_REGISTRATION";
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

type AuditEntry = {
  seq: number;
  at: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: "SUCCESS" | "REJECTED" | "DENIED";
  details: Record<string, unknown>;
  prevHash: string;
  hash: string;
};

type AuditCheck = {
  valid: boolean;
  checked: number;
  firstBrokenSeq: number | null;
};

const DOCUMENT_LABEL: Record<AdminDocument["category"], string> = {
  IDENTITY: "Pièce d’identité",
  PROFESSIONAL_CARD: "Carte professionnelle",
  APPROVAL: "Agrément",
  RCCM: "RCCM",
  ORDER_REGISTRATION: "Inscription à l’Ordre",
};

function requiredDocumentHelp(role: Role): string {
  if (role === "AGENT") {
    return "Pièce d’identité et au moins une pièce professionnelle : carte, agrément ou RCCM.";
  }
  if (role === "GEOMETRE") {
    return "Pièce d’identité et attestation d’inscription à l’Ordre.";
  }
  return "Pièce d’identité obligatoire.";
}

const STATUS_LABEL: Record<AccountStatus, string> = {
  TELEPHONE_NON_VERIFIE: "Téléphone non vérifié",
  EN_ATTENTE: "En attente",
  ACTIF: "Actif",
  REJETE: "Rejeté",
  SUSPENDU: "Suspendu",
};

const STATUS_STYLE: Record<AccountStatus, string> = {
  TELEPHONE_NON_VERIFIE: "gs-badge--neutral",
  EN_ATTENTE: "gs-badge--warning",
  ACTIF: "gs-badge--success",
  REJETE: "gs-badge--danger",
  SUSPENDU: "gs-badge--neutral",
};

const ASSIGNABLE_ROLES: Role[] = ["CLIENT", "AGENT", "TOPOGRAPHE", "GEOMETRE"];

function messageOf(value: unknown): string {
  if (typeof value !== "object" || value === null || !("message" in value)) {
    return "Une erreur inattendue est survenue.";
  }
  const message = value.message;
  if (typeof message === "string") return message;
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === "string")
  ) {
    return message.join(" ");
  }
  return "Une erreur inattendue est survenue.";
}

async function responseJson<T>(response: Response): Promise<T> {
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageOf(result));
  if (result === null) throw new Error("Réponse vide du serveur.");
  return result as T;
}

export function AdminLoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      await responseJson<{ actor: AdminActor }>(response);
      router.replace("/admin");
      router.refresh();
    } catch (loginError: unknown) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Connexion impossible.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gs-wrap gs-wrap--narrow flex flex-1 items-start justify-center py-12 md:py-20">
      <form className="gs-card gs-form-card w-full max-w-md" onSubmit={submit}>
        <span className="gs-form-icon">
          <ShieldCheck size={24} aria-hidden />
        </span>
        <p className="gs-module text-[var(--primary)]">Espace sécurisé</p>
        <h1 className="gs-h1 gs-display mt-2">Administration</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Connectez-vous avec un compte administrateur actif.
        </p>
        <div className="gs-form-stack">
          <div className="gs-field">
            <label className="gs-label" htmlFor="admin-phone">
              Téléphone
            </label>
            <input
              id="admin-phone"
              className="gs-input"
              type="tel"
              inputMode="tel"
              autoComplete="username"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <PasswordField
            id="admin-password"
            label="Mot de passe"
            value={password}
            required
            onChange={setPassword}
          />
          {error && (
            <p className="gs-alert gs-alert--danger" role="alert">
              {error}
            </p>
          )}
          <div className="gs-form-actions">
            <button
              className="gs-btn gs-btn--primary gs-btn--lg gs-btn--block"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Connexion..." : "Se connecter"}
            </button>
            <Link href="/" className="gs-btn gs-btn--ghost gs-btn--block">
              <ArrowLeft size={16} aria-hidden /> Retour au site public
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}

export function AdminLiveShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname === "/admin/connexion";
  const supportedPath =
    pathname === "/admin" ||
    pathname === "/admin/comptes" ||
    pathname === "/admin/journal" ||
    pathname === "/admin/alertes" ||
    pathname === "/admin/connexion";
  const [actor, setActor] = useState<AdminActor | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const result = await responseJson<{ actor: AdminActor }>(response);
        return result.actor;
      })
      .then((current) => {
        if (!active) return;
        setActor(current);
        if (!current && !onLogin) router.replace("/admin/connexion");
        if (current && onLogin) router.replace("/admin");
      })
      .catch(() => {
        if (active)
          setError("Impossible de joindre le service d’authentification.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [onLogin, pathname, router]);

  if (onLogin) return <AdminLoginScreen />;
  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status">
        <LoaderCircle
          className="animate-spin text-[var(--primary)]"
          size={28}
        />
        <span className="sr-only">Vérification de la session</span>
      </div>
    );
  }
  if (!actor) {
    return (
      <div className="gs-wrap flex flex-1 items-center justify-center">
        <div className="gs-card max-w-lg p-6 text-center">
          <p className="gs-h3">Connexion administrateur requise</p>
          <p className="gs-help mt-2" role={error ? "alert" : "status"}>
            {error || "Redirection vers la connexion..."}
          </p>
          {error && (
            <button
              className="gs-btn gs-btn--secondary mt-4"
              onClick={() => router.replace("/admin/connexion")}
            >
              Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!supportedPath) return <AdminUnavailableScreen />;

  const links = [
    { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
    { href: "/admin/alertes", label: "Alertes", icon: TriangleAlert },
    { href: "/admin/comptes", label: "Comptes", icon: Users },
    { href: "/admin/journal", label: "Journal", icon: ScrollText },
  ];

  return (
    <div className="flex flex-1 items-stretch">
      <aside className="gs-sidebar sticky top-0 flex h-screen flex-col overflow-y-auto">
        <Link href="/admin" className="mb-6 flex items-center gap-3 px-2">
          <span className="gs-avatar h-9 w-9 text-sm">GS</span>
          <span className="gs-logotype-text text-[17px] font-bold text-white">
            GeoSmart Field
          </span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Administration">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="gs-side-link"
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={19} aria-hidden />
              <span className="gs-side-label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 pt-6">
          <div className="px-2 text-[13px] leading-5 text-[#cfdde6]">
            Administrateur
            <br />
            <span className="text-[#7f97a6]">{actor.fullName ?? actor.id}</span>
          </div>
          <button
            className="gs-side-link text-left"
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" });
              router.replace("/admin/connexion");
              router.refresh();
            }}
          >
            <LogOut size={19} aria-hidden />
            <span className="gs-side-label">Se déconnecter</span>
          </button>
          <Link href="/" className="gs-side-link">
            <ArrowLeft size={19} aria-hidden />
            <span className="gs-side-label">Retour au site</span>
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export function AdminLiveDashboard() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/accounts", { cache: "no-store" })
      .then((response) => responseJson<AdminAccount[]>(response))
      .then(setAccounts)
      .catch((loadError: unknown) => setError(messageOf(loadError)))
      .finally(() => setLoading(false));
  }, []);

  const pending = accounts.filter((account) => account.status === "EN_ATTENTE");
  const active = accounts.filter((account) => account.status === "ACTIF");
  const tiles = [
    { label: "Comptes en attente", value: pending.length },
    { label: "Comptes actifs", value: active.length },
    { label: "Total des comptes", value: accounts.length },
  ];

  return (
    <div className="p-4 md:p-8">
      <h1 className="gs-h1 gs-display">Tableau de bord</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Données chargées depuis le service d’administration.
      </p>
      {error && (
        <p className="gs-alert gs-alert--danger mt-5" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="gs-help mt-6" role="status">Chargement des comptes…</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {tiles.map((tile) => (
              <div key={tile.label} className="gs-kpi-tile">
                <span className="gs-label">{tile.label}</span>
                <span className="gs-kpi gs-display block">{tile.value}</span>
              </div>
            ))}
          </div>
          <section className="gs-card mt-6 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="gs-h3 gs-display">Demandes à traiter</h2>
              <Link
                href="/admin/comptes"
                className="font-semibold text-[var(--primary)] underline"
              >
                Ouvrir les comptes
              </Link>
            </div>
            {pending.length === 0 ? (
              <p className="gs-help mt-4">Aucun compte en attente.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--border)]">
                {pending.slice(0, 5).map((account) => (
                  <li
                    key={account.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <span className="gs-mono">{account.phone}</span>
                    <span className="gs-caption">
                      {account.role
                        ? ROLE_LABEL[account.role]
                        : "Rôle à attribuer"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function AdminLiveAccounts() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [documents, setDocuments] = useState<Record<string, AdminDocument[]>>(
    {},
  );
  const [documentsOpen, setDocumentsOpen] = useState<Record<string, boolean>>(
    {},
  );
  const [documentsBusy, setDocumentsBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchAccounts = async () =>
    responseJson<AdminAccount[]>(
      await fetch("/api/admin/accounts", { cache: "no-store" }),
    );

  const loadAccounts = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAccounts();
      setAccounts(data);
      setRoles((current) => ({
        ...Object.fromEntries(
          data
            .filter((account) => account.role)
            .map((account) => [account.id, account.role as Role]),
        ),
        ...current,
      }));
    } catch (loadError: unknown) {
      setError(messageOf(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchAccounts()
      .then((data) => {
        if (active) setAccounts(data);
      })
      .catch((loadError: unknown) => {
        if (active) setError(messageOf(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const shown = useMemo(
    () =>
      statusFilter === "ALL"
        ? accounts
        : accounts.filter((account) => account.status === statusFilter),
    [accounts, statusFilter],
  );

  const action = async (
    account: AdminAccount,
    actionPath: string,
    method: "POST" | "PUT",
    body?: object,
  ) => {
    setBusy(account.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/accounts/${encodeURIComponent(account.id)}/${actionPath}`,
        {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      await responseJson<AdminAccount>(response);
      setNotice("La modification a été enregistrée.");
      await loadAccounts();
    } catch (actionError: unknown) {
      setError(messageOf(actionError));
    } finally {
      setBusy(null);
    }
  };

  const toggleDocuments = async (accountId: string) => {
    if (documentsOpen[accountId]) {
      setDocumentsOpen((current) => ({ ...current, [accountId]: false }));
      return;
    }
    setDocumentsOpen((current) => ({ ...current, [accountId]: true }));
    if (documents[accountId]) return;

    setDocumentsBusy(accountId);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/accounts/${encodeURIComponent(accountId)}/documents`,
        { cache: "no-store" },
      );
      const result = await responseJson<AdminDocument[]>(response);
      setDocuments((current) => ({ ...current, [accountId]: result }));
    } catch (loadError: unknown) {
      setDocumentsOpen((current) => ({ ...current, [accountId]: false }));
      setError(messageOf(loadError));
    } finally {
      setDocumentsBusy(null);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="gs-h1 gs-display">Comptes</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Attribuez un rôle, approuvez ou rejetez les demandes depuis l’API.
          </p>
        </div>
        <button
          className="gs-btn gs-btn--secondary gs-btn--sm"
          onClick={() => void loadAccounts()}
          disabled={loading}
        >
          <RefreshCw size={15} aria-hidden /> Actualiser
        </button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="gs-label mb-0" htmlFor="admin-account-status">
          État
        </label>
        <select
          id="admin-account-status"
          className="gs-select w-auto"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="ALL">Tous les comptes</option>
          {Object.entries(STATUS_LABEL).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
        <span className="gs-caption">{shown.length} compte(s)</span>
      </div>
      {error && (
        <p className="gs-alert gs-alert--danger mt-4" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="gs-alert gs-alert--success mt-4" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="gs-help mt-6" role="status">Chargement des comptes…</p>
      ) : shown.length === 0 ? (
        <div className="gs-card mt-5 p-6 text-center">
          <p className="gs-h3">Aucun compte pour ce filtre</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {shown.map((account) => {
            const role = roles[account.id] ?? account.role ?? "CLIENT";
            const canReview =
              account.status === "EN_ATTENTE" || account.status === "SUSPENDU";
            return (
              <article className="gs-card p-5" key={account.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="gs-h3 gs-mono">{account.phone}</p>
                    <p className="gs-caption mt-1">
                      Inscription :{" "}
                      {new Date(account.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <span className={`gs-badge ${STATUS_STYLE[account.status]}`}>
                    {STATUS_LABEL[account.status]}
                  </span>
                </div>
                {account.rejectionReason && (
                  <p className="gs-alert gs-alert--warning mt-4">
                    Motif : {account.rejectionReason}
                  </p>
                )}
                <section className="mt-4 border-t border-[var(--border)] pt-4">
                  <button
                    className="gs-btn gs-btn--secondary gs-btn--sm"
                    type="button"
                    disabled={documentsBusy === account.id}
                    onClick={() => void toggleDocuments(account.id)}
                  >
                    {documentsBusy === account.id
                      ? "Chargement des pièces…"
                      : documentsOpen[account.id]
                        ? "Masquer les pièces justificatives"
                        : "Examiner les pièces justificatives"}
                  </button>
                  {documentsOpen[account.id] &&
                    (documentsBusy === account.id ? (
                      <p className="gs-help mt-3" role="status">Chargement…</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {(documents[account.id] ?? []).map((document) => (
                          <li
                            key={document.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3"
                          >
                            <span>
                              <span className="block font-medium">
                                {DOCUMENT_LABEL[document.category]}
                              </span>
                              <span className="gs-caption">
                                {(document.sizeBytes / 1024).toFixed(0)} Ko ·{" "}
                                {new Date(
                                  document.uploadedAt,
                                ).toLocaleDateString("fr-FR")}
                              </span>
                            </span>
                            <a
                              className="gs-btn gs-btn--ghost gs-btn--sm"
                              href={`/api/admin/accounts/${encodeURIComponent(account.id)}/documents/${encodeURIComponent(document.id)}/content`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink size={15} aria-hidden /> Consulter
                            </a>
                          </li>
                        ))}
                        {documents[account.id]?.length === 0 && (
                          <li className="gs-help">
                            Aucune pièce justificative déposée.
                          </li>
                        )}
                      </ul>
                    ))}
                </section>
                {canReview && (
                  <>
                    <p className="gs-help mt-4">
                      Pour approuver : {requiredDocumentHelp(role)}
                    </p>
                    <label
                      className="gs-label mt-5"
                      htmlFor={`role-${account.id}`}
                    >
                      Rôle à attribuer
                    </label>
                    <select
                      id={`role-${account.id}`}
                      className="gs-select"
                      value={role}
                      disabled={busy === account.id}
                      onChange={(event) =>
                        setRoles((current) => ({
                          ...current,
                          [account.id]: event.target.value as Role,
                        }))
                      }
                    >
                      {ASSIGNABLE_ROLES.map((value) => (
                        <option key={value} value={value}>
                          {ROLE_LABEL[value]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="gs-btn gs-btn--secondary mt-3"
                      disabled={busy === account.id}
                      onClick={() =>
                        void action(account, "role", "PUT", { role })
                      }
                    >
                      Attribuer ce rôle
                    </button>
                    <label
                      className="gs-label mt-4"
                      htmlFor={`reason-${account.id}`}
                    >
                      Motif de rejet (si nécessaire)
                    </label>
                    <textarea
                      id={`reason-${account.id}`}
                      className="gs-input min-h-20"
                      value={reasons[account.id] ?? ""}
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [account.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="gs-btn gs-btn--primary"
                        disabled={busy === account.id || !account.role}
                        title={
                          !account.role
                            ? "Attribuez d’abord un rôle à ce compte."
                            : undefined
                        }
                        onClick={() => void action(account, "validate", "POST")}
                      >
                        Approuver le compte
                      </button>
                      {account.status === "EN_ATTENTE" && (
                        <button
                          className="gs-btn gs-btn--danger"
                          disabled={
                            busy === account.id || !reasons[account.id]?.trim()
                          }
                          onClick={() =>
                            void action(account, "reject", "POST", {
                              reason: reasons[account.id].trim(),
                            })
                          }
                        >
                          Rejeter
                        </button>
                      )}
                    </div>
                  </>
                )}
                {account.status === "ACTIF" && (
                  <button
                    className="gs-btn gs-btn--danger mt-4"
                    disabled={busy === account.id}
                    onClick={() => void action(account, "suspend", "POST")}
                  >
                    Suspendre le compte
                  </button>
                )}
                {busy === account.id && (
                  <span className="gs-caption mt-3 inline-flex items-center gap-2">
                    <LoaderCircle className="animate-spin" size={14} />{" "}
                    Enregistrement…
                  </span>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminUnavailableScreen() {
  return (
    <div className="gs-wrap flex flex-1 items-center justify-center py-16">
      <div className="gs-card max-w-xl p-6">
        <h1 className="gs-h3">
          Cette rubrique n’est pas encore reliée à l’API
        </h1>
        <p className="gs-help mt-2">
          Les données de démonstration sont désactivées. Pour le moment, seules
          la connexion administrateur, le tableau de bord des comptes et la
          gestion des comptes sont connectés.
        </p>
      </div>
    </div>
  );
}

export function AdminLiveJournal() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [check, setCheck] = useState<AuditCheck | null>(null);
  const [resourceType, setResourceType] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const requestEntries = async () =>
    responseJson<AuditEntry[]>(
      await fetch("/api/admin/audit?limit=500", { cache: "no-store" }),
    );

  const requestChainCheck = async () =>
    responseJson<AuditCheck>(
      await fetch("/api/admin/audit?verify=true", { cache: "no-store" }),
    );

  const loadEntries = async () => {
    setLoading(true);
    setError("");
    try {
      setEntries(await requestEntries());
    } catch (loadError: unknown) {
      setError(messageOf(loadError));
    } finally {
      setLoading(false);
    }
  };

  const verifyChain = async () => {
    setChecking(true);
    setError("");
    try {
      setCheck(await requestChainCheck());
    } catch (checkError: unknown) {
      setError(messageOf(checkError));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    let active = true;
    requestEntries()
      .then((result) => {
        if (active) setEntries(result);
      })
      .catch((loadError: unknown) => {
        if (active) setError(messageOf(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    requestChainCheck()
      .then((result) => {
        if (active) setCheck(result);
      })
      .catch((checkError: unknown) => {
        if (active) setError(messageOf(checkError));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const resources = useMemo(
    () => [...new Set(entries.map((entry) => entry.resourceType))].sort(),
    [entries],
  );
  const shown =
    resourceType === "ALL"
      ? entries
      : entries.filter((entry) => entry.resourceType === resourceType);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="gs-h1 gs-display">Journal d’audit</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Événements réels enregistrés par l’API, affichés du plus récent au
            plus ancien.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="gs-btn gs-btn--secondary gs-btn--sm"
            onClick={() => void loadEntries()}
            disabled={loading}
          >
            <RefreshCw size={15} aria-hidden /> Actualiser
          </button>
          <button
            className="gs-btn gs-btn--secondary gs-btn--sm"
            onClick={() => void verifyChain()}
            disabled={checking}
          >
            {checking ? "Vérification…" : "Vérifier la chaîne"}
          </button>
        </div>
      </div>
      {error && (
        <p className="gs-alert gs-alert--danger mt-4" role="alert">
          {error}
        </p>
      )}
      {check && (
        <p
          className={`gs-alert mt-4 ${check.valid ? "gs-alert--success" : "gs-alert--danger"}`}
          role="status"
        >
          {check.valid
            ? `Chaîne intègre · ${check.checked} entrée(s) vérifiée(s).`
            : `Rupture détectée à l’entrée ${check.firstBrokenSeq ?? "inconnue"} · ${check.checked} entrée(s) vérifiée(s).`}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="gs-label mb-0" htmlFor="audit-resource">
          Type de ressource
        </label>
        <select
          id="audit-resource"
          className="gs-select w-auto"
          value={resourceType}
          onChange={(event) => setResourceType(event.target.value)}
        >
          <option value="ALL">Toutes</option>
          {resources.map((resource) => (
            <option key={resource} value={resource}>
              {resource}
            </option>
          ))}
        </select>
        <span className="gs-caption">{shown.length} entrée(s)</span>
      </div>
      {loading ? (
        <p className="gs-help mt-5" role="status">Chargement du journal…</p>
      ) : (
        <div className="gs-card gs-card--flush mt-4 overflow-x-auto">
          <table className="gs-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Action</th>
                <th>Ressource</th>
                <th>Résultat</th>
                <th>Acteur</th>
                <th>Détails</th>
                <th>Empreinte</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => (
                <tr key={entry.seq}>
                  <td className="gs-mono">{entry.seq}</td>
                  <td className="whitespace-nowrap">
                    {new Date(entry.at).toLocaleString("fr-FR")}
                  </td>
                  <td>{entry.action}</td>
                  <td>
                    {entry.resourceType}
                    {entry.resourceId && (
                      <span className="gs-caption block">
                        {entry.resourceId}
                      </span>
                    )}
                  </td>
                  <td>{entry.result}</td>
                  <td>
                    {entry.actorId ?? "Système"}
                    {entry.actorRole && (
                      <span className="gs-caption block">
                        {entry.actorRole}
                      </span>
                    )}
                  </td>
                  <td>
                    <details>
                      <summary className="cursor-pointer">Voir</summary>
                      <pre className="mt-2 max-w-sm whitespace-pre-wrap break-words text-xs">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </details>
                  </td>
                  <td className="gs-mono" title={entry.hash}>
                    {entry.hash.slice(0, 12)}…
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-[var(--text-muted)]"
                  >
                    Aucune entrée dans le journal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
