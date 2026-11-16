"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { LegalStatus } from "@/lib/data";
import { formatSurface } from "@/lib/format";
import { CertBadge, LegalBadge } from "../badges";

// Ecran W3 relie a l'API : alertes de chevauchement lues dans le journal
// (GET /overlap-alerts) et examen par l'administrateur
// (POST /overlap-alerts/{auditSeq}/review). Lecture seule sur les limites.

type Conflict = {
  parcelId: string;
  overlapAreaM2: number;
  version?: number | null;
  legalStatus?: LegalStatus | null;
  certified?: boolean | null;
};

type LiveAlert = {
  auditSeq: number;
  at: string;
  actorId?: string | null;
  submittedParcelId?: string | null;
  surveySessionId?: string | null;
  conflicts: Conflict[];
  review?: { reviewedBy: string; reviewedAt: string; note?: string | null } | null;
};

type StateFilter = "open" | "reviewed" | "all";

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `Erreur du serveur (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export function alertsUrl(state: StateFilter): string {
  return state === "all"
    ? "/api/admin/overlap-alerts?limit=200"
    : `/api/admin/overlap-alerts?state=${state}&limit=200`;
}

export function AdminLiveAlerts() {
  const [state, setState] = useState<StateFilter>("open");
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  const load = async (filter: StateFilter) => {
    setLoading(true);
    setError("");
    try {
      setAlerts(
        await readJson<LiveAlert[]>(
          await fetch(alertsUrl(filter), { cache: "no-store" }),
        ),
      );
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetch(alertsUrl(state), { cache: "no-store" })
      .then((response) => readJson<LiveAlert[]>(response))
      .then((result) => {
        if (active) setAlerts(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const review = async (alert: LiveAlert) => {
    setSending(alert.auditSeq);
    setError("");
    try {
      const note = notes[alert.auditSeq]?.trim();
      await readJson<LiveAlert>(
        await fetch(`/api/admin/overlap-alerts/${alert.auditSeq}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(note ? { note } : {}),
        }),
      );
      setToast(`Alerte n° ${alert.auditSeq} marquée examinée et journalisée.`);
      await load(state);
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : String(reviewError));
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="gs-h1 gs-display">Alertes de chevauchement</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Levés refusés parce qu’ils chevauchent une parcelle existante (RG-02). L’examen est
            journalisé ; aucune limite n’est modifiée ici.
          </p>
        </div>
        <button
          className="gs-btn gs-btn--secondary gs-btn--sm"
          onClick={() => void load(state)}
          disabled={loading}
        >
          <RefreshCw size={15} aria-hidden /> Actualiser
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="gs-label mb-0" htmlFor="alert-state">
          Afficher
        </label>
        <select
          id="alert-state"
          className="gs-select w-auto"
          value={state}
          onChange={(event) => {
            setLoading(true);
            setError("");
            setState(event.target.value as StateFilter);
          }}
        >
          <option value="open">Non examinées</option>
          <option value="reviewed">Examinées</option>
          <option value="all">Toutes</option>
        </select>
        {!loading && <span className="gs-caption">{alerts.length} alerte(s)</span>}
      </div>

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

      {loading ? (
        <p className="gs-help mt-5">Chargement des alertes…</p>
      ) : alerts.length === 0 ? (
        <p className="gs-help mt-5">
          {state === "open" ? "Aucune alerte non examinée." : "Aucune alerte."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {alerts.map((alert) => (
            <li key={alert.auditSeq} className="gs-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Alerte n° <span className="gs-mono">{alert.auditSeq}</span> ·{" "}
                  {alert.submittedParcelId
                    ? `modification de ${alert.submittedParcelId}`
                    : "création refusée"}
                </p>
                <span className="gs-caption">
                  {new Date(alert.at).toLocaleString("fr-FR")}
                </span>
              </div>
              <table className="gs-table mt-3">
                <thead>
                  <tr>
                    <th>Parcelle en conflit</th>
                    <th>Zone commune</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {alert.conflicts.map((conflict) => (
                    <tr key={conflict.parcelId}>
                      <td className="gs-mono">
                        {conflict.parcelId}
                        {conflict.version != null && ` (v${conflict.version})`}
                      </td>
                      <td>{formatSurface(conflict.overlapAreaM2)}</td>
                      <td className="flex flex-wrap gap-1">
                        {conflict.legalStatus && (
                          <LegalBadge status={conflict.legalStatus} />
                        )}
                        {conflict.certified != null && (
                          <CertBadge certified={conflict.certified} kind="parcelle" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {alert.review ? (
                <p className="gs-alert gs-alert--success mt-3">
                  Examinée le {new Date(alert.review.reviewedAt).toLocaleString("fr-FR")}
                  {alert.review.note ? ` · ${alert.review.note}` : ""}
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-[240px] flex-1">
                    <label className="gs-label" htmlFor={`note-${alert.auditSeq}`}>
                      Note (facultative)
                    </label>
                    <input
                      id={`note-${alert.auditSeq}`}
                      className="gs-input"
                      maxLength={500}
                      placeholder="Géomètre contacté."
                      value={notes[alert.auditSeq] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [alert.auditSeq]: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    className="gs-btn gs-btn--primary"
                    disabled={sending === alert.auditSeq}
                    onClick={() => void review(alert)}
                  >
                    {sending === alert.auditSeq ? "Envoi…" : "Marquer examinée"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
