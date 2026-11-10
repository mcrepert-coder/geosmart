// Geometrie des parcelles et calques thematiques pour la carte publique.
// Repere local (0..1000) du plan stylise + projection vers Lomé pour le satellite.

import type { Property } from "./data";
import type { Pt } from "./geometry";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Emprise levee : quadrilatere deterministe centre sur le bien, taille liee a la surface.
export function parcelRing(p: Property): Pt[] {
  const r = rng(hash(p.id));
  const side = Math.sqrt(p.surfaceM2);
  const half = Math.min(58, Math.max(16, side * 0.55));
  const { x: cx, y: cy } = p.coords;
  return [
    [cx - half + r() * 6, cy - half * 0.8 + r() * 6],
    [cx + half - r() * 6, cy - half * 0.9 + r() * 6],
    [cx + half * 0.9 - r() * 6, cy + half * 0.8 - r() * 6],
    [cx - half * 0.8 + r() * 6, cy + half * 0.9 - r() * 6],
  ];
}

export type RiskKind = "INONDABLE" | "RESERVE";
export type RiskZone = { id: string; kind: RiskKind; label: string; ring: Pt[] };

export const RISK_ZONES: RiskZone[] = [
  {
    id: "rz-inond-1",
    kind: "INONDABLE",
    label: "Zone inondable · bas-fond de Légbassito",
    ring: [
      [620, 620],
      [760, 600],
      [800, 700],
      [700, 760],
      [610, 720],
    ],
  },
  {
    id: "rz-inond-2",
    kind: "INONDABLE",
    label: "Zone inondable · bordure lagune Est",
    ring: [
      [840, 380],
      [960, 360],
      [980, 480],
      [880, 520],
      [820, 460],
    ],
  },
  {
    id: "rz-reserve-1",
    kind: "RESERVE",
    label: "Réserve administrative · emprise publique Nord",
    ring: [
      [300, 120],
      [470, 100],
      [500, 220],
      [360, 260],
      [280, 200],
    ],
  },
];

export const RISK_LABEL: Record<RiskKind, string> = {
  INONDABLE: "Zone inondable",
  RESERVE: "Réserve administrative",
};

// Projection du repere local vers lat/lng Lomé (pour le fond satellite).
const LAT_MIN = 6.08;
const LAT_MAX = 6.22;
const LNG_MIN = 1.1;
const LNG_MAX = 1.3;

export function localToGeo(x: number, y: number): [number, number] {
  return [LAT_MAX - (y / 1000) * (LAT_MAX - LAT_MIN), LNG_MIN + (x / 1000) * (LNG_MAX - LNG_MIN)];
}

export const GEO_CENTER: [number, number] = localToGeo(500, 500);

export function ringToLatLng(ring: Pt[]): [number, number][] {
  return ring.map(([x, y]) => [1000 - y, x]);
}

export function ringToGeo(ring: Pt[]): [number, number][] {
  return ring.map(([x, y]) => localToGeo(x, y));
}