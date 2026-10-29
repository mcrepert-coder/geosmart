// Fonctions pures (aucun import a l'execution) : testees par
// node --test src/app/parcelle/_lib/parcelle.test.mjs.
import type { LegalStatus, ParcelPublicStatus } from "./api";

// Formats locaux du design system : 24/10/2026, 09:42, 452,18 m2, hectares
// au-dela de 10 000 m2. Espace insecable entre milliers et avant l'unite.

const NBSP = " ";

function frNumber(value: number, decimals: number): string {
  const [whole, fraction] = value.toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return fraction ? `${grouped},${fraction}` : grouped;
}

export function formatArea(m2: number): string {
  const base = `${frNumber(m2, 2)}${NBSP}m²`;
  if (m2 <= 10000) return base;
  const total = Math.round(m2);
  const ha = Math.floor(total / 10000);
  const a = Math.floor((total % 10000) / 100);
  const ca = total % 100;
  return `${base} (${ha}${NBSP}ha ${a}${NBSP}a ${ca}${NBSP}ca)`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Heure de Lome (UTC+0, sans heure d'ete).
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} à ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Date seule du contrat (AAAA-MM-JJ) vers JJ/MM/AAAA.
export function formatPlainDate(value: string): string {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

// Empreinte : 8 premiers + 8 derniers caracteres.
export function shortHash(hash: string): string {
  return hash.length <= 16 ? hash : `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

// Libelles des statuts juridiques, toujours ecrits en toutes lettres.
const LEGAL_STATUS_LABELS: Record<LegalStatus, string> = {
  TITRE: "Titré",
  COUTUMIER_NON_TITRE: "Coutumier non titré",
  EN_LITIGE: "En litige",
  INCONNU: "Statut non renseigné",
};

export function legalStatusLabel(status: LegalStatus): string {
  return LEGAL_STATUS_LABELS[status];
}

export function shareUrl(origin: string, id: string): string {
  return `${origin}/parcelle?id=${encodeURIComponent(id)}`;
}

// Message pre-rempli (EF-308, RG-07) : ce que la page affiche deja
// publiquement, le lien, et la mention obligatoire.
export function shareMessage(p: ParcelPublicStatus, url: string): string {
  return [
    `Parcelle ${p.id} sur GeoSmart Field`,
    `${legalStatusLabel(p.legalStatus)} · ${formatArea(p.areaM2)} · ${p.certified ? "parcelle certifiée" : "parcelle non certifiée"}`,
    url,
    "Ne vaut pas titre foncier.",
  ].join("\n");
}
