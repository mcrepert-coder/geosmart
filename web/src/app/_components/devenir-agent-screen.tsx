"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check, FileText, Upload, X } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/data";
import { addAccount } from "@/lib/demo-store";
import { AuthCode, DEMO_CODE, PhoneField, formatPhone } from "./auth-code";
import { DemoUnavailable } from "./demo-unavailable";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

const ROLE_DESC: Record<Role, string> = {
  GEOMETRE: "Levés certifiés · attestation d'inscription à l'Ordre exigée.",
  TOPOGRAPHE: "Chantiers assignés · mesure de bornes sur le terrain.",
  AGENT: "Annonces, visites et baux · carte professionnelle ou RCCM.",
  CLIENT: "Recherche, vérification de parcelle et demandes de visite.",
};

const MIN_PIECES: Record<Role, number> = { GEOMETRE: 2, TOPOGRAPHE: 1, AGENT: 2, CLIENT: 1 };
const ACCEPTED = ["image/jpeg", "image/png", "application/pdf"];
const MAX_SIZE = 5_000_000;

type Piece = { name: string; size: number };

function Stepper({ step }: { step: number }) {
  const labels = ["Téléphone", "Code", "Rôle & pièces", "Attente"];
  return (
    <ol className="flex items-center gap-2">
      {labels.map((l, i) => (
        <li key={l} className="flex flex-1 items-center gap-2">
          <span
            className={`gs-avatar h-8 w-8 text-[13px] ${
              i < step
                ? "bg-[var(--success-soft)] text-[var(--success)]"
                : i === step
                  ? "bg-[var(--primary)] text-[var(--text-on-primary)]"
                  : "bg-[var(--surface-sunken)] text-[var(--text-muted)]"
            }`}
          >
            {i < step ? <Check size={15} aria-hidden /> : i + 1}
          </span>
          <span
            className={`hidden text-[12px] font-semibold sm:block ${
              i === step ? "text-[var(--primary)]" : "text-[var(--text-muted)]"
            }`}
          >
            {l}
          </span>
          {i < 3 && <span className="h-px flex-1 bg-[var(--border)]" />}
        </li>
      ))}
    </ol>
  );
}

export function DevenirAgentScreen() {
  if (!DEMO_MODE_ENABLED) {
    return (
      <DemoUnavailable title="Inscription non disponible">
        Le dépôt de dossier n’est pas encore relié à un service sécurisé de
        comptes et de stockage de pièces. Les fichiers ne seront pas enregistrés.
      </DemoUnavailable>
    );
  }
  return <DemoRegistrationScreen />;
}

function DemoRegistrationScreen() {
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("AGENT");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [fileError, setFileError] = useState("");
  const [formError, setFormError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const errors: string[] = [];
    const added: Piece[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED.includes(f.type)) {
        errors.push(`${f.name} : format refusé (JPEG, PNG ou PDF).`);
      } else if (f.size > MAX_SIZE) {
        errors.push(`${f.name} : dépasse 5 Mo.`);
      } else {
        added.push({ name: f.name, size: f.size });
      }
    }
    setPieces((prev) => [...prev, ...added]);
    setFileError(errors.join(" "));
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    if (name.trim().length < 3) {
      setFormError("Indiquez votre nom complet.");
      return;
    }
    if (pieces.length < MIN_PIECES[role]) {
      setFormError(
        role === "GEOMETRE"
          ? "Pièce d'identité et attestation de l'Ordre requises (2 fichiers minimum)."
          : role === "AGENT"
            ? "Pièce d'identité et carte professionnelle ou RCCM requises (2 fichiers minimum)."
            : "Pièce d'identité requise.",
      );
      return;
    }
    addAccount({
      name: name.trim(),
      phone: `+228 ${formatPhone(phone)}`,
      roleRequested: role,
      pieces: pieces.map((p) => p.name),
    });
    setStep(3);
  };

  return (
    <div className="gs-wrap gs-wrap--narrow flex flex-1 items-start justify-center py-10 md:py-16">
      <div className="gs-card w-full max-w-xl p-6 md:p-8">
        <h1 className="gs-h1 gs-display">Devenir agent ou géomètre</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Le rôle souhaité est confirmé par l&apos;administrateur, pièces à l&apos;appui.
        </p>
        <div className="mt-6">
          <Stepper step={step} />
        </div>

        {step === 0 && (
          <div className="mt-6">
            <PhoneField
              id="reg-phone"
              value={phone}
              error={phoneError}
              onChange={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError("");
              }}
            />
            <button
              className="gs-btn gs-btn--primary gs-btn--block mt-5"
              onClick={() => {
                if (phone.length !== 8) {
                  setPhoneError("Numéro incomplet : 8 chiffres après +228.");
                  return;
                }
                setStep(1);
              }}
            >
              Recevoir le code
            </button>
            <p className="gs-demo mt-4 rounded-[10px] px-3 py-2">
              Démo hors ligne : le code de validation est {DEMO_CODE}.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6">
            <AuthCode phone={phone} onSuccess={() => setStep(2)} onBack={() => setStep(0)} />
          </div>
        )}

        {step === 2 && (
          <div className="mt-6">
            <label className="gs-label" htmlFor="reg-name">
              Nom complet
            </label>
            <input
              id="reg-name"
              className="gs-input"
              placeholder="Ex. : Ama Kpodar"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (formError) setFormError("");
              }}
            />
            <p className="gs-label mt-5">Rôle souhaité</p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Rôle souhaité">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <button
                  key={r}
                  role="radio"
                  aria-checked={role === r}
                  className={`rounded-[10px] border p-3 text-left transition-colors ${
                    role === r
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                  }`}
                  onClick={() => {
                    setRole(r);
                    if (formError) setFormError("");
                  }}
                >
                  <span className="block font-bold">{ROLE_LABEL[r]}</span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-[var(--text-muted)]">
                    {ROLE_DESC[r]}
                  </span>
                </button>
              ))}
            </div>
            <p className="gs-label mt-5">Pièces justificatives</p>
            <button
              className="gs-btn gs-btn--secondary gs-btn--block"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} aria-hidden />
              Ajouter des fichiers
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,application/pdf"
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
              aria-label="Pièces justificatives"
            />
            <p className="gs-help mt-2">
              JPEG, PNG ou PDF, 5 Mo maximum par fichier. Visible par vous et l&apos;administrateur
              uniquement.
            </p>
            {fileError && <p className="gs-error" role="alert">{fileError}</p>}
            {pieces.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {pieces.map((p, i) => (
                  <div key={`${p.name}-${i}`} className="gs-file-row">
                    <FileText size={17} className="flex-none text-[var(--primary)]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="gs-caption flex-none">{(p.size / 1000).toFixed(0)} ko</span>
                    <button
                      className="gs-iconbtn h-8 w-8 flex-none"
                      aria-label={`Retirer ${p.name}`}
                      onClick={() => setPieces((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {formError && <p className="gs-error mt-3" role="alert">{formError}</p>}
            <button className="gs-btn gs-btn--primary gs-btn--block mt-5" onClick={submit}>
              Envoyer le dossier
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6">
            <div className="flex flex-col gap-0">
              {[
                { label: "Téléphone vérifié", state: "done" },
                { label: "En attente de validation", state: "current" },
                { label: "Actif", state: "todo" },
              ].map((n, i) => (
                <div key={n.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`gs-avatar h-9 w-9 ${
                        n.state === "done"
                          ? "bg-[var(--success-soft)] text-[var(--success)]"
                          : n.state === "current"
                            ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                            : "bg-[var(--surface-sunken)] text-[var(--text-muted)]"
                      }`}
                    >
                      {n.state === "done" ? <Check size={16} aria-hidden /> : i + 1}
                    </span>
                    {i < 2 && <span className="w-px flex-1 bg-[var(--border)]" />}
                  </div>
                  <div className="pb-6">
                    <p className="font-bold">{n.label}</p>
                    <p className="gs-caption mt-0.5">
                      {n.state === "done"
                        ? `+228 ${formatPhone(phone)} · code validé`
                        : n.state === "current"
                          ? "Dossier dans la file des comptes, rôle relu par l'administrateur."
                          : "Notification par SMS après décision."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="gs-alert gs-alert--info mt-2">
              <p className="text-[13px] font-semibold leading-5">
                Dossier déposé dans la file de démonstration : ouvrez l&apos;espace administrateur
                pour le valider ou le rejeter, chaque décision est journalisée.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <Link href="/admin/comptes" className="gs-btn gs-btn--primary gs-btn--block">
                Voir la file des comptes (démo)
              </Link>
              <Link href="/" className="gs-btn gs-btn--secondary gs-btn--block">
                Retour aux annonces
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}