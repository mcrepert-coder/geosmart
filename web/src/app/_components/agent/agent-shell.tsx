"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Megaphone, Wallet } from "lucide-react";
import { LogoMark } from "../logo";
import { AgentLiveShell } from "./agent-live";
import { ROLE_LABEL, type AccountStatus } from "@/lib/data";
import { setAgentSession, useDemoStore } from "@/lib/demo-store";
import { DEMO_MODE_ENABLED } from "@/lib/runtime-config";

const STATUS_BADGE: Record<AccountStatus, string> = {
  ACTIF: "gs-badge--success",
  EN_ATTENTE: "gs-badge--warning",
  REJETE: "gs-badge--danger",
  SUSPENDU: "gs-badge--danger",
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  ACTIF: "Agent certifié",
  EN_ATTENTE: "En attente",
  REJETE: "Rejeté",
  SUSPENDU: "Suspendu",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AgentShell({ children }: { children: React.ReactNode }) {
  if (!DEMO_MODE_ENABLED) return <AgentLiveShell>{children}</AgentLiveShell>;
  return <AgentDemoShell>{children}</AgentDemoShell>;
}

function AgentDemoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { accounts, agentSessionId } = useDemoStore();
  const agentProfiles = accounts.filter(
    (a) => a.roleRequested === "AGENT" || a.roleAssigned === "AGENT",
  );
  const agent = accounts.find((a) => a.id === agentSessionId) ?? null;

  const links = [
    { href: "/agent", label: "Catalogue & publication", icon: Megaphone },
    { href: "/agent/loyers", label: "Loyers & quittances", icon: Wallet },
  ];

  return (
    <div className="flex flex-1 items-stretch">
      <aside className="gs-sidebar sticky top-0 h-screen overflow-y-auto">
        <Link href="/agent" className="mb-4 flex items-center gap-3 px-2" title="Espace agent">
          <LogoMark size={34} />
          <span className="gs-logotype-text text-[17px] font-bold text-white">
            GeoSmart Immo
          </span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Espace professionnel">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              title={l.label}
              className="gs-side-link"
              aria-current={pathname === l.href ? "page" : undefined}
            >
              <l.icon size={19} aria-hidden />
              <span className="gs-side-label">{l.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-6 hidden rounded-[12px] bg-[rgba(255,255,255,0.06)] p-3 lg:block">
          <p className="gs-side-title mb-2">Profil de démonstration</p>
          <select
            className="w-full rounded-[8px] border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] px-2 py-1.5 text-[13px] text-white"
            value={agentSessionId ?? ""}
            onChange={(e) => setAgentSession(e.target.value || null)}
            aria-label="Choisir le profil agent de démonstration"
          >
            {agentProfiles.map((a) => (
              <option key={a.id} value={a.id} className="text-[#1b2a33]">
                {a.name}
              </option>
            ))}
          </select>
          {agent && (
            <div className="mt-3 flex items-center gap-3">
              <span className="gs-avatar h-9 w-9 text-[13px]">{initials(agent.name)}</span>
              <span className="gs-side-label text-[13px] leading-tight text-[#cfdde6]">
                {agent.name}
                <br />
                <span className="text-[#7f97a6]">{ROLE_LABEL.AGENT}</span>
              </span>
            </div>
          )}
          {agent && (
            <span className={`gs-badge mt-3 ${STATUS_BADGE[agent.status]}`}>
              {STATUS_LABEL[agent.status]}
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-6">
          <Link href="/" className="gs-side-link" title="Retour au site public">
            <ArrowLeft size={19} aria-hidden />
            <span className="gs-side-label">Retour au site</span>
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <p className="gs-demo px-4 py-1.5 text-center">
          Espace professionnel de démonstration · la publication exige un compte validé par
          l&apos;administration.
        </p>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-2 lg:hidden">
          <select
            className="gs-select gs-input--sm max-w-[220px]"
            value={agentSessionId ?? ""}
            onChange={(e) => setAgentSession(e.target.value || null)}
            aria-label="Choisir le profil agent de démonstration"
          >
            {agentProfiles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {agent && (
            <span className={`gs-badge ${STATUS_BADGE[agent.status]}`}>
              {STATUS_LABEL[agent.status]}
            </span>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}