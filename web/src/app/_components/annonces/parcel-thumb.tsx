import type { Property } from "@/lib/data";

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

const W = 400;
const H = 240;

// Vue aerienne stylisee : emprise levee, bornes, voirie et bati.
// Deterministe par identifiant pour que chaque annonce garde sa vue.
export function ParcelThumb({ property }: { property: Property }) {
  const r = rng(hash(property.id));
  const [c0, c1] = property.photoHue;
  const gid = `pt-${property.id}`;
  const isMaison = property.type !== "TERRAIN";

  const pts: [number, number][] = [
    [62 + r() * 34, 44 + r() * 22],
    [W - 62 - r() * 34, 40 + r() * 20],
    [W - 56 - r() * 28, H - 46 - r() * 22],
    [58 + r() * 28, H - 42 - r() * 20],
  ];
  const poly = pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

  const roadY = 60 + r() * 120;
  const road = `M -12 ${roadY.toFixed(0)} C 120 ${(roadY - 26).toFixed(0)}, 260 ${(roadY + 30).toFixed(0)}, ${W + 12} ${(roadY - 12).toFixed(0)}`;

  const patches = Array.from({ length: 4 }, () => ({
    x: r() * W,
    y: r() * H,
    w: 70 + r() * 120,
    h: 40 + r() * 70,
    rot: -18 + r() * 36,
    light: r() > 0.5,
  }));
  const trees = Array.from({ length: 7 }, () => ({
    x: 20 + r() * (W - 40),
    y: 20 + r() * (H - 40),
    rad: 4 + r() * 6,
  }));
  const rows = Array.from({ length: 6 }, (_, i) => 40 + i * 30 + r() * 8);
  const house = { x: 150 + r() * 60, y: 90 + r() * 40, rot: -8 + r() * 16 };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gid}-ground`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c0} />
          <stop offset="1" stopColor={c1} />
        </linearGradient>
        <radialGradient id={`${gid}-light`} cx="0.22" cy="0.08" r="0.95">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="0.62" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}-vig`} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.26" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill={`url(#${gid}-ground)`} />

      {patches.map((p, i) => (
        <rect
          key={i}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          transform={`rotate(${p.rot.toFixed(1)} ${p.x.toFixed(0)} ${p.y.toFixed(0)})`}
          fill={p.light ? "#ffffff" : "#000000"}
          opacity={p.light ? 0.06 : 0.07}
        />
      ))}

      {!isMaison &&
        rows.map((y, i) => (
          <path
            key={i}
            d={`M -10 ${y.toFixed(0)} L ${W + 10} ${(y - 26).toFixed(0)}`}
            stroke="#000000"
            strokeWidth="3"
            opacity="0.06"
            fill="none"
          />
        ))}

      <path d={road} stroke="#efe9dc" strokeWidth="10" opacity="0.5" fill="none" />
      <path d={road} stroke="#c9c2b2" strokeWidth="1.2" strokeDasharray="10 8" opacity="0.7" fill="none" />

      {trees.map((t, i) => (
        <circle key={i} cx={t.x.toFixed(0)} cy={t.y.toFixed(0)} r={t.rad.toFixed(1)} fill="#2f4a33" opacity="0.3" />
      ))}

      {isMaison && (
        <g transform={`rotate(${house.rot.toFixed(1)} ${house.x.toFixed(0)} ${house.y.toFixed(0)})`}>
          <rect x={house.x + 4} y={house.y + 5} width="86" height="58" fill="#000000" opacity="0.22" />
          <rect x={house.x} y={house.y} width="86" height="58" fill="#b5502f" />
          <path d={`M ${house.x} ${house.y + 29} L ${house.x + 86} ${house.y + 29}`} stroke="#e08a63" strokeWidth="3" />
          <path d={`M ${house.x} ${house.y} L ${house.x + 86} ${house.y}`} stroke="#8d3c22" strokeWidth="2" />
        </g>
      )}

      <polygon
        points={poly}
        fill="#ffffff"
        fillOpacity="0.09"
        stroke="#ffffff"
        strokeWidth="2"
        strokeDasharray="7 5"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="4" fill="#ffffff" stroke="#0b3549" strokeWidth="1.5" />
          <circle cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="1.5" fill="#0b3549" />
        </g>
      ))}

      <rect width={W} height={H} fill={`url(#${gid}-light)`} />
      <rect width={W} height={H} fill={`url(#${gid}-vig)`} />

      <g opacity="0.85">
        <path d={`M ${W - 26} 26 L ${W - 21} 40 L ${W - 26} 36 L ${W - 31} 40 Z`} fill="#ffffff" />
        <path d={`M 20 ${H - 20} L 68 ${H - 20}`} stroke="#ffffff" strokeWidth="2" />
        <path d={`M 20 ${H - 24} L 20 ${H - 16} M 68 ${H - 24} L 68 ${H - 16}`} stroke="#ffffff" strokeWidth="2" />
      </g>
    </svg>
  );
}