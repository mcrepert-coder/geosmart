import { createHash } from 'node:crypto';
import type { Polygon } from 'typeorm';

export type GeometryErrorReason =
  | 'NOT_A_POLYGON'
  | 'HOLES_NOT_ALLOWED'
  | 'BAD_COORDINATE'
  | 'OUT_OF_RANGE'
  | 'RING_NOT_CLOSED'
  | 'TOO_FEW_VERTICES'
  | 'SELF_INTERSECTION'
  | 'INVALID_GEOMETRY';

export class GeometryError extends Error {
  constructor(
    readonly reason: GeometryErrorReason,
    message: string,
  ) {
    super(message);
  }
}

type Position = [number, number];

// Precision de comparaison des sommets : 1e-9 degre, soit environ 0,1 mm.
const DECIMALS = 9;

function round(value: number): number {
  return Number(value.toFixed(DECIMALS));
}

function readRing(input: unknown): Position[] {
  if (
    input === null ||
    typeof input !== 'object' ||
    (input as { type?: unknown }).type !== 'Polygon' ||
    !Array.isArray((input as { coordinates?: unknown }).coordinates)
  ) {
    throw new GeometryError(
      'NOT_A_POLYGON',
      'La geometrie doit etre un polygone GeoJSON.',
    );
  }
  const rings = (input as { coordinates: unknown[] }).coordinates;
  if (rings.length !== 1) {
    throw new GeometryError(
      rings.length === 0 ? 'NOT_A_POLYGON' : 'HOLES_NOT_ALLOWED',
      'Le polygone doit avoir un seul contour, sans trou.',
    );
  }
  const ring = rings[0];
  if (!Array.isArray(ring)) {
    throw new GeometryError('NOT_A_POLYGON', 'Le contour est mal forme.');
  }
  return ring.map((position: unknown, index) => {
    if (
      !Array.isArray(position) ||
      position.length !== 2 ||
      !position.every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      throw new GeometryError(
        'BAD_COORDINATE',
        `Le sommet ${index + 1} doit etre [longitude, latitude].`,
      );
    }
    const [lon, lat] = position as Position;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new GeometryError(
        'OUT_OF_RANGE',
        `Le sommet ${index + 1} est hors des limites WGS84.`,
      );
    }
    return [round(lon), round(lat)];
  });
}

// Controles faits avant PostGIS. L'auto-intersection est verifiee par
// PostGIS (ST_IsValid) dans ParcelGeometryService.
export function normalizePolygon(input: unknown): Polygon {
  const ring = readRing(input);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length < 2 || first[0] !== last[0] || first[1] !== last[1]) {
    throw new GeometryError(
      'RING_NOT_CLOSED',
      'Le contour doit se refermer sur son premier sommet.',
    );
  }
  // Sommets consecutifs identiques : une borne saisie deux fois.
  const open = ring
    .slice(0, -1)
    .filter(
      (p, i, all) =>
        i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1],
    );
  const distinct = new Set(open.map((p) => `${p[0]},${p[1]}`));
  if (distinct.size < 3) {
    throw new GeometryError(
      'TOO_FEW_VERTICES',
      'Une parcelle doit avoir au moins 3 sommets distincts.',
    );
  }
  return { type: 'Polygon', coordinates: [[...open, open[0]]] };
}

// Empreinte du polygone normalise : la meme forme donne la meme empreinte,
// quel que soit le sommet de depart ou le sens de parcours.
export function geometryHash(polygon: Polygon): string {
  const open = polygon.coordinates[0].slice(0, -1) as Position[];
  const area2 = open.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = open[(i + 1) % open.length];
    return sum + x1 * y2 - x2 * y1;
  }, 0);
  const ccw = area2 > 0 ? open : [...open].reverse();
  let start = 0;
  ccw.forEach(([x, y], i) => {
    const [bx, by] = ccw[start];
    if (x < bx || (x === bx && y < by)) start = i;
  });
  const ordered = [...ccw.slice(start), ...ccw.slice(0, start)];
  const text = ordered
    .map(([x, y]) => `${x.toFixed(DECIMALS)},${y.toFixed(DECIMALS)}`)
    .join(';');
  return createHash('sha256').update(text).digest('hex');
}
