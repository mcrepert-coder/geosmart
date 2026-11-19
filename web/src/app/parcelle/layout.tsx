import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_MODE } from "./_lib/api";
import { Notice } from "./_components/notice";
import { ParcelleNav } from "./_components/parcelle-nav";
import "./parcelle.css";

export const metadata: Metadata = {
  title: {
    default: "Vérifier une parcelle · GeoSmart Field",
    template: "%s · GeoSmart Field",
  },
  description:
    "Consultez le statut juridique déclaré et la certification d'une parcelle avant d'acheter. Ne vaut pas titre foncier.",
};

export default function ParcelleLayout({ children }: LayoutProps<"/parcelle">) {
  return (
    <div className="flex flex-1 flex-col">
      {DEMO_MODE && (
        <p className="gs-demo px-4 py-2 text-center" role="status">
          Données d&apos;exemple : l&apos;API n&apos;est pas encore branchée. Essayez
          TG-AG3-00457, TG-AG3-00377 ou TG-GO1-01188.
        </p>
      )}
      <header className="gs-header">
        <div className="gs-container flex flex-wrap items-center justify-between gap-x-8 gap-y-2 pt-3">
          <Link href="/parcelle" className="gs-logotype py-2">
            GeoSmart <span>Field</span>
          </Link>
          <ParcelleNav />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="gs-header mt-12 border-t">
        <div className="gs-container flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <Notice>Les informations affichées ne valent pas titre foncier</Notice>
          <p className="text-[13px] text-[var(--text-muted)]">
            GeoSmart Field seconde l&apos;ANDF, il ne la remplace pas.
          </p>
        </div>
      </footer>
    </div>
  );
}
