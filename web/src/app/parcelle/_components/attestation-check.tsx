"use client";

import { CircleCheck, CircleX, FileText, History, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  ATTESTATION_PATTERN,
  type ApiResult,
  type AttestationVerification,
  DEMO_ATTESTATION,
  DEMO_MODE,
  verifyAttestation,
} from "../_lib/api";
import { formatDateTime } from "../_lib/format";
import { sha256File } from "../_lib/sha256";
import { HashText } from "./hash-text";
import { Notice } from "./notice";

const MAX_BYTES = 5 * 1024 * 1024;

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; hash: string; result: ApiResult<AttestationVerification> };

// Verification d'une attestation de leve (EF-204) : l'empreinte du PDF est
// calculee sur l'appareil puis comparee a celle enregistree.
export function AttestationCheck() {
  const [number, setNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ number?: string; file?: string }>({});
  const [state, setState] = useState<State>({ phase: "idle" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const n = number.trim().toUpperCase();
    const next: typeof errors = {};
    if (!ATTESTATION_PATTERN.test(n)) {
      next.number = "Format attendu : AT-2026-000031 (en tête du document).";
    }
    if (!file) next.file = "Choisissez le fichier PDF de l'attestation.";
    else if (file.size > MAX_BYTES) next.file = "Le fichier dépasse 5 Mo.";
    setErrors(next);
    if (next.number || next.file || !file) return;

    setState({ phase: "loading" });
    try {
      const hash = await sha256File(file);
      const result = await verifyAttestation(n, hash);
      setState({ phase: "done", hash, result });
    } catch {
      setState({
        phase: "done",
        hash: "",
        result: {
          ok: false,
          kind: "network",
          message:
            "Impossible de calculer l’empreinte SHA-256 sur ce navigateur. Utilisez un navigateur récent en connexion sécurisée.",
        },
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate className="gs-card gs-form-card flex flex-col gap-5">
        <div>
          <label htmlFor="att-number" className="gs-label">
            Numéro d&apos;attestation <span className="text-[var(--danger)]">*</span>
          </label>
          <input
            id="att-number"
            className="gs-input gs-mono"
            placeholder="AT-2026-000031"
            autoComplete="off"
            spellCheck={false}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            aria-invalid={errors.number ? true : undefined}
            aria-describedby="att-number-msg"
          />
          <p id="att-number-msg" className={errors.number ? "gs-error" : "gs-help"}>
            {errors.number ?? "Il figure en tête de l'attestation de levé."}
          </p>
        </div>

        <div>
          <label htmlFor="att-file" className="gs-label">
            Fichier PDF <span className="text-[var(--danger)]">*</span>
          </label>
          <label
            htmlFor="att-file"
            className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-sunken)] px-4"
          >
            <FileText aria-hidden size={20} className="text-[var(--primary)]" />
            <span className="truncate">{file ? file.name : "Choisir le fichier reçu"}</span>
          </label>
          <input
            id="att-file"
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-invalid={errors.file ? true : undefined}
            aria-describedby="att-file-msg"
          />
          <p id="att-file-msg" className={errors.file ? "gs-error" : "gs-help"}>
            {errors.file ??
              "Le fichier reste sur votre appareil : seule son empreinte SHA-256 est envoyée."}
          </p>
        </div>

        <button type="submit" className="gs-btn gs-btn--primary self-start" disabled={state.phase === "loading"}>
          {state.phase === "loading" ? "Vérification…" : "Vérifier l'attestation"}
        </button>

        {DEMO_MODE && (
          <p className="gs-help">
            Mode exemple : seule l&apos;attestation {DEMO_ATTESTATION.number} existe, et
            aucun fichier réel ne peut avoir son empreinte fictive.
          </p>
        )}
      </form>

      <div aria-live="polite">{state.phase === "done" && <Result {...state} />}</div>
    </div>
  );
}

function Result({ hash, result }: { hash: string; result: ApiResult<AttestationVerification> }) {
  if (!result.ok) {
    return (
      <div className="gs-alert gs-alert--danger" role="alert">
        <TriangleAlert aria-hidden className="mt-0.5 shrink-0" size={20} />
        <div>
          <p className="font-semibold">
            {result.kind === "not-found" ? "Attestation introuvable" : "Vérification impossible"}
          </p>
          <p>
            {result.kind === "not-found"
              ? "Aucune attestation de levé ne porte ce numéro. Vérifiez sa saisie."
              : result.message}
          </p>
        </div>
      </div>
    );
  }

  const v = result.data;
  return (
    <div className="flex flex-col gap-4">
      {v.valid ? (
        <div className="gs-alert gs-alert--success" role="status">
          <CircleCheck aria-hidden className="mt-0.5 shrink-0 text-[var(--success)]" size={20} />
          <div>
            <p className="font-semibold">Attestation authentique et à jour</p>
            <p>
              Ce fichier est identique à l&apos;attestation {v.number} émise le{" "}
              {formatDateTime(v.issuedAt)} pour la parcelle{" "}
              <Link className="gs-mono underline" href={`/parcelle?id=${v.parcelId}`}>
                {v.parcelId}
              </Link>
              , version {v.parcelVersion}.
            </p>
          </div>
        </div>
      ) : v.authentic && v.superseded ? (
        <div className="gs-alert gs-alert--warning" role="alert">
          <History aria-hidden className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-semibold">Attestation dépassée</p>
            <p>
              Elle porte sur la version {v.parcelVersion} de la parcelle {v.parcelId}, qui a
              été modifiée depuis. Demandez l&apos;attestation de la version actuelle.
            </p>
          </div>
        </div>
      ) : (
        <div className="gs-alert gs-alert--danger" role="alert">
          <CircleX aria-hidden className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-semibold">Ce fichier ne correspond pas</p>
            <p>
              Son empreinte diffère de celle enregistrée pour {v.number} : le document a pu
              être modifié, ou ce n&apos;est pas le bon fichier.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="gs-help mt-0">Empreinte du fichier vérifié :</span>
        <HashText hash={hash} />
      </div>
      <Notice>Ne vaut pas titre foncier</Notice>
    </div>
  );
}
