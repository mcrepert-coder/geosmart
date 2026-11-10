// Espace insecable comme separateur de milliers (lisible partout, pas de
// glyphe manquant selon la police).
function groupFr(value: number, maxFrac = 0): string {
  const fixed = value.toFixed(maxFrac);
  const [int, rawDec] = fixed.split(".");
  const dec = (rawDec ?? "").replace(/0+$/, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec ? `${grouped},${dec}` : grouped;
}

export function formatPrice(value: number): string {
  return `${groupFr(value)} FCFA`;
}

export function formatShortPrice(value: number): string {
  if (value >= 1_000_000) {
    const m = (value / 1_000_000).toFixed(1).replace(".", ",");
    return `${m} M FCFA`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)} k FCFA`;
  }
  return `${value} FCFA`;
}

export function formatSurface(m2: number): string {
  const base = `${groupFr(m2, 2)} m²`;
  if (m2 <= 10_000) return base;
  const ha = Math.floor(m2 / 10_000);
  const a = Math.floor((m2 % 10_000) / 100);
  const ca = Math.round(m2 % 100);
  return `${base} (${ha} ha ${a} a ${ca} ca)`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(d)} ${new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(d)}`;
}

// Horloge de demonstration : les donnees d'exemple vivent au 24/10/2026.
const DEMO_TODAY = "2026-10-24";
const DEMO_YESTERDAY = "2026-10-23";

export function formatReceived(iso: string): string {
  const day = iso.slice(0, 10);
  if (day >= DEMO_TODAY) {
    return new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(iso));
  }
  if (day === DEMO_YESTERDAY) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

export function isSinceYesterday(iso: string): boolean {
  return iso.slice(0, 10) >= DEMO_YESTERDAY;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}