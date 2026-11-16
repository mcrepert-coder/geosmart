"use client";

import Link from "next/link";
import { useState } from "react";
import { Briefcase, Check, ShieldCheck } from "lucide-react";
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

  return (
    <div className="gs-wrap gs-wrap--narrow flex flex-1 items-start justify-center py-10 md:py-16">
      <div className="gs-card w-full max-w-md p-6 md:p-8">
        {step === "phone" && (
          <>
            <h1 className="gs-h1 gs-display">Se connecter</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">
              Votre numéro vérifié ouvre votre espace : client, agent, géomètre ou
              administrateur.
            </p>
            <div className="mt-6">
              <PhoneField
                id="login-phone"
                value={phone}
                error={phoneError}
                onChange={(v) => {
                  setPhone(v);
                  if (phoneError) setPhoneError("");
                }}
              />
            </div>
            <button
              className="gs-btn gs-btn--primary gs-btn--block mt-5"
              onClick={() => {
                if (phone.length !== 8) {
                  setPhoneError("Numéro incomplet : 8 chiffres après +228.");
                  return;
                }
                setStep("code");
              }}
            >
              Recevoir le code
            </button>
            <p className="gs-demo mt-4 rounded-[10px] px-3 py-2">
              Démo hors ligne : le code de validation est {DEMO_CODE}.
            </p>
            <p className="gs-help mt-4">
              Pas encore de compte ?{" "}
              <Link href="/inscription" className="font-semibold text-[var(--primary)] underline">
                Créer un compte
              </Link>
            </p>
          </>
        )}
        {step === "code" && (
          <>
            <h1 className="gs-h1 gs-display">Code de validation</h1>
            <p className="mt-1 text-[14px] text-[var(--text-muted)]">
              Saisissez les 6 chiffres reçus par SMS. Le collage est accepté.
            </p>
            <div className="mt-6">
              <AuthCode phone={phone} onSuccess={() => setStep("done")} onBack={() => setStep("phone")} />
            </div>
          </>
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
            <div className="mt-6 flex flex-col gap-2">
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
      </div>
    </div>
  );
}