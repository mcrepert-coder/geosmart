"use client";

import { useState } from "react";
import { Download, Loader2, Send, Wallet } from "lucide-react";
import {
  PAY_METHOD_LABEL,
  type PayMethod,
  type RentEntry,
} from "@/lib/data";
import {
  encaisserRent,
  sendRentReminder,
  useDemoStore,
} from "@/lib/demo-store";
import { formatPrice } from "@/lib/format";

const METHODS: PayMethod[] = ["FLOOZ", "TMONEY", "MIXX"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(y, (m ?? 1) - 1, 1),
  );
}

function quittanceText(rent: RentEntry, bienTitle: string, parcelId: string): string {
  return [
    "GEOSMART IMMO - QUITTANCE ELECTRONIQUE DE LOYER",
    "==============================================",
    `Reference   : ${rent.quittanceRef ?? "-"}`,
    `Empreinte   : ${rent.quittanceHash ?? "-"}`,
    "",
    `Locataire   : ${rent.tenant} (${rent.tenantPhone})`,
    `Bien        : ${bienTitle}`,
    `Parcelle    : ${parcelId}`,
    `Periode     : ${monthLabel(rent.month)}`,
    `Montant     : ${formatPrice(rent.amount)}`,
    `Paiement    : ${rent.method ? PAY_METHOD_LABEL[rent.method] : "-"} (Mobile Money)`,
    `Encaisse le : ${rent.paidAt ?? "-"}`,
    "",
    "Quittance electronique emise via GeoSmart Immo.",
    "Ne vaut pas titre foncier officiel.",
  ].join("\n");
}

