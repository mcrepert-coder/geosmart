"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeCheck,
  FileText,
  IdCard,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  ADMIN_STATS,
  ROLE_LABEL,
  type Account,
  type AccountStatus,
  type Role,
} from "@/lib/data";
import {
  reactivateAccount,
  rejectAccount,
  restoreAccount,
  suspendAccount,
  useDemoStore,
  validateAccount,
} from "@/lib/demo-store";
import { formatDate, formatReceived, isSinceYesterday } from "@/lib/format";
import { useDialog } from "../use-dialog";

const STATUS_LABEL: Record<AccountStatus, string> = {
  EN_ATTENTE: "En attente",
  ACTIF: "Actif",
  REJETE: "Rejeté",
  SUSPENDU: "Suspendu",
};

const STATUS_BADGE: Record<AccountStatus, string> = {
  EN_ATTENTE: "gs-badge--warning",
  ACTIF: "gs-badge--success",
  REJETE: "gs-badge--danger",
  SUSPENDU: "gs-badge--neutral",
};

function StatusBadge({ status }: { status: AccountStatus }) {
  return <span className={`gs-badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>;
}

type Toast = { msg: string; undo?: () => void };
type SortKey = "name" | "role" | "status" | "received";

function pieceIcon(piece: string) {
  if (piece.includes("identité")) return <IdCard size={20} aria-hidden />;
  if (piece.includes("professionnelle")) return <BadgeCheck size={20} aria-hidden />;
  return <FileText size={20} aria-hidden />;
}

function PieceModal({
  account,
  piece,
  onClose,
}: {
  account: Account;
  piece: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(true, onClose, dialogRef);

  const isOrdre = piece.includes("Ordre");
  const isRccm = piece.includes("RCCM");
  const isCarte = piece.includes("professionnelle");

  return (
    <div className="fixed inset-0 z-[1200] grid place-items-center p-4">
      <div className="gs-scrim" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Pièce jointe · ${piece}`}
        className="gs-card gs-rise relative z-10 w-full max-w-md p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="gs-avatar">
              {pieceIcon(piece)}
            </span>
            <div>
              <p className="font-bold">{piece}</p>
              <p className="gs-caption">{account.name}</p>
            </div>
          </div>
          <button className="gs-iconbtn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <p className="gs-demo mt-4 rounded-[10px] px-3 py-2">
          Spécimen de démonstration · aucune pièce réelle n&apos;est stockée.
        </p>
        <div className="mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
          <p className="gs-module text-[var(--text-muted)]">
            {isOrdre
              ? "Ordre des géomètres du Togo"
              : isRccm
                ? "Registre du commerce et du crédit mobilier"
                : isCarte
                  ? "Carte professionnelle d'agent immobilier"
                  : "République togolaise · pièce d'identité"}
          </p>
          <dl className="gs-rows mt-2 text-[14px]">
            <div>
              <dt>Titulaire</dt>
              <dd>{account.name}</dd>
            </div>
            <div>
              <dt>Téléphone</dt>
              <dd className="gs-mono">{account.phone}</dd>
            </div>
            <div>
              <dt>Référence</dt>
              <dd className="gs-mono">
                {isOrdre
                  ? piece.split("· ")[1] ?? "OGT-0000"
                  : isRccm
                    ? `RCCM-LM-${account.id.slice(-3).toUpperCase()}-2026`
                    : isCarte
                      ? `CP-AG-${account.id.slice(-3).toUpperCase()}`
                      : `CNI-${account.id.slice(-3).toUpperCase()}-TG`}
              </dd>
            </div>
            <div>
              <dt>État</dt>
              <dd className="text-[var(--success)]">Lisible · déposée le {formatDate(account.received)}</dd>
            </div>
          </dl>
        </div>
        <p className="gs-help mt-3">Visible par vous et l&apos;administrateur uniquement.</p>
        <button className="gs-btn gs-btn--primary gs-btn--block mt-4" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function AccountPanel({
  account,
  showToast,
}: {
  account: Account;
  showToast: (t: Toast) => void;
}) {
  const [roleDraft, setRoleDraft] = useState<Role>(account.roleAssigned ?? account.roleRequested);
  const [ordreDraft, setOrdreDraft] = useState(account.ordreVerified);
  const [mode, setMode] = useState<"idle" | "reject" | "suspend">("idle");
  const [motif, setMotif] = useState("");
  const [motifError, setMotifError] = useState("");
  const [piece, setPiece] = useState<string | null>(null);

  const canValidate = roleDraft !== "GEOMETRE" || ordreDraft;
  const initials = account.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  const undoable = (prev: Account | null, note: string) =>
    prev
      ? () => {
          restoreAccount(prev, note);
          showToast({ msg: "Décision annulée · état précédent restauré." });
        }
      : undefined;

  const onValidate = () => {
    const prev = validateAccount(account.id, roleDraft, ordreDraft);
    showToast({
      msg: `Compte validé · rôle ${ROLE_LABEL[roleDraft]}`,
      undo: undoable(prev, "validation annulée"),
    });
  };

  const onConfirmMotif = () => {
    if (!motif.trim()) {
      setMotifError("Le motif est obligatoire.");
      return;
    }
    const clean = motif.trim();
    if (mode === "reject") {
      const prev = rejectAccount(account.id, clean);
      showToast({ msg: `Compte rejeté · ${account.name}`, undo: undoable(prev, "rejet annulé") });
    } else {
      const prev = suspendAccount(account.id, clean);
      showToast({ msg: `Compte suspendu · ${account.name}`, undo: undoable(prev, "suspension annulée") });
    }
    setMode("idle");
    setMotif("");
    setMotifError("");
  };

  return (
    <div
      className="gs-card p-5"
      style={{ animation: "gs-slide-left var(--duration-base) var(--ease-standard)" }}
    >
      <div className="flex items-center gap-3">
        <span className="gs-avatar">{initials}</span>
        <div className="min-w-0">
          <p className="gs-h3 gs-display truncate">{account.name}</p>
          <p className="gs-caption mt-0.5">
            Inscrit le {formatDate(account.received)} · téléphone vérifié
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <StatusBadge status={account.status} />
        <span className="gs-caption">Rôle demandé : {ROLE_LABEL[account.roleRequested]}</span>
      </div>

      <p className="gs-module mt-5 text-[var(--text-muted)]">Pièces (visibles par vous seul)</p>
      <div className="mt-2 flex flex-col gap-2">
        {account.pieces.map((p) => {
          return (
            <div key={p} className="gs-file-row">
              <span className="flex-none text-[var(--primary)]">{pieceIcon(p)}</span>
              <span className="min-w-0 flex-1 truncate">{p}</span>
              <button onClick={() => setPiece(p)} className="ml-auto font-semibold text-[var(--primary)] underline">
                Ouvrir
              </button>
            </div>
          );
        })}
      </div>

      {(account.status === "EN_ATTENTE" || account.status === "REJETE") && (
        <>
          <label className="gs-label mt-5" htmlFor={`role-${account.id}`}>
            Rôle attribué
          </label>
          <select
            id={`role-${account.id}`}
            className="gs-select"
            value={roleDraft}
            onChange={(e) => setRoleDraft(e.target.value as Role)}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {roleDraft === "GEOMETRE" && (
            <label className="gs-checkbox mt-4">
              <input
                type="checkbox"
                checked={ordreDraft}
                onChange={(e) => setOrdreDraft(e.target.checked)}
              />
              <span>Géomètre inscrit à l&apos;Ordre (attestation vérifiée)</span>
            </label>
          )}
          <button
            className="gs-btn gs-btn--primary gs-btn--block mt-4"
            disabled={!canValidate}
            onClick={onValidate}
          >
            Valider le compte
          </button>
          {!canValidate && (
            <p className="gs-help mt-2">
              Validation impossible : l&apos;attestation d&apos;inscription à l&apos;Ordre n&apos;est pas vérifiée.
            </p>
          )}
        </>
      )}

      {account.status === "ACTIF" && mode !== "suspend" && (
        <button
          className="gs-btn gs-btn--secondary gs-btn--block mt-4"
          onClick={() => {
            setMode("suspend");
            setMotifError("");
          }}
        >
          Suspendre...
        </button>
      )}

      {account.status === "SUSPENDU" && (
        <button
          className="gs-btn gs-btn--primary gs-btn--block mt-4"
          onClick={() => {
            const prev = reactivateAccount(account.id);
            showToast({
              msg: `Compte réactivé · ${account.name}`,
              undo: undoable(prev, "réactivation annulée"),
            });
          }}
        >
          Réactiver le compte
        </button>
      )}

      {(account.status === "EN_ATTENTE" || account.status === "REJETE") && mode !== "reject" && (
        <button
          className="gs-btn gs-btn--secondary gs-btn--block mt-2"
          onClick={() => {
            setMode("reject");
            setMotifError("");
          }}
        >
          Rejeter...
        </button>
      )}

      {mode !== "idle" && (
        <div className="mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
          <label className="gs-label" htmlFor={`motif-${account.id}`}>
            {mode === "reject" ? "Motif du rejet" : "Motif de la suspension"}
          </label>
          <textarea
            id={`motif-${account.id}`}
            className="gs-input h-auto min-h-[88px] py-3 text-[15px]"
            value={motif}
            aria-invalid={motifError !== ""}
            onChange={(e) => {
              setMotif(e.target.value);
              if (motifError) setMotifError("");
            }}
            placeholder={
              mode === "reject"
                ? "Ex. : attestation de l'Ordre illisible, pièce manquante..."
                : "Ex. : pièces expirées, signalement en cours..."
            }
          />
          {motifError && <p className="gs-error">{motifError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              className={`gs-btn gs-btn--sm flex-1 ${mode === "reject" ? "gs-btn--danger" : "gs-btn--primary"}`}
              onClick={onConfirmMotif}
            >
              {mode === "reject" ? "Confirmer le rejet" : "Confirmer la suspension"}
            </button>
            <button
              className="gs-btn gs-btn--ghost gs-btn--sm"
              onClick={() => {
                setMode("idle");
                setMotif("");
                setMotifError("");
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <p className="gs-help mt-4">
        Un rejet demande un motif. Chaque décision est inscrite au journal.
      </p>

      {piece && <PieceModal account={account} piece={piece} onClose={() => setPiece(null)} />}
    </div>
  );
}

export function ComptesScreen() {
  const { accounts } = useDemoStore();
  const [selectedId, setSelectedId] = useState<string | null>("acc-001");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState<"TOUS" | AccountStatus>("TOUS");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "received", dir: -1 });
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const drawerRef = useRef<HTMLDivElement>(null);
  useDialog(drawerOpen, () => setDrawerOpen(false), drawerRef);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;
  const pending = accounts.filter((a) => a.status === "EN_ATTENTE");
  const sinceYesterday = pending.filter((a) => isSinceYesterday(a.received)).length;
  const suspended = accounts.filter((a) => a.status === "SUSPENDU").length;

  const rows = useMemo(() => {
    const filtered = accounts.filter((a) => filter === "TOUS" || a.status === filter);
    const order: AccountStatus[] = ["EN_ATTENTE", "ACTIF", "REJETE", "SUSPENDU"];
    const dir = sort.dir;
    return [...filtered].sort((a, b) => {
      let v = 0;
      if (sort.key === "name") v = a.name.localeCompare(b.name, "fr");
      if (sort.key === "role") v = ROLE_LABEL[a.roleRequested].localeCompare(ROLE_LABEL[b.roleRequested], "fr");
      if (sort.key === "status") v = order.indexOf(a.status) - order.indexOf(b.status);
      if (sort.key === "received") v = a.received.localeCompare(b.received);
      return v * dir;
    });
  }, [accounts, filter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "received" ? -1 : 1 }));

  const sortIcon = (key: SortKey) =>
    sort.key !== key ? (
      <ArrowUpDown size={13} aria-hidden />
    ) : sort.dir === 1 ? (
      <ArrowUp size={13} aria-hidden />
    ) : (
      <ArrowDown size={13} aria-hidden />
    );

  const select = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1279px)").matches) setDrawerOpen(true);
  };

  const filters: { key: "TOUS" | AccountStatus; label: string; count: number }[] = [
    { key: "TOUS", label: "Tous", count: accounts.length },
    { key: "EN_ATTENTE", label: "En attente", count: pending.length },
    { key: "ACTIF", label: "Actifs", count: accounts.filter((a) => a.status === "ACTIF").length },
    { key: "REJETE", label: "Rejetés", count: accounts.filter((a) => a.status === "REJETE").length },
    { key: "SUSPENDU", label: "Suspendus", count: suspended },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="gs-h1 gs-display">Comptes à valider</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Le rôle est attribué ici et relu en base à chaque requête.
          </p>
        </div>
        <span className="gs-badge gs-badge--primary">Administrateur · LGR</span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <button className="gs-kpi-tile text-left" onClick={() => setFilter("EN_ATTENTE")}>
          <span className="gs-label">En attente</span>
          <span className="gs-kpi gs-display block">{pending.length}</span>
          <span className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--danger)]">
            <TriangleAlert size={13} aria-hidden />
            {sinceYesterday} depuis hier
          </span>
        </button>
        <div className="gs-kpi-tile">
          <span className="gs-label">Géomètres inscrits</span>
          <span className="gs-kpi gs-display block">{ADMIN_STATS.geometresInscrits}</span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
            sur {ADMIN_STATS.geometresTotal} géomètres
          </span>
        </div>
        <div className="gs-kpi-tile">
          <span className="gs-label">Agents certifiés</span>
          <span className="gs-kpi gs-display block">{ADMIN_STATS.agentsCertifies}</span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
            sur {ADMIN_STATS.agentsTotal} agents
          </span>
        </div>
        <button className="gs-kpi-tile text-left" onClick={() => setFilter("SUSPENDU")}>
          <span className="gs-label">Suspendus</span>
          <span className="gs-kpi gs-display block">{suspended}</span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">motifs au journal</span>
        </button>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
            {filters.map((f) => (
              <button
                key={f.key}
                className={`gs-chip ${filter === f.key ? "gs-chip--active" : ""}`}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label} · {f.count}
              </button>
            ))}
          </div>
          <div className="gs-card gs-card--flush mt-3 overflow-x-auto">
            <table className="gs-table">
              <thead>
                <tr>
                  <th>
                    <button onClick={() => toggleSort("name")}>Demandeur {sortIcon("name")}</button>
                  </th>
                  <th>
                    <button onClick={() => toggleSort("role")}>Rôle demandé {sortIcon("role")}</button>
                  </th>
                  <th>Pièces</th>
                  <th>
                    <button onClick={() => toggleSort("status")}>Statut {sortIcon("status")}</button>
                  </th>
                  <th className="text-right">
                    <button onClick={() => toggleSort("received")}>Reçu {sortIcon("received")}</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    aria-selected={a.id === selectedId}
                    tabIndex={0}
                    onClick={() => select(a.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select(a.id);
                      }
                    }}
                  >
                    <td>
                      <p className="font-semibold">{a.name}</p>
                      <p className="gs-data-sm mt-0.5 whitespace-nowrap text-[var(--text-muted)]">{a.phone}</p>
                    </td>
                    <td>{ROLE_LABEL[a.roleRequested]}</td>
                    <td className="text-[13px] text-[var(--text-muted)]">{a.pieces.join(" · ")}</td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="text-right">{formatReceived(a.received)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-[var(--text-muted)]">
                      Aucun compte dans ce filtre.
                      <button className="gs-btn gs-btn--ghost gs-btn--sm ml-2" onClick={() => setFilter("TOUS")}>
                        Tout afficher
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sticky top-4 hidden xl:block">
          {selected ? (
            <AccountPanel key={selected.id} account={selected} showToast={setToast} />
          ) : (
            <div className="gs-card p-5 text-[14px] text-[var(--text-muted)]">
              Sélectionnez une ligne pour examiner les pièces et décider.
            </div>
          )}
        </div>
      </div>

      {drawerOpen && selected && (
        <div className="xl:hidden">
          <div className="gs-scrim" onClick={() => setDrawerOpen(false)} />
          <div
            ref={drawerRef}
            className="gs-drawer overflow-y-auto p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Compte · ${selected.name}`}
          >
            <div className="mb-3 flex justify-end">
              <button className="gs-iconbtn" onClick={() => setDrawerOpen(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <AccountPanel key={selected.id} account={selected} showToast={setToast} />
          </div>
        </div>
      )}

      {toast && (
        <div className="gs-toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              onClick={() => {
                const u = toast.undo;
                setToast(null);
                u?.();
              }}
            >
              Annuler
            </button>
          )}
          <button aria-label="Fermer" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}