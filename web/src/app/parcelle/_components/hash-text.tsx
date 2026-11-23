"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { shortHash } from "../_lib/format";

// gs-hash : 8 + 8 caracteres, appui = copie de l'empreinte complete.
export function HashText({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Presse-papiers refuse : l'empreinte reste lisible dans l'infobulle.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={hash}
      className="gs-mono inline-flex min-h-[48px] items-center gap-2 rounded-[10px] bg-[var(--surface-sunken)] px-3 text-[12px]"
      aria-label={`Copier l'empreinte complète ${hash}`}
    >
      {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
      SHA-256 {shortHash(hash)}
      <span aria-live="polite" className="sr-only">
        {copied ? "Empreinte copiée" : ""}
      </span>
    </button>
  );
}
