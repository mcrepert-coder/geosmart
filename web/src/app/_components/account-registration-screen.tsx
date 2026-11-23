"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ShieldCheck, UserPlus } from "lucide-react";
import { PhoneField } from "./auth-code";
import { PasswordField } from "./password-field";
import { AUTH_API_CONFIGURED, registerAccount, verifyAccountPhone } from "@/lib/auth-api";

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
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string;
    password?: string;
    confirmation?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const submitRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    if (phone.length !== 8) {
      setFieldErrors({ phone: "Saisissez les 8 chiffres de votre numéro après +228." });
      return;
    }
    if (password.length < 8) {
      setFieldErrors({ password: "Le mot de passe doit contenir au moins 8 caractères." });
      return;
    }
    if (password !== confirmation) {
      setFieldErrors({ confirmation: "Les mots de passe ne correspondent pas." });
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

  const submitVerification = async (event: React.FormEvent) => {
    event.preventDefault();
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
      <section className="gs-card gs-form-card w-full max-w-md">
        {step === "register" && (
          <form onSubmit={submitRegistration}>
            <span className="gs-form-icon">
              <UserPlus size={24} aria-hidden />
            </span>
            <p className="gs-module text-[var(--primary)]">Nouveau compte</p>
            <h1 className="gs-h1 gs-display mt-2">Créer un compte</h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Inscrivez-vous avec votre numéro de téléphone. Votre rôle sera attribué après
              vérification par l’administration.
            </p>
            {!AUTH_API_CONFIGURED && (
              <p className="gs-alert gs-alert--warning mt-5" role="status">
                Le service d’inscription n’est pas configuré. Définissez NEXT_PUBLIC_API_URL.
              </p>
            )}
            <div className="gs-form-stack">
              <PhoneField
                id="registration-phone"
                value={phone}
                error={fieldErrors.phone}
                onChange={(value) => {
                  setPhone(value);
                  setFieldErrors((current) => ({ ...current, phone: undefined }));
                  setError("");
                }}
              />
              <PasswordField
                id="registration-password"
                label="Mot de passe"
                value={password}
                autoComplete="new-password"
                minLength={8}
                help="8 caractères minimum."
                error={fieldErrors.password}
                onChange={(value) => {
                  setPassword(value);
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                  setError("");
                }}
              />
              <PasswordField
                id="registration-confirmation"
                label="Confirmer le mot de passe"
                value={confirmation}
                autoComplete="new-password"
                help="Retapez votre mot de passe."
                error={fieldErrors.confirmation}
                onChange={(value) => {
                  setConfirmation(value);
                  setFieldErrors((current) => ({ ...current, confirmation: undefined }));
                  setError("");
                }}
              />
              {error && (
                <p className="gs-alert gs-alert--danger" role="alert">
                  {error}
                </p>
              )}
              <div className="gs-form-actions">
                <button
                  type="submit"
                  className="gs-btn gs-btn--primary gs-btn--lg gs-btn--block"
                  disabled={submitting || !AUTH_API_CONFIGURED}
                >
                  {submitting ? "Création..." : "Créer mon compte"}
                </button>
                <p className="gs-form-note">
                  Envoi SMS simulé : le code de vérification est visible dans les journaux du
                  serveur API jusqu’à la configuration d’un fournisseur SMS.
                </p>
              </div>
            </div>
            <p className="gs-help mt-5 text-center">
              Vous avez déjà un compte ?{" "}
              <Link href="/connexion" className="font-semibold text-[var(--primary)] underline">
                Se connecter
              </Link>
            </p>
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={submitVerification}>
            <span className="gs-form-icon">
              <ShieldCheck size={24} aria-hidden />
            </span>
            <p className="gs-module text-[var(--primary)]">Vérification</p>
            <h1 className="gs-h1 gs-display mt-2">Vérifier le téléphone</h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Saisissez le code à 6 chiffres associé au +228 {phone}.
            </p>
            <div className="gs-form-stack">
              <div className="gs-field">
                <label className="gs-label" htmlFor="registration-code">
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
                <p className="gs-help">6 chiffres reçus par SMS.</p>
              </div>
              {error && (
                <p className="gs-alert gs-alert--danger" role="alert">
                  {error}
                </p>
              )}
              <div className="gs-form-actions">
                <button
                  type="submit"
                  className="gs-btn gs-btn--primary gs-btn--lg gs-btn--block"
                  disabled={submitting || code.length !== 6}
                >
                  {submitting ? "Vérification..." : "Vérifier mon numéro"}
                </button>
                <button
                  type="button"
                  className="gs-btn gs-btn--ghost gs-btn--block"
                  disabled={submitting}
                  onClick={() => {
                    setError("");
                    setStep("register");
                  }}
                >
                  Retour
                </button>
              </div>
            </div>
          </form>
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
              avant l’activation de l’accès. Connectez-vous pour déposer vos pièces
              justificatives : sans elles, le compte ne peut pas être validé.
            </p>
            <Link href="/connexion" className="gs-btn gs-btn--primary gs-btn--block mt-6">
              Déposer mes pièces
            </Link>
            <Link href="/" className="gs-btn gs-btn--secondary gs-btn--block mt-2">
              Retour aux annonces
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
