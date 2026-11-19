import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

export const metadata: Metadata = { title: "Connexion administrateur" };

export default function Page() {
  if (!DEMO_MODE_ENABLED) return null;

  return (
    <div className="mx-auto max-w-sm p-6 md:p-10">
      <section className="gs-card gs-form-card">
        <span className="gs-avatar mx-auto h-12 w-12 bg-[var(--primary-soft)] text-[var(--primary)]">
          <ShieldCheck size={24} aria-hidden />
        </span>
        <h1 className="gs-h2 gs-display mt-4 text-center">Espace administrateur</h1>
        <p className="gs-help mt-3 text-center">
          En démonstration, l&apos;accès à l&apos;administration est ouvert : aucune authentification
          n&apos;est requise.
        </p>
        <Link href="/admin" className="gs-btn gs-btn--primary gs-btn--block mt-5">
          Ouvrir le tableau de bord
        </Link>
        <Link href="/" className="gs-btn gs-btn--ghost gs-btn--block mt-2">
          Retour aux annonces
        </Link>
      </section>
    </div>
  );
}
