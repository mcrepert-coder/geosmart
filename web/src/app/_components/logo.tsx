// Logo GeoSmart Field : maison (le bien) + trois bornes reliees par le
// perimetre leve. Bleu Geo pour le fond, Orange Terrain pour le dessin,
// trait blanc pour le toit interieur. Charte v1.0, ne pas deformer.

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="GeoSmart Field"
      style={{ flex: "none" }}
    >
      <rect width="96" height="96" rx="20" fill="#115471" />
      <g transform="translate(0,-4)">
        {/* toit : le bien */}
        <path
          d="M22 41 L48 21 L76 42"
          fill="none"
          stroke="#D36534"
          strokeWidth="8"
        />
        <rect x="62" y="25" width="7" height="13" fill="#D36534" />
        {/* perimetre leve : trait blanc */}
        <path
          d="M30 52 L48 42 L68 52"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4.5"
        />
        {/* trace reliant les bornes */}
        <path
          d="M25 58 L48 74 L71 58"
          fill="none"
          stroke="#D36534"
          strokeWidth="5"
        />
        {/* trois bornes */}
        {[
          [24, 52],
          [72, 52],
          [48, 72],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <path
              d={`M${cx} ${cy - 8} C${cx + 5} ${cy - 8} ${cx + 8} ${cy - 4} ${cx + 8} ${cy} C${cx + 8} ${cy + 5} ${cx + 3} ${cy + 9} ${cx} ${cy + 14} C${cx - 3} ${cy + 9} ${cx - 8} ${cy + 5} ${cx - 8} ${cy} C${cx - 8} ${cy - 4} ${cx - 5} ${cy - 8} ${cx} ${cy - 8} Z`}
              fill="#D36534"
            />
            <circle cx={cx} cy={cy} r="3" fill="#115471" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function Logo({
  size = 32,
  onBlue = false,
  withText = true,
}: {
  size?: number;
  onBlue?: boolean;
  withText?: boolean;
}) {
  return (
    <span className={`gs-logotype ${onBlue ? "gs-logotype--onblue" : ""}`}>
      <LogoMark size={size} />
      {withText && (
        <span className="gs-logotype-text" style={{ color: "inherit" }}>
          GeoSmart <span>Field</span>
        </span>
      )}
    </span>
  );
}