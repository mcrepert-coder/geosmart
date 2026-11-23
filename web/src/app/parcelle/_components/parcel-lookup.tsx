"use client";

import { Scale, Search, TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type ApiResult,
  PARCEL_ID_PATTERN,
  type ParcelPublicStatus,
  fetchParcelStatus,
} from "../_lib/api";
import { formatArea, formatDate, formatPlainDate } from "../_lib/format";
import { CertBadge, ParcelStatusBadge } from "./badges";
import { Notice } from "./notice";
import { ShareParcel } from "./share-parcel";

interface Done {
  id: string;
  result: ApiResult<ParcelPublicStatus>;
}

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

// EF-206, maquette C1 : un seul champ, l'identifiant de parcelle.
// L'identifiant vit dans l'adresse (?id=...) : un lien partage relance la
// verification.
export function ParcelLookup() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialId = normalize(searchParams.get("id") ?? "");
  const [value, setValue] = useState(initialId);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!PARCEL_ID_PATTERN.test(initialId)) return;
    let cancelled = false;
    fetchParcelStatus(initialId).then((result) => {
      if (!cancelled) setDone({ id: initialId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [initialId]);

  const loading =
    refreshing || (PARCEL_ID_PATTERN.test(initialId) && done?.id !== initialId);
  const state = loading
    ? ({ phase: "loading" } as const)
    : done
      ? ({ phase: "done", ...done } as const)
      : ({ phase: "idle" } as const);

  function validate(id: string): string | null {
    if (id === "") return "Saisissez l'identifiant de la parcelle.";
    if (!PARCEL_ID_PATTERN.test(id)) {
      return "Format attendu : TG, la commune et le numéro, par exemple TG-AG3-00457.";
    }
    return null;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const id = normalize(value);
    const problem = validate(id);
    setError(problem);
    if (problem) return;
    if (id === initialId) {
      setRefreshing(true);
      fetchParcelStatus(id).then((result) => {
        setDone({ id, result });
        setRefreshing(false);
      });
    } else {
      router.replace(`${pathname}?id=${encodeURIComponent(id)}`, { scroll: false });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate className="gs-card gs-form-card">
        <label htmlFor="parcel-id" className="gs-label">
          Identifiant de parcelle
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="parcel-id"
            name="id"
            className="gs-input gs-mono"
            placeholder="TG-AG3-00457"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => value && setError(validate(normalize(value)))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "parcel-id-error" : "parcel-id-help"}
          />
          <button
            type="submit"
            className="gs-btn gs-btn--primary sm:min-w-[140px]"
            disabled={state.phase === "loading"}
          >
            <Search aria-hidden size={20} />
            {state.phase === "loading" ? "Recherche…" : "Vérifier"}
          </button>
        </div>
        {error ? (
          <p id="parcel-id-error" className="gs-error flex items-center gap-1">
            <TriangleAlert aria-hidden size={14} /> {error}
          </p>
        ) : (
          <p id="parcel-id-help" className="gs-help">
            L&apos;identifiant figure sur l&apos;annonce et sur l&apos;attestation de levé.
          </p>
        )}
      </form>

      <div aria-live="polite">
        {state.phase === "loading" && <ResultSkeleton />}
        {state.phase === "done" && <Result id={state.id} result={state.result} />}
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="gs-card flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">Recherche en cours</span>
      <div className="gs-skeleton h-7 w-48" />
      <div className="gs-skeleton h-5 w-full" />
      <div className="gs-skeleton h-5 w-full" />
      <div className="gs-skeleton h-5 w-2/3" />
    </div>
  );
}

function Result({ id, result }: { id: string; result: ApiResult<ParcelPublicStatus> }) {
  if (!result.ok) {
    const notFound = result.kind === "not-found";
    return (
      <div className={`gs-alert ${notFound ? "gs-alert--warning" : "gs-alert--danger"}`} role="alert">
        <TriangleAlert aria-hidden className="mt-0.5 shrink-0" size={20} />
        <div>
          <p className="font-semibold">
            {notFound ? `Aucune parcelle ${id} enregistrée` : "Vérification impossible"}
          </p>
          <p>
            {notFound
              ? "Vérifiez l'identifiant. Une parcelle absente de GeoSmart n'est ni bonne ni mauvaise : renseignez-vous auprès de l'ANDF."
              : result.message}
          </p>
        </div>
      </div>
    );
  }

  const p = result.data;
  return (
    <article className="flex flex-col gap-4" aria-labelledby="parcel-title">
      <div className="gs-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="parcel-title" className="gs-mono text-[22px] leading-[30px]">
            {p.id}
          </h2>
          <ParcelStatusBadge status={p.legalStatus} />
        </div>

        <dl className="gs-rows mt-4">
          <div>
            <dt>Surface levée</dt>
            <dd>{formatArea(p.areaM2)}</dd>
          </div>
          <div>
            <dt>Dernier levé</dt>
            <dd>
              {formatDate(p.lastSurveyAt)} · v{p.version}
            </dd>
          </div>
          <div>
            <dt>Certification</dt>
            <dd>
              <CertBadge certified={p.certified} />
            </dd>
          </div>
          <div>
            <dt>Bornage contradictoire</dt>
            <dd>
              {p.bornage
                ? `${p.bornage.neighboursPresent} voisin${p.bornage.neighboursPresent > 1 ? "s" : ""} sur ${p.bornage.neighboursTotal}`
                : "Non renseigné"}
            </dd>
          </div>
          {p.titleNumber && (
            <div>
              <dt>N° de titre</dt>
              <dd className="gs-mono">{p.titleNumber}</dd>
            </div>
          )}
          <div>
            <dt>Source du statut</dt>
            <dd>
              {p.statusSource
                ? `${p.statusSource}${p.statusDate ? `, ${formatPlainDate(p.statusDate)}` : ""}`
                : "Aucune source autorisée"}
            </dd>
          </div>
        </dl>
      </div>

      {p.legalStatus === "EN_LITIGE" && (
        <div className="gs-alert gs-alert--warning" role="alert">
          <Scale aria-hidden className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-semibold">
              Litige signalé{p.statusDate ? ` le ${formatPlainDate(p.statusDate)}` : ""}
            </p>
            {p.disputeNote && <p>{p.disputeNote}</p>}
          </div>
        </div>
      )}

      {p.warnings
        .filter((w) => !w.startsWith("Ne vaut pas titre foncier") && !w.includes("litige"))
        .map((warning) => (
          <p key={warning} className="gs-alert gs-alert--info">
            {warning}
          </p>
        ))}

      <Notice>Ne vaut pas titre foncier · consultez l&apos;ANDF</Notice>
      <ShareParcel parcel={p} />
    </article>
  );
}
