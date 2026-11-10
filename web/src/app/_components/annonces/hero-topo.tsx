// Decor du hero marche : courbes de niveau et grille cadastrale, en echo au
// leve topographique. Purement deterministe (aucun alea) pour un rendu stable.

function ringPath(cx: number, cy: number, rad: number, seed: number, stretch: number): string {
  const N = 84;
  let d = "";
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wob =
      1 +
      0.13 * Math.sin(a * 3 + seed) +
      0.07 * Math.sin(a * 5 + seed * 1.7) +
      0.05 * Math.cos(a * 2 - seed);
    const rr = rad * wob;
    const x = cx + Math.cos(a) * rr * stretch;
    const y = cy + Math.sin(a) * rr;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

const MAIN = Array.from({ length: 11 }, (_, i) => ringPath(1010, 70, 34 + i * 33, 1.3, 1.55));
const SECOND = Array.from({ length: 8 }, (_, i) => ringPath(150, 372, 26 + i * 30, 4.1, 1.35));
const GRID_X = Array.from({ length: 21 }, (_, i) => i * 60);
const GRID_Y = Array.from({ length: 8 }, (_, i) => i * 60);
const MARKS: [number, number][] = [
  [300, 120],
  [660, 60],
  [540, 300],
  [840, 240],
  [180, 180],
  [1080, 300],
];

export function HeroTopo() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="#ffffff" strokeWidth="1" opacity="0.05">
        {GRID_X.map((x) => (
          <line key={`x${x}`} x1={x} y1="0" x2={x} y2="400" />
        ))}
        {GRID_Y.map((y) => (
          <line key={`y${y}`} x1="0" y1={y} x2="1200" y2={y} />
        ))}
      </g>

      <g fill="none" stroke="#ffffff" strokeLinejoin="round">
        {MAIN.map((d, i) => (
          <path key={`m${i}`} d={d} strokeWidth={i % 3 === 0 ? 1.8 : 1.1} opacity={0.05 + (i % 3 === 0 ? 0.05 : 0)} />
        ))}
        {SECOND.map((d, i) => (
          <path key={`s${i}`} d={d} strokeWidth={i % 3 === 0 ? 1.6 : 1} opacity={0.04 + (i % 3 === 0 ? 0.04 : 0)} />
        ))}
      </g>

      <g stroke="#ffd9c2" strokeWidth="1.4" opacity="0.28">
        {MARKS.map(([x, y], i) => (
          <g key={`k${i}`}>
            <line x1={x - 6} y1={y} x2={x + 6} y2={y} />
            <line x1={x} y1={y - 6} x2={x} y2={y + 6} />
            <circle cx={x} cy={y} r="2.4" fill="#ffd9c2" stroke="none" />
          </g>
        ))}
      </g>
    </svg>
  );
}