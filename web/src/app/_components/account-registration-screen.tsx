"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { PhoneField } from "./auth-code";
import { LISTINGS_API_PATH } from "@/lib/listings-api";
import { registerAccount, verifyAccountPhone } from "@/lib/auth-api";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
}

export function AccountRegistrationScreen() {
  const [step, setStep] = useState<"register" | "verify" | "pending">("register");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submitRegistration = async () => {
    setError("");
    if (phone.length !== 8) {
      setError("Saisissez les 8 chiffres de votre numéro après +228.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmation) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setSubmitting(true);
    try {
      await registerAccount(`+228${phone}`, password);
      setStep("verify");
    } catch (requestError: unknown) {
      setError(messageOf(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const submitVerification = async () => {
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Saisissez le code à 6 chiffres.");
      return;
    }
    setSubmitting(true);
    try {
      await verifyAccountPhone(`+228${phone}`, code);
      setStep("pending");
    } catch (requestError: unknown) {
      setError(messageOf(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gs-wrap gs-wrap--narrow flex flex-1 items-start justify-center py-10 md:py-16">
      <div className="gs-card w-full max-w-md p-6 md:p-8">
        {step === "register" && (
          <>
            <h1 className="gs-h1 gs-display">Créer un compte</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">
              Inscrivez-vous avec votre numéro de téléphone. Votre rôle sera attribué après
              vérification par l’administration.
            </p>
            {!LISTINGS_API_PATH && (
              <p className="gs-alert gs-alert--warning mt-5" role="status">
                Le service d’inscription n’est pas configuré. Définissez NEXT_PUBLIC_API_URL.
              </p>
            )}
            <div className="mt-6">
              <PhoneField
                id="registration-phone"
                value={phone}
                error={error && phone.length !== 8 ? error : ""}
                onChange={(value) => {
                  setPhone(value);
                  setError("");
                }}
              />
            </div>
            <label className="gs-label mt-5" htmlFor="registration-password">
              Mot de passe
            </label>
            <input
              id="registration-password"
              className="gs-input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
            />
            <label className="gs-label mt-4" htmlFor="registration-confirmation">
              Confirmer le mot de passe
            </label>
            <input
              id="registration-confirmation"
              className="gs-input"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setError("");
              }}
            />
            {error && phone.length === 8 && (
              <p className="gs-error mt-3" role="alert">
                {error}
              </p>
            )}
            <button
              className="gs-btn gs-btn--primary gs-btn--block mt-5"
              disabled={submitting || !LISTINGS_API_PATH}
              onClick={submitRegistration}
            >
              {submitting ? "Création..." : "Créer mon compte"}
            </button>
            <p className="gs-demo mt-4 rounded-[10px] px-3 py-2">
              Envoi SMS simulé : le code de vérification est visible dans les journaux du serveur
              API jusqu’à la configuration d’un fournisseur SMS.
            </p>
            <p className="gs-help mt-4">
              Vous avez déjà un compte ?{" "}
              <Link href="/connexion" className="font-semibold text-[var(--primary)] underline">
                Se connecter
              </Link>
            </p>
          </>
        )}

        {step === "verify" && (
          <>
            <h1 className="gs-h1 gs-display">Vérifier le téléphone</h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Saisissez le code à 6 chiffres associé au +228 {phone}.
            </p>
            <label className="gs-label mt-6" htmlFor="registration-code">
              Code de vérification
            </label>
            <input
              id="registration-code"
              className="gs-input gs-mono"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
            />
            {error && (
              <p className="gs-error mt-3" role="alert">
                {error}
              </p>
            )}
            <button
              className="gs-btn gs-btn--primary gs-btn--block mt-5"
              disabled={submitting || code.length !== 6}
              onClick={submitVerification}
            >
              {submitting ? "Vérification..." : "Vérifier mon numéro"}
            </button>
            <button
              className="gs-btn gs-btn--ghost gs-btn--block mt-2"
              disabled={submitting}
              onClick={() => {
                setError("");
                setStep("register");
              }}
            >
              Retour
            </button>
          </>
        )}

        {step === "pending" && (
          <div className="text-center">
            <CheckCircle2
              className="mx-auto text-[var(--success)]"
              size={48}
              aria-hidden
            />
            <h1 className="gs-h1 gs-display mt-4">Téléphone vérifié</h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Votre compte est en attente de validation. L’administration attribuera votre rôle
              avant l’activation de l’accès.
            </p>
            <Link href="/" className="gs-btn gs-btn--secondary gs-btn--block mt-6">
              Retour aux annonces
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
