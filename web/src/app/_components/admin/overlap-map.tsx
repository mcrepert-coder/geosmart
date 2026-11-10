import { centroid, convexIntersect, polygonBounds, type Pt } from "@/lib/geometry";
import { formatSurface } from "@/lib/format";
import type { OverlapAlert } from "@/lib/data";

const S = 16;
const PAD = 2.5;

export function OverlapMap({ alert }: { alert: OverlapAlert }) {
  const zone = convexIntersect(alert.existingPoly, alert.submittedPoly);
  const all = [...alert.existingPoly, ...alert.submittedPoly];
  const b = polygonBounds(all);
  const W = (b.maxX - b.minX + PAD * 2) * S;
  const H = (b.maxY - b.minY + PAD * 2) * S + 26;
  const px = (p: Pt): Pt => [(p[0] - b.minX + PAD) * S, (p[1] - b.minY + PAD) * S];
  const points = (poly: Pt[]) => poly.map((p) => px(p).map((v) => v.toFixed(1)).join(",")).join(" ");

  const cEx = px(centroid(alert.existingPoly));
  const cSu = px(centroid(alert.submittedPoly));
  const zTop = zone.length ? px(zone.reduce((a, p) => (p[1] < a[1] ? p : a))) : null;
  const zBot = zone.length ? px(zone.reduce((a, p) => (p[1] > a[1] ? p : a))) : null;
  const [b3, b4] = alert.bornes.split("-");
  const pill = `${formatSurface(alert.overlapM2)} · ${alert.bornes}`;
  const pillW = pill.length * 8.2 + 28;
  const hatchId = `hatch-${alert.id}`;

  return (
    <svg
      viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`}
      role="img"
      aria-label={`Plan de chevauchement : ${alert.existing.parcelId} et ${alert.submitted.parcelId}, zone commune ${formatSurface(alert.overlapM2)} entre ${alert.bornes}`}
      className="block h-auto w-full"
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--danger-soft)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--danger)" strokeWidth="2.4" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="var(--map-land)" />
      <path d={`M0 ${26} L${W} ${4} L${W} ${16} L0 ${40} Z`} fill="var(--map-road)" opacity="0.9" />
      <polygon points={points(alert.existingPoly)} fill="var(--parcel-titre-fill)" stroke="var(--parcel-titre)" strokeWidth="2.5" />
      <polygon points={points(alert.submittedPoly)} fill="none" stroke="var(--accent-graphic)" strokeWidth="2.5" strokeDasharray="8 6" />
      {zone.length > 0 && (
        <polygon points={points(zone)} fill={`url(#${hatchId})`} stroke="var(--danger)" strokeWidth="2" />
      )}
      <text x={cEx[0] - 20} y={cEx[1]} textAnchor="middle" className="gs-mono" fontSize="15" fontWeight="600" fill="var(--parcel-titre)">
        {alert.existing.parcelId}
      </text>
      <text x={cSu[0] + 16} y={cSu[1]} textAnchor="middle" className="gs-mono" fontSize="15" fontWeight="600" fill="var(--accent-text)">
        {alert.submitted.parcelId}
      </text>
      {zTop && (
        <g>
          <circle cx={zTop[0]} cy={zTop[1]} r="11" fill="var(--brand-blue)" stroke="#ffffff" strokeWidth="2" />
          <text x={zTop[0]} y={zTop[1] + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff" className="gs-mono">
            {b3}
          </text>
        </g>
      )}
      {zBot && (
        <g>
          <circle cx={zBot[0]} cy={zBot[1]} r="11" fill="var(--brand-blue)" stroke="#ffffff" strokeWidth="2" />
          <text x={zBot[0]} y={zBot[1] + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff" className="gs-mono">
            {b4}
          </text>
        </g>
      )}
      <g>
        <rect x={(W - pillW) / 2} y={H - 34} width={pillW} height="26" rx="13" fill="var(--danger)" />
        <text x={W / 2} y={H - 16} textAnchor="middle" fontSize="13.5" fontWeight="700" fill="#ffffff">
          {pill}
        </text>
      </g>
    </svg>
  );
}