"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./logo";

const LINKS = [
  { href: "/", label: "Annonces" },
  { href: "/parcelle", label: "Vérifier une parcelle" },
  { href: "/inscription", label: "Créer un compte" },
  { href: "/devenir-agent", label: "Devenir agent" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="gs-header gs-header--fixed">
      <div className="gs-wrap flex items-center justify-between gap-6 py-2">
        <Link href="/" aria-label="GeoSmart Field, accueil" className="py-1">
          <Logo size={34} />
        </Link>
        <nav className="gs-nav hidden md:flex" aria-label="Navigation principale">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/connexion" className="gs-btn gs-btn--secondary gs-btn--sm hidden sm:inline-flex">
            Se connecter
          </Link>
          <button
            className="gs-iconbtn md:hidden"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="gs-wrap md:hidden flex flex-col gap-1 pb-4" aria-label="Navigation mobile">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={pathname === l.href ? "page" : undefined}
              className="rounded-[10px] px-3 py-3 font-semibold text-[var(--text-muted)] aria-[current=page]:bg-[var(--primary-soft)] aria-[current=page]:text-[var(--primary)]"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/connexion"
            onClick={() => setOpen(false)}
            className="gs-btn gs-btn--secondary mt-2"
          >
            Se connecter
          </Link>
        </nav>
      )}
    </header>
  );
}