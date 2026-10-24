import { createHash } from 'crypto';
import { canonicalize } from '../audit/canonical-json';
import { validateVertices, Vertex } from './validate-vertices';

export type Position = [number, number];

export interface ParcelPolygon {
  type: 'Polygon';
  coordinates: [Position[]];
}

export interface PreparedParcelGeometry {
  vertices: Vertex[];
  geometry: ParcelPolygon;
  geometryHash: string;
}

// Preparation uniquement : la validite spatiale (dont auto-intersections) et
// les chevauchements doivent encore etre controles sur PostGIS avant stockage.
// Aucun tri, arrondi, changement de sens ou calcul de surface n'est applique.
export function prepareParcelGeometry(input: unknown): PreparedParcelGeometry {
  const vertices = validateVertices(input);
  const ring: Position[] = vertices.map(({ lon, lat }) => [lon, lat]);
  ring.push([ring[0][0], ring[0][1]]);
  const geometry: ParcelPolygon = { type: 'Polygon', coordinates: [ring] };
  const geometryHash = createHash('sha256')
    .update(canonicalize(geometry), 'utf8')
    .digest('hex');
  return { vertices, geometry, geometryHash };
}
