import {
  GeometryError,
  geometryHash,
  normalizePolygon,
} from './parcel-geometry';

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [1.21, 6.13],
      [1.211, 6.13],
      [1.211, 6.131],
      [1.21, 6.131],
      [1.21, 6.13],
    ],
  ],
};

function reasonOf(input: unknown): string | undefined {
  try {
    normalizePolygon(input);
    return undefined;
  } catch (error) {
    return error instanceof GeometryError ? error.reason : 'OTHER';
  }
}

describe('normalizePolygon', () => {
  it('accepte un polygone valide', () => {
    expect(normalizePolygon(square)).toEqual(square);
  });

  it('retire une borne saisie deux fois de suite', () => {
    const doubled = {
      type: 'Polygon',
      coordinates: [
        [
          [1.21, 6.13],
          [1.211, 6.13],
          [1.211, 6.13],
          [1.211, 6.131],
          [1.21, 6.13],
        ],
      ],
    };
    expect(normalizePolygon(doubled).coordinates[0]).toHaveLength(4);
  });

  it.each([
    ['null', null, 'NOT_A_POLYGON'],
    ['un point', { type: 'Point', coordinates: [1, 6] }, 'NOT_A_POLYGON'],
    [
      'un polygone avec trou',
      {
        type: 'Polygon',
        coordinates: [square.coordinates[0], square.coordinates[0]],
      },
      'HOLES_NOT_ALLOWED',
    ],
    [
      'une coordonnee non numerique',
      {
        type: 'Polygon',
        coordinates: [
          [
            [1, '6'],
            [1, 6],
            [2, 6],
            [1, '6'],
          ],
        ],
      },
      'BAD_COORDINATE',
    ],
    [
      'une latitude hors limites',
      {
        type: 'Polygon',
        coordinates: [
          [
            [1, 6],
            [2, 6],
            [2, 95],
            [1, 6],
          ],
        ],
      },
      'OUT_OF_RANGE',
    ],
    [
      'un contour ouvert',
      { type: 'Polygon', coordinates: [square.coordinates[0].slice(0, -1)] },
      'RING_NOT_CLOSED',
    ],
    [
      'deux sommets distincts seulement',
      {
        type: 'Polygon',
        coordinates: [
          [
            [1, 6],
            [2, 6],
            [1, 6],
            [1, 6],
          ],
        ],
      },
      'TOO_FEW_VERTICES',
    ],
  ])('refuse %s', (_label, input, reason) => {
    expect(reasonOf(input)).toBe(reason);
  });
});

describe('geometryHash', () => {
  const hash = geometryHash(normalizePolygon(square));

  it('est une empreinte SHA-256', () => {
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ne depend ni du sommet de depart ni du sens de parcours', () => {
    const ring = square.coordinates[0].slice(0, -1);
    const rotated = [...ring.slice(2), ...ring.slice(0, 2)];
    const reversed = [...ring].reverse();
    for (const open of [rotated, reversed]) {
      const polygon = normalizePolygon({
        type: 'Polygon',
        coordinates: [[...open, open[0]]],
      });
      expect(geometryHash(polygon)).toBe(hash);
    }
  });

  it('change si une borne bouge', () => {
    const moved = structuredClone(square);
    moved.coordinates[0][1] = [1.2111, 6.13];
    expect(geometryHash(normalizePolygon(moved))).not.toBe(hash);
  });
});