export function AgentRentsScreen() {
  const { accounts, listings, rents, agentSessionId } = useDemoStore();
  const agent = accounts.find((a) => a.id === agentSessionId) ?? null;
  const canManage =
    accounts.find((a) => a.id === agentSessionId)?.status === "ACTIF";

  const myListings = listings.filter((l) => l.agentId === agent?.id);
  const listingIds = new Set(myListings.map((l) => l.id));
  const myRents = rents.filter((r) => listingIds.has(r.listingId));
  const listingOf = (id: string) => myListings.find((l) => l.id === id);

  const [payFor, setPayFor] = useState<RentEntry | null>(null);
  const [method, setMethod] = useState<PayMethod>("FLOOZ");
  const [phone, setPhone] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastQuittance, setLastQuittance] = useState<RentEntry | null>(null);
  const [reminded, setReminded] = useState<string[]>([]);

  const paid = myRents.filter((r) => r.status === "PAYE");
  const unpaid = myRents.filter((r) => r.status === "IMPAYE");
  const collected = paid.reduce((s, r) => s + r.amount, 0);
  const owed = unpaid.reduce((s, r) => s + r.amount, 0);

  const openPay = (rent: RentEntry) => {
    setPayFor(rent);
    setMethod("FLOOZ");
    setPhone(rent.tenantPhone);
  };

  const confirmPay = () => {
    if (!payFor) return;
    setProcessing(true);
    window.setTimeout(() => {
      const res = encaisserRent(payFor.id, method);
      setProcessing(false);
      setPayFor(null);
      if (res) setLastQuittance(res);
    }, 600);
  };

  const downloadQuittance = (rent: RentEntry) => {
    const l = listingOf(rent.listingId);
    const text = quittanceText(rent, l?.title ?? "-", l?.parcelId ?? "-");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quittance-${rent.quittanceRef ?? rent.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8">
      <h1 className="gs-h1 gs-display">Loyers & quittances</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Encaissez les loyers par Mobile Money (Flooz, T-Money, Mixx by Yas), émettez les
        quittances électroniques et suivez les impayés.
      </p>

      {!canManage && (
        <div
          role="alert"
          className="mt-4 rounded-[12px] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-[14px] font-medium text-[var(--danger)]"
        >
          Gestion des loyers verrouillée : votre compte doit être validé par
          l&apos;administration pour encaisser et émettre des quittances.
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="gs-kpi-tile">
          <span className="gs-label">Encaissé</span>
          <span className="gs-kpi gs-display block break-words text-[19px] leading-[24px] sm:text-[32px] sm:leading-[38px]">
            {formatPrice(collected)}
          </span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">toutes périodes</span>
        </div>
        <div className="gs-kpi-tile">
          <span className="gs-label">Impayés</span>
          <span className="gs-kpi gs-display block break-words text-[19px] leading-[24px] sm:text-[32px] sm:leading-[38px]">
            {formatPrice(owed)}
          </span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">
            {unpaid.length} échéance(s)
          </span>
        </div>
        <div className="gs-kpi-tile">
          <span className="gs-label">Quittances émises</span>
          <span className="gs-kpi gs-display block">{paid.length}</span>
          <span className="mt-1 block text-[12px] text-[var(--text-muted)]">électroniques</span>
        </div>
        <div className="gs-kpi-tile">
          <span className="gs-label">Moyens acceptés</span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <span key={m} className="gs-badge gs-badge--primary">
                {PAY_METHOD_LABEL[m]}
              </span>
            ))}
          </span>
        </div>
      </div>

      {lastQuittance && (
        <div className="gs-card mt-6 flex flex-wrap items-center justify-between gap-3 border-[var(--success)] p-4">
          <div>
            <p className="font-semibold text-[var(--success)]">
              Loyer encaissé · quittance {lastQuittance.quittanceRef}
            </p>
            <p className="gs-caption">
              {PAY_METHOD_LABEL[lastQuittance.method ?? "FLOOZ"]} · empreinte{" "}
              {lastQuittance.quittanceHash}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="gs-btn gs-btn--secondary" onClick={() => downloadQuittance(lastQuittance)}>
              <Download size={16} /> Télécharger
            </button>
            <button className="gs-btn gs-btn--ghost" onClick={() => setLastQuittance(null)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      <div className="gs-card gs-card--flush mt-6 overflow-x-auto">
        <table className="gs-table w-full">
          <thead>
            <tr>
              <th>Bien / locataire</th>
              <th>Période</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Paiement / quittance</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {myRents.map((r) => {
              const l = listingOf(r.listingId);
              return (
                <tr key={r.id}>
                  <td>
                    <span className="block font-semibold">{l?.title ?? r.listingId}</span>
                    <span className="gs-caption">
                      {r.tenant} · {r.tenantPhone}
                    </span>
                  </td>
                  <td className="capitalize">{monthLabel(r.month)}</td>
                  <td className="gs-data">{formatPrice(r.amount)}</td>
                  <td>
                    <span className={`gs-badge ${r.status === "PAYE" ? "gs-badge--success" : "gs-badge--danger"}`}>
                      {r.status === "PAYE" ? "Payé" : "Impayé"}
                    </span>
                  </td>
                  <td>
                    {r.status === "PAYE" ? (
                      <>
                        <span className="block text-[13px]">
                          {r.method ? PAY_METHOD_LABEL[r.method] : "-"}
                        </span>
                        <button
                          className="gs-caption mt-0.5 inline-flex items-center gap-1 font-semibold text-[var(--primary)] underline"
                          onClick={() => downloadQuittance(r)}
                        >
                          <Download size={12} aria-hidden /> {r.quittanceRef}
                        </button>
                      </>
                    ) : (
                      <span className="gs-caption">en attente</span>
                    )}
                  </td>
                  <td>
                    {r.status === "IMPAYE" ? (
                      <div className="flex gap-2">
                        <button
                          className="gs-btn gs-btn--primary gs-btn--sm"
                          disabled={!canManage}
                          onClick={() => openPay(r)}
                          title={canManage ? "Encaisser par Mobile Money" : "Compte non validé"}
                        >
                          <Wallet size={14} /> Encaisser
                        </button>
                        <button
                          className="gs-btn gs-btn--ghost gs-btn--sm"
                          onClick={() => {
                            sendRentReminder(r.id);
                            setReminded((v) => (v.includes(r.id) ? v : [...v, r.id]));
                          }}
                        >
                          <Send size={14} /> {reminded.includes(r.id) ? "Relancé" : "Relancer"}
                        </button>
                      </div>
                    ) : (
                      <span className="gs-caption">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {myRents.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[13px] text-[var(--text-muted)]">
                  Aucun bien en gestion locative pour ce profil.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {payFor && (
        <>
          <div className="gs-scrim" onClick={() => !processing && setPayFor(null)} aria-hidden />
          <div className="pointer-events-none fixed inset-0 z-[1200] flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Encaissement Mobile Money"
              className="gs-card pointer-events-auto w-full max-w-md p-6"
            >
              <h2 className="gs-h3 gs-display">Encaisser le loyer</h2>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                {payFor.tenant} · {monthLabel(payFor.month)} · {formatPrice(payFor.amount)}
              </p>
              <p className="gs-label mt-4">Opérateur Mobile Money</p>
              <div className="gs-seg mt-1 w-full" role="group" aria-label="Opérateur">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    className="flex-1"
                    aria-pressed={method === m}
                    onClick={() => setMethod(m)}
                  >
                    {PAY_METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              <label className="mt-4 block">
                <span className="gs-label">Numéro du payeur</span>
                <input
                  className="gs-input mt-1 w-full"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <p className="gs-help mt-3">
                Simulation : la confirmation du paiement déclenche l&apos;émission automatique
                de la quittance électronique.
              </p>
              <div className="mt-4 flex gap-2">
                <button className="gs-btn gs-btn--primary" disabled={processing} onClick={confirmPay}>
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                  {processing ? "Confirmation..." : "Confirmer le paiement"}
                </button>
                <button className="gs-btn gs-btn--ghost" disabled={processing} onClick={() => setPayFor(null)}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}