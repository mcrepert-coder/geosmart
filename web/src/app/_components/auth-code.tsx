"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Smartphone } from "lucide-react";

export const DEMO_CODE = "123456";
const LOCK_MS = 15 * 60 * 1000;
const RESEND_MS = 60 * 1000;

export function formatPhone(digits: string): string {
  return digits.replace(/\D/g, "").slice(0, 8).replace(/(\d{2})(?=\d)/g, "$1 ");
}

export function PhoneField({
  value,
  onChange,
  id,
  error,
}: {
  value: string;
  onChange: (digits: string) => void;
  id: string;
  error?: string;
}) {
  return (
    <div>
      <label className="gs-label" htmlFor={id}>
        Téléphone
      </label>
      <div className="gs-phone-control" aria-invalid={error ? true : undefined}>
        <span className="gs-phone-prefix">
          +228
        </span>
        <input
          id={id}
          className="gs-input"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="90 12 34 56"
          value={formatPhone(value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-help`}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
        />
      </div>
      <p id={error ? `${id}-error` : `${id}-help`} className={error ? "gs-error" : "gs-help"}>
        {error ?? "Un code à 6 chiffres est envoyé par SMS à ce numéro."}
      </p>
    </div>
  );
}

export function AuthCode({
  phone,
  onSuccess,
  onBack,
}: {
  phone: string;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_MS);
  const [resent, setResent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const locked = lockedUntil !== null && now < lockedUntil;
  useEffect(() => {
    if (lockedUntil === null) return;
    const timeout = window.setTimeout(() => {
      setLockedUntil(null);
      setFailures(0);
      setError("");
      setDigits(Array(6).fill(""));
    }, Math.max(0, lockedUntil - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [lockedUntil]);

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const ds = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!ds) return;
    e.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, i) => ds[i] ?? ""));
    refs.current[Math.min(ds.length, 5)]?.focus();
  };

  const submit = () => {
    const code = digits.join("");
    if (code.length !== 6) return;
    if (code === DEMO_CODE) {
      onSuccess();
      return;
    }
    const f = failures + 1;
    setFailures(f);
    setError("Identifiants incorrects.");
    setDigits(Array(6).fill(""));
    refs.current[0]?.focus();
    if (f >= 5) {
      const t = Date.now();
      setNow(t);
      setLockedUntil(t + LOCK_MS);
    }
  };

  if (locked) {
    const remaining = Math.max(0, Math.ceil(((lockedUntil ?? 0) - now) / 1000));
    const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
    const ss = String(remaining % 60).padStart(2, "0");
    return (
      <div className="text-center">
        <span className="gs-avatar mx-auto h-14 w-14 bg-[var(--danger-soft)] text-[var(--danger)]">
          <Lock size={24} aria-hidden />
        </span>
        <p className="gs-h2 gs-display mt-4">Compte bloqué 15 minutes</p>
        <p className="gs-kpi gs-display mt-3 text-[var(--danger)]" role="timer">
          {mm}:{ss}
        </p>
        <p className="mt-3 text-[14px] text-[var(--text-muted)]">
          Trop de tentatives. Le code pourra être ressaisi à la fin du compte à rebours.
        </p>
      </div>
    );
  }

  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    <div>
      <p className="flex items-center gap-2 text-[14px] text-[var(--text-muted)]">
        <Smartphone size={16} aria-hidden />
        Code envoyé au +228 {formatPhone(phone)}
      </p>
      <div className="mt-4 flex justify-between gap-2" onPaste={onPaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="gs-input gs-otp-input gs-mono"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={d}
            aria-label={`Chiffre ${i + 1}`}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              if (e.key === "Enter") submit();
            }}
          />
        ))}
      </div>
      {error && (
        <p className="gs-error mt-2" role="alert">
          {error} Tentative {failures}/5.
        </p>
      )}
      <button className="gs-btn gs-btn--primary gs-btn--block mt-4" disabled={digits.join("").length !== 6} onClick={submit}>
        Vérifier le code
      </button>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          className="gs-btn gs-btn--ghost gs-btn--sm"
          disabled={resendIn > 0}
          onClick={() => {
            setResendAt(Date.now() + RESEND_MS);
            setResent(true);
            setDigits(Array(6).fill(""));
            refs.current[0]?.focus();
          }}
        >
          {resendIn > 0 ? `Renvoyer le code (${resendIn} s)` : "Renvoyer le code"}
        </button>
        <button className="gs-btn gs-btn--ghost gs-btn--sm" onClick={onBack}>
          Modifier le numéro
        </button>
      </div>
      {resent && <p className="gs-help mt-2">Nouveau code envoyé par SMS (démo : {DEMO_CODE}).</p>}
    </div>
  );
}