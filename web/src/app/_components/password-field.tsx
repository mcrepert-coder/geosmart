"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  error,
  help,
  minLength,
  required,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  error?: string;
  help?: string;
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="gs-field">
      <label className="gs-label" htmlFor={id}>
        {label}
      </label>
      <div className="gs-password-control" aria-invalid={error ? true : undefined}>
        <input
          id={id}
          className="gs-input"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          disabled={disabled}
          placeholder="••••••••"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
        />
        <button
          type="button"
          className="gs-password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="gs-error" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="gs-help">
          {help}
        </p>
      ) : null}
    </div>
  );
}
