"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Marker,
  Polygon,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { BasemapOverlays, SafeMap } from "../safe-map";
import {
  CRS,
  divIcon,
  TileLayer as LeafletTileLayer,
  type LatLngBoundsExpression,
  type MapOptions,
} from "leaflet";
import { Loader2, Maximize, Minus, Plus, TriangleAlert } from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { Property } from "@/lib/data";
import { formatShortPrice } from "@/lib/format";
import {
  GEO_CENTER,
  RISK_LABEL,
  RISK_ZONES,
  localToGeo,
  parcelRing,
  ringToGeo,
  ringToLatLng,
  type RiskKind,
} from "@/lib/parcel-geo";

const BOUNDS: LatLngBoundsExpression = [
  [0, 0],
  [1000, 1000],
];

const MAP_STYLE: CSSProperties = { height: "100%", width: "100%" };

const PLAN_OPTIONS: MapOptions = {
  crs: CRS.Simple,
  zoomSnap: 0.5,
  minZoom: -2,
  maxZoom: 3,
  zoomControl: false,
  attributionControl: false,
};

const GEO_OPTIONS: MapOptions = {
  minZoom: 9,
  maxZoom: 19,
  zoomControl: false,
  attributionControl: false,
};

const ESRI_SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const RISK_COLOR: Record<RiskKind, string> = {
  INONDABLE: "#2b7aa0",
  RESERVE: "#c77d1a",
};

type Mode = "plan" | "geo";

function toLatLng(p: Property): [number, number] {
  return [1000 - p.coords.y, p.coords.x];
}

function geoPoint(p: Property): [number, number] {
  if (p.mapLocation) return [p.mapLocation.latitude, p.mapLocation.longitude];
  return localToGeo(p.coords.x, p.coords.y);
}

function geoBounds(properties: Property[]): LatLngBoundsExpression {
  if (properties.length === 0) {
    return [
      [GEO_CENTER[0] - 0.06, GEO_CENTER[1] - 0.09],
      [GEO_CENTER[0] + 0.06, GEO_CENTER[1] + 0.09],
    ];
  }
  const pts = properties.map(geoPoint);
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

function pinIcon(p: Property, hovered: boolean, selected: boolean) {
  const cls = `gs-pin ${hovered ? "gs-pin--hover" : ""} ${selected ? "gs-pin--selected" : ""}`;
  const label = selected
    ? `<span class="gs-pin-label">${formatShortPrice(p.price)}</span>`
    : "";
  return divIcon({
    className: cls,
    html: `${label}<svg width="34" height="46" viewBox="0 0 34 46" aria-hidden="true">
      <path d="M17 3 C24 3 29 8 29 15 C29 22 22 28 17 44 C12 28 5 22 5 15 C5 8 10 3 17 3 Z" fill="#D36534" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="17" cy="15" r="4.5" fill="#115471"/>
    </svg>`,
    iconSize: [34, 46],
    iconAnchor: [17, 44],
  });
}

function clusterIcon(count: number) {
  return divIcon({
    className: "gs-cluster",
    html: `<div>${count}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function FitOnMount() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(BOUNDS, { padding: [8, 8] });
  }, [map]);
  return null;
}

function PanToSelected({
  selected,
  project,
}: {
  selected: Property | null;
  project: (p: Property) => [number, number];
}) {
  const map = useMap();
  useEffect(() => {
    if (selected) map.panTo(project(selected), { animate: true });
  }, [map, selected, project]);
  return null;
}

function MapControls({ mode, properties }: { mode: Mode; properties: Property[] }) {
  const map = useMap();
  const recenter = () => {
    if (mode === "plan") map.fitBounds(BOUNDS, { padding: [8, 8] });
    else map.fitBounds(geoBounds(properties), { padding: [24, 24] });
  };
  return (
    <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
      <button className="gs-iconbtn" aria-label="Zoom avant" onClick={() => map.zoomIn()}>
        <Plus size={18} />
      </button>
      <button className="gs-iconbtn" aria-label="Zoom arrière" onClick={() => map.zoomOut()}>
        <Minus size={18} />
      </button>
      <button className="gs-iconbtn" aria-label="Recentrer la carte" onClick={recenter}>
        <Maximize size={18} />
      </button>
    </div>
  );
}

function ParcelPolygons({
  properties,
  mode,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: {
  properties: Property[];
  mode: Mode;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {properties.filter((p) => !p.mapLocation).map((p) => {
        const ring = parcelRing(p);
        const positions = mode === "plan" ? ringToLatLng(ring) : ringToGeo(ring);
        const active = hoveredId === p.id || selectedId === p.id;
        const color =
          mode === "geo"
            ? active
              ? "#f08a5d"
              : "#8ecae6"
            : active
              ? "#d36534"
              : "#115471";
        return (
          <Polygon
            key={p.id}
            positions={positions}
            pathOptions={{
              color,
              weight: active ? 2.5 : 1.5,
              dashArray: active ? undefined : "6 4",
              fillColor: color,
              fillOpacity: active ? 0.22 : 0.07,
            }}
            eventHandlers={{
              mouseover: () => onHover(p.id),
              mouseout: () => onHover(null),
              click: () => onSelect(p.id),
            }}
          >
            <Tooltip sticky direction="top" opacity={1}>
              <span className="font-semibold">{p.parcelId}</span> · emprise levée RTK
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

function RiskLayer({ mode }: { mode: Mode }) {
  return (
    <>
      {RISK_ZONES.map((z) => {
        const positions = mode === "plan" ? ringToLatLng(z.ring) : ringToGeo(z.ring);
        const color = RISK_COLOR[z.kind];
        return (
          <Polygon
            key={z.id}
            positions={positions}
            pathOptions={{
              color,
              weight: 2,
              dashArray: z.kind === "RESERVE" ? "5 5" : undefined,
              fillColor: color,
              fillOpacity: 0.22,
            }}
          >
            <Tooltip sticky direction="top" opacity={1}>
              {z.label}
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

// Repli hors ligne : si les tuiles Esri echouent ou tardent, on revient au plan.
function GeoBasemap({
  onLoad,
  onUnavailable,
}: {
  onLoad: () => void;
  onUnavailable: () => void;
}) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!done.current) onUnavailable();
    }, 5000);
    return () => clearTimeout(t);
  }, [onUnavailable]);
  useLayoutEffect(() => {
    if (!map.getPane("tilePane") || !map.getContainer().isConnected) {
      onUnavailable();
      return;
    }

    const layer = new LeafletTileLayer(ESRI_SAT, {
      maxZoom: 19,
      attribution: "Imagerie © Esri, Maxar, Earthstar Geographics",
    });
    const handleLoad = () => {
      done.current = true;
      onLoad();
    };
    const handleTileError = () => {
      done.current = true;
      onUnavailable();
    };

    layer.on("load", handleLoad);
    layer.on("tileerror", handleTileError);
    layer.addTo(map);

    return () => {
      layer.off("load", handleLoad);
      layer.off("tileerror", handleTileError);
      layer.remove();
    };
  }, [map, onLoad, onUnavailable]);
  return null;
}

type Cluster = { ids: string[]; center: [number, number]; props: Property[] };

function Markers({
  properties,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  project,
  zoomCap,
}: {
  properties: Property[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  project: (p: Property) => [number, number];
  zoomCap: number;
}) {
  const map = useMap();
  const [, setTick] = useState(0);
  useMapEvents({
    zoomend: () => setTick((t) => t + 1),
    moveend: () => setTick((t) => t + 1),
  });

  const clusters: Cluster[] = [];
  const zoom = map.getZoom();
  for (const p of properties) {
    const ll = project(p);
    const pt = map.project(ll, zoom);
    const near = clusters.find((c) => {
      const cp = map.project(c.center, zoom);
      return Math.hypot(cp.x - pt.x, cp.y - pt.y) < 44;
    });
    if (near) {
      near.ids.push(p.id);
      near.props.push(p);
      near.center = [
        (near.center[0] * (near.ids.length - 1) + ll[0]) / near.ids.length,
        (near.center[1] * (near.ids.length - 1) + ll[1]) / near.ids.length,
      ];
    } else {
      clusters.push({ ids: [p.id], center: ll, props: [p] });
    }
  }

  return (
    <>
      {clusters.map((c) =>
        c.ids.length > 1 ? (
          <Marker
            key={`c-${c.ids.join("-")}`}
            position={c.center}
            icon={clusterIcon(c.ids.length)}
            eventHandlers={{
              click: () => map.setView(c.center, Math.min(map.getZoom() + 1.5, zoomCap)),
            }}
          />
        ) : (
          <Marker
            key={c.props[0].id}
            position={c.center}
            icon={pinIcon(
              c.props[0],
              hoveredId === c.props[0].id,
              selectedId === c.props[0].id,
            )}
            eventHandlers={{
              mouseover: () => onHover(c.props[0].id),
              mouseout: () => onHover(null),
              click: () => onSelect(c.props[0].id),
            }}
          />
        ),
      )}
    </>
  );
}

function Swatch({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="inline-block h-3 w-4 flex-none rounded-[3px]"
        style={{ background: `${color}33`, border: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
      />
      <span>{label}</span>
    </div>
  );
}

export default function AnnoncesMap({
  properties,
  liveLocations,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: {
  properties: Property[];
  liveLocations: boolean;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const selected = properties.find((p) => p.id === selectedId) ?? null;
  const [mode, setMode] = useState<Mode>(liveLocations ? "geo" : "plan");
  const [showRisks, setShowRisks] = useState(!liveLocations);
  const [satUnavailable, setSatUnavailable] = useState(false);
  const [satLoaded, setSatLoaded] = useState(false);

  const handleSatLoad = useCallback(() => setSatLoaded(true), []);
  const handleSatUnavailable = useCallback(() => {
    setSatUnavailable(true);
    setSatLoaded(false);
    if (!liveLocations) setMode("plan");
  }, [liveLocations]);

  const switchMode = (m: Mode) => {
    if (m === "geo") setSatLoaded(false);
    setMode(m);
  };

  const parcelLegendColor = mode === "geo" ? "#8ecae6" : "#115471";

  return (
    <div className="gs-map relative h-[360px] lg:h-[560px]" role="region" aria-label="Carte des annonces">
      {/* Deux cartes distinctes : Leaflet ne change pas de CRS a chaud. */}
      {mode === "plan" ? (
        <SafeMap key="plan" options={PLAN_OPTIONS} fit={BOUNDS} style={MAP_STYLE}>
          <BasemapOverlays bounds={BOUNDS} />
          <FitOnMount />
          {showRisks && <RiskLayer mode="plan" />}
          <ParcelPolygons
            properties={properties}
            mode="plan"
            hoveredId={hoveredId}
            selectedId={selectedId}
            onHover={onHover}
            onSelect={onSelect}
          />
          <PanToSelected selected={selected} project={toLatLng} />
          <MapControls mode="plan" properties={properties} />
          <Markers
            properties={properties}
            hoveredId={hoveredId}
            selectedId={selectedId}
            onHover={onHover}
            onSelect={onSelect}
            project={toLatLng}
            zoomCap={3}
          />
        </SafeMap>
      ) : (
        <SafeMap
          key="geo"
          options={GEO_OPTIONS}
          fit={geoBounds(properties)}
          fitOptions={{ padding: [24, 24] }}
          style={MAP_STYLE}
        >
          <GeoBasemap onLoad={handleSatLoad} onUnavailable={handleSatUnavailable} />
          {showRisks && <RiskLayer mode="geo" />}
          <ParcelPolygons
            properties={properties}
            mode="geo"
            hoveredId={hoveredId}
            selectedId={selectedId}
            onHover={onHover}
            onSelect={onSelect}
          />
          <PanToSelected selected={selected} project={geoPoint} />
          <MapControls mode="geo" properties={properties} />
          <Markers
            properties={properties}
            hoveredId={hoveredId}
            selectedId={selectedId}
            onHover={onHover}
            onSelect={onSelect}
            project={geoPoint}
            zoomCap={19}
          />
        </SafeMap>
      )}

      <div className="absolute left-3 top-3 z-[1000] flex flex-col items-start gap-2">
        <div className="gs-seg" role="group" aria-label="Fond de carte" style={{ boxShadow: "var(--shadow-2)" }}>
          {!liveLocations && (
            <button aria-pressed={mode === "plan"} onClick={() => switchMode("plan")}>
              Plan
            </button>
          )}
          <button
            aria-pressed={mode === "geo"}
            disabled={satUnavailable}
            onClick={() => switchMode("geo")}
            className="disabled:cursor-not-allowed disabled:opacity-40"
            title={satUnavailable ? "Imagerie satellite indisponible hors ligne" : "Fond satellite"}
          >
            Satellite
          </button>
        </div>
        {!liveLocations && <button
          className={`gs-chip ${showRisks ? "gs-chip--active" : ""}`}
          aria-pressed={showRisks}
          onClick={() => setShowRisks((v) => !v)}
          style={{ boxShadow: "var(--shadow-2)" }}
        >
          <TriangleAlert size={15} /> Zones à risques
        </button>}
      </div>

      {(showRisks || liveLocations) && (
        <div
          className="absolute bottom-3 left-3 z-[1000] rounded-xl px-3 py-2.5 text-[12px] leading-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-2)",
            color: "var(--text)",
          }}
        >
          <div className="mb-1.5 font-semibold" style={{ color: "var(--text-muted)" }}>
            Légende
          </div>
          {liveLocations ? (
            <span>Repère approximatif, précision volontairement limitée à environ 1 km.</span>
          ) : (
            <>
              <Swatch color={parcelLegendColor} label="Emprise parcelle (levé RTK)" dashed />
              <Swatch color={RISK_COLOR.INONDABLE} label={RISK_LABEL.INONDABLE} />
              <Swatch color={RISK_COLOR.RESERVE} label={RISK_LABEL.RESERVE} dashed />
            </>
          )}
        </div>
      )}

      {mode === "geo" && (
        <div
          className="absolute bottom-2 right-2 z-[1000] rounded-md px-2 py-0.5 text-[10px]"
          style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          Imagerie © Esri, Maxar, Earthstar Geographics
        </div>
      )}

      {mode === "geo" && !satLoaded && !satUnavailable && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center" style={{ background: "var(--scrim)" }}>
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
            style={{ background: "var(--surface)", color: "var(--text)", boxShadow: "var(--shadow-2)" }}
          >
            <Loader2 size={18} className="animate-spin" /> Chargement de l&apos;imagerie satellite
          </div>
        </div>
      )}
    </div>
  );
}
