"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  LandPlot,
  LayoutDashboard,
  Map,
  Megaphone,
  ScrollText,
  TriangleAlert,
  Users,
} from "lucide-react";
import { LogoMark } from "../logo";
import { ADMIN_STATS, ALERTS } from "@/lib/data";
import { useDemoStore } from "@/lib/demo-store";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";
import { AdminLiveShell } from "./admin-live";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return DEMO_MODE_ENABLED ? (
    <AdminDemoShell>{children}</AdminDemoShell>
  ) : (
    <AdminLiveShell>{children}</AdminLiveShell>
  );
}

function AdminDemoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { accounts } = useDemoStore();
  const pending = accounts.filter((a) => a.status === "EN_ATTENTE").length;

  const active = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const links = [
    { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
    { href: "/admin/comptes", label: "Comptes", icon: Users, count: pending },
    { href: "/admin/carte", label: "Carte des parcelles", icon: Map },
    { href: "/admin/alertes", label: "Alertes", icon: TriangleAlert, count: ALERTS.length },
    { href: "/admin/journal", label: "Journal", icon: ScrollText },
  ];
  const refLinks = [
    { href: "/admin/parcelles", label: "Parcelles", icon: LandPlot, count: ADMIN_STATS.parcellesTotal },
    { href: "/admin/attestations", label: "Attestations", icon: FileText },
    { href: "/", label: "Annonces", icon: Megaphone },
  ];

  return (
    <div className="flex flex-1 items-stretch">
      <aside className="gs-sidebar sticky top-0 h-screen overflow-y-auto">
        <Link href="/admin" className="mb-4 flex items-center gap-3 px-2" title="Tableau de bord">
          <LogoMark size={34} />
          <span className="gs-logotype-text text-[17px] font-bold text-white">
            GeoSmart Field
          </span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Administration">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              title={l.label}
              className="gs-side-link"
              aria-current={active(l.href) ? "page" : undefined}
            >
              <l.icon size={19} aria-hidden />
              <span className="gs-side-label">{l.label}</span>
              {l.count !== undefined && <span className="gs-count">{l.count}</span>}
            </Link>
          ))}
          <p className="gs-side-title">Référentiel</p>
          {refLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              title={l.label}
              className="gs-side-link"
              aria-current={l.href !== "/" && active(l.href) ? "page" : undefined}
            >
              <l.icon size={19} aria-hidden />
              <span className="gs-side-label">{l.label}</span>
              {l.count !== undefined && <span className="gs-count">{l.count}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-3 px-2">
            <span className="gs-avatar h-9 w-9 text-[13px]">LGR</span>
            <span className="gs-side-label text-[13px] leading-tight text-[#cfdde6]">
              Administrateur
              <br />
              <span className="text-[#7f97a6]">LGR · session démo</span>
            </span>
          </div>
          <Link href="/" className="gs-side-link" title="Retour au site public">
            <ArrowLeft size={19} aria-hidden />
            <span className="gs-side-label">Retour au site</span>
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <p className="gs-demo px-4 py-1.5 text-center">
          Espace de démonstration · données d&apos;exemple, décisions journalisées localement.
        </p>
        {children}
      </main>
    </div>
  );
}