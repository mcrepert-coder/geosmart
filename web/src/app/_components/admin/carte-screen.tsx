"use client";

import dynamic from "next/dynamic";

const AdminMap = dynamic(() => import("./admin-map"), {
  ssr: false,
  loading: () => <div className="gs-skeleton h-[520px]" />,
});

export function CarteScreen() {
  return (
    <div className="p-4 md:p-8">
      <h1 className="gs-h1 gs-display">Carte des parcelles</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Repères colorés par statut juridique · un appui ouvre la fiche, jamais l&apos;édition des
        limites.
      </p>
      <div className="mt-6">
        <AdminMap />
      </div>
    </div>
  );
}