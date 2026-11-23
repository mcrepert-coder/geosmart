"use client";

import Link from "next/link";
import { useState } from "react";
import { Briefcase, Check, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { AuthCode, DEMO_CODE, PhoneField } from "./auth-code";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";
import { AccountLiveScreen } from "./compte-live";

export function ConnexionScreen() {
  if (!DEMO_MODE_ENABLED) return <AccountLiveScreen />;
  return <DemoConnexionScreen />;
}

function DemoConnexionScreen() {
  const [step, setStep] = useState<"phone" | "code" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const submitPhone = (event: React.FormEvent) => {
    event.preventDefault();
    if (phone.length !== 8) {
      setPhoneError("Numéro incomplet : 8 chiffres après +228.");
      return;
    }
    setStep("code");
  };

  return (
    <div className="gs-wrap gs-wrap--narrow flex flex-1 items-start justify-center py-10 md:py-16">
      <section className="gs-card gs-form-card w-full max-w-md">
        {step === "phone" && (
          <form onSubmit={submitPhone}>
            <span className="gs-form-icon">
              <Smartphone size={24} aria-hidden />
            </span>
            <p className="gs-module text-[var(--primary)]">Accès sécurisé</p>
            <h1 className="gs-h1 gs-display mt-2">Se connecter</h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Votre numéro vérifié ouvre votre espace : client, agent, géomètre ou
              administrateur.
            </p>
            <div className="gs-form-stack">
              <PhoneField
                id="login-phone"
                value={phone}
                error={phoneError}
                onChange={(v) => {
                  setPhone(v);
                  if (phoneError) setPhoneError("");
                }}
              />
              <div className="gs-form-actions">
                <button type="submit" className="gs-btn gs-btn--primary gs-btn--lg gs-btn--block">
                  Recevoir le code
                </button>
                <p className="gs-form-note">
                  Démo hors ligne : le code de validation est {DEMO_CODE}.
                </p>
              </div>
            </div>
            <p className="gs-help mt-5 text-center">
              Pas encore de compte ?{" "}
              <Link href="/inscription" className="font-semibold text-[var(--primary)] underline">
                Créer un compte
              </Link>
            </p>
          </form>
        )}
        {step === "code" && (
          <div>
            <span className="gs-form-icon">
              <KeyRound size={24} aria-hidden />
            </span>
            <p className="gs-module text-[var(--primary)]">Étape 2 sur 2</p>
            <h1 className="gs-h1 gs-display mt-2">Code de validation</h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Saisissez les 6 chiffres reçus par SMS. Le collage est accepté.
            </p>
            <div className="gs-form-stack">
              <AuthCode phone={phone} onSuccess={() => setStep("done")} onBack={() => setStep("phone")} />
            </div>
          </div>
        )}
        {step === "done" && (
          <div className="text-center">
            <span className="gs-avatar mx-auto h-14 w-14 bg-[var(--success-soft)] text-[var(--success)]">
              <Check size={26} aria-hidden />
            </span>
            <h1 className="gs-h1 gs-display mt-4">Téléphone vérifié</h1>
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
              Session ouverte au +228 {phone.replace(/(\d{2})(?=\d)/g, "$1 ")}. En démonstration,
              choisissez l&apos;espace correspondant à votre rôle.
            </p>
            <div className="gs-form-actions mt-6">
              <Link href="/admin" className="gs-btn gs-btn--primary gs-btn--block">
                <ShieldCheck size={17} aria-hidden />
                Ouvrir l&apos;espace administrateur
              </Link>
              <Link href="/agent" className="gs-btn gs-btn--secondary gs-btn--block">
                <Briefcase size={17} aria-hidden />
                Ouvrir l&apos;espace agent
              </Link>
              <Link href="/" className="gs-btn gs-btn--secondary gs-btn--block">
                Retour aux annonces
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}