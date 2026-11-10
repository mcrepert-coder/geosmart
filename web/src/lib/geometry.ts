// Geometrie plane pour les alertes de chevauchement : coordonnees en metres
// (repere local UTM 31N simplifie), intersection de polygones convexes.

export type Pt = [number, number];

function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonArea(pts: Pt[]): number {
  return Math.abs(signedArea(pts));
}

function ccw(pts: Pt[]): Pt[] {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Sutherland-Hodgman : sujet et clip convexes, meme orientation.
export function convexIntersect(subject: Pt[], clip: Pt[]): Pt[] {
  let out = ccw(subject);
  const c = ccw(clip);
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const input = out;
    out = [];
    if (input.length === 0) break;
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const cp = cross(a, b, p);
      const cq = cross(a, b, q);
      if (cp >= 0) {
        out.push(p);
        if (cq < 0) out.push(lineIntersect(a, b, p, q));
      } else if (cq >= 0) {
        out.push(lineIntersect(a, b, p, q));
      }
    }
  }
  return out;
}

function lineIntersect(a: Pt, b: Pt, p: Pt, q: Pt): Pt {
  const a1 = b[1] - a[1];
  const b1 = a[0] - b[0];
  const c1 = a1 * a[0] + b1 * a[1];
  const a2 = q[1] - p[1];
  const b2 = p[0] - q[0];
  const c2 = a2 * p[0] + b2 * p[1];
  const d = a1 * b2 - a2 * b1;
  if (d === 0) return p;
  return [(b2 * c1 - b1 * c2) / d, (a1 * c2 - a2 * c1) / d];
}

export function polygonBounds(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function centroid(pts: Pt[]): Pt {
  const n = pts.length;
  return [
    pts.reduce((s, p) => s + p[0], 0) / n,
    pts.reduce((s, p) => s + p[1], 0) / n,
  ];
}