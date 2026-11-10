"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMap } from "react-leaflet";
import { LeafletContext, createLeafletContext, type LeafletContextInterface } from "@react-leaflet/core";
import {
  ImageOverlay as LeafletImageOverlay,
  Map as LeafletMap,
  type FitBoundsOptions,
  type LatLngBoundsExpression,
  type MapOptions,
} from "leaflet";

// Carte Leaflet qui survit aux re-executions d'effets (HMR, StrictMode) : destruction differee, annulee au remontage.
export function SafeMap({
  options,
  fit,
  fitOptions,
  style,
  className,
  children,
}: {
  options: MapOptions;
  fit: LatLngBoundsExpression;
  fitOptions?: FitBoundsOptions;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const pendingRemove = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ctx, setCtx] = useState<LeafletContextInterface | null>(null);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (pendingRemove.current !== null) {
      clearTimeout(pendingRemove.current);
      pendingRemove.current = null;
    }
    if (!mapRef.current) {
      const map = new LeafletMap(node, options);
      map.fitBounds(fit, fitOptions);
      mapRef.current = map;
      setCtx(createLeafletContext(map));
    }
    return () => {
      pendingRemove.current = setTimeout(() => {
        pendingRemove.current = null;
        mapRef.current?.remove();
        mapRef.current = null;
      }, 0);
    };
    // La carte est creee une fois : les options sont figees a la creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={nodeRef} style={style} className={className}>
      {ctx && <LeafletContext.Provider value={ctx}>{children}</LeafletContext.Provider>}
    </div>
  );
}

// Fonds de plan SVG ajoutes a la main : le ImageOverlay de react-leaflet rejoue
// addLayer sans garde et plante si la carte vient d'etre detruite (remontage HMR).
export function BasemapOverlays({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useLayoutEffect(() => {
    if (!map.getPane("overlayPane")) return;
    const light = new LeafletImageOverlay("/map-lome.svg", bounds, { className: "gs-basemap-light" });
    const dark = new LeafletImageOverlay("/map-lome-dark.svg", bounds, { className: "gs-basemap-dark" });
    light.addTo(map);
    dark.addTo(map);
    return () => {
      light.remove();
      dark.remove();
    };
  }, [map, bounds]);
  return null;
}
