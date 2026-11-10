import type { Property, PropertyType } from "./data";

// Visuels de demonstration (DEMO_MODE) : photos seedees par type de bien.
const BY_TYPE: Record<PropertyType, [string, string]> = {
  TERRAIN: ["/photos/terrain-1.png", "/photos/terrain-2.png"],
  MAISON: ["/photos/maison-1.png", "/photos/maison-2.png"],
};

export function photosFor(p: Property): [string, string] {
  if (p.remotePhotos?.length) {
    return [p.remotePhotos[0], p.remotePhotos[1] ?? p.remotePhotos[0]];
  }
  return BY_TYPE[p.type];
}

export function primaryPhoto(p: Property): string {
  return BY_TYPE[p.type][0];
}