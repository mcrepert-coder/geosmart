"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/parcelle", label: "Vérifier une parcelle" },
  { href: "/parcelle/attestation", label: "Vérifier une attestation" },
];

export function ParcelleNav() {
  const pathname = usePathname();
  return (
    <nav className="gs-nav flex gap-6" aria-label="Vérifications">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
