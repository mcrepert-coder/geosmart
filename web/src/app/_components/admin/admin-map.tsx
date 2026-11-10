"use client";

import Link from "next/link";
import { useState } from "react";
import { Marker } from "react-leaflet";
import { BasemapOverlays, SafeMap } from "../safe-map";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X } from "lucide-react";
import { PROPERTIES, type Property } from "@/lib/data";
import { formatSurface } from "@/lib/format";
import { CertBadge, LegalBadge } from "../badges";

const BOUNDS: L.LatLngBoundsExpression = [[0, 0], [1000, 1000]];
const PLAN_OPTIONS: L.MapOptions = {
  crs: L.CRS.Simple,
  zoomSnap: 0.5,
  minZoom: -2,
  maxZoom: 3,
  zoomControl: false,
  attributionControl: false,
};
const toLatLng = (p: Property): L.LatLngExpression => [1000 - p.coords.y, p.coords.x];

const FILL: Record<Property["legalStatus"], string> = {
  TITRE: "var(--parcel-titre)",
  COUTUMIER_NON_TITRE: "var(--parcel-coutumier)",
  EN_LITIGE: "var(--parcel-litige)",
  INCONNU: "var(--border-strong)",
};

function pinIcon(p: Property, selected: boolean) {
  return L.divIcon({
    className: `gs-pin ${selected ? "gs-pin--selected" : ""}`,
    html: `<svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 1 C22 1 28 6.5 28 14 C28 22 20 30 15 37 C10 30 2 22 2 14 C2 6.5 8 1 15 1 Z" fill="${FILL[p.legalStatus]}" stroke="#ffffff" stroke-width="2"/><circle cx="15" cy="14" r="4.5" fill="#ffffff"/></svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
  });
}

export default function AdminMap() {
  const [sel, setSel] = useState<Property | null>(null);
  return (
    <div className="gs-map relative h-[520px]">
      <SafeMap
        options={PLAN_OPTIONS}
        fit={BOUNDS}
        fitOptions={{ padding: [10, 10] }}
        className="h-full w-full"
      >
        <BasemapOverlays bounds={BOUNDS} />
        {PROPERTIES.map((p) => (
          <Marker
            key={p.id}
            position={toLatLng(p)}
            icon={pinIcon(p, sel?.id === p.id)}
            eventHandlers={{ click: () => setSel(p) }}
            keyboard={false}
          />
        ))}
      </SafeMap>
      <div className="gs-card absolute bottom-4 left-4 z-[1000] flex flex-col gap-1.5 p-3">
        <p className="gs-module text-[var(--text-muted)]">Statut juridique</p>
        {(
          [
            ["TITRE", "Titré"],
            ["COUTUMIER_NON_TITRE", "Coutumier non titré"],
            ["EN_LITIGE", "En litige"],
          ] as [Property["legalStatus"], string][]
        ).map(([k, label]) => (
          <span key={k} className="flex items-center gap-2 text-[12px] font-semibold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: FILL[k] }} />
            {label}
          </span>
        ))}
      </div>
      {sel && (
        <div className="gs-card absolute right-4 top-4 z-[1000] w-72 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="gs-mono font-bold">{sel.parcelId}</p>
            <button className="gs-iconbtn h-8 w-8" onClick={() => setSel(null)} aria-label="Fermer">
              <X size={16} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <LegalBadge status={sel.legalStatus} />
            <CertBadge certified={sel.parcelCertified} kind="parcelle" />
          </div>
          <p className="gs-caption mt-2">
            {sel.zone} · {formatSurface(sel.surfaceM2)}
          </p>
          <div className="mt-3 flex gap-2">
            <Link href={`/parcelle?id=${sel.parcelId}`} className="gs-btn gs-btn--primary gs-btn--sm flex-1">
              Vérifier
            </Link>
            <Link href={`/?bien=${sel.id}`} className="gs-btn gs-btn--secondary gs-btn--sm flex-1">
              Annonce
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}