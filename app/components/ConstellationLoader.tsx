"use client";

/**
 * ConstellationLoader — the loading motif, a compact echo of the hero field.
 * Navy nodes wire to an electric-blue center while a scout dot orbits. Used for
 * the launch transition and the run page's "waiting for signal" state.
 */
export default function ConstellationLoader({
  size = 96,
  label,
}: {
  size?: number;
  label?: string;
}) {
  const nodes = [
    { x: 50, y: 14 },
    { x: 84, y: 38 },
    { x: 74, y: 80 },
    { x: 26, y: 80 },
    { x: 16, y: 38 },
  ];
  const cx = 50;
  const cy = 50;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        role="img"
        aria-label={label ?? "Loading"}
      >
        {nodes.map((n, i) => {
          const len = Math.hypot(n.x - cx, n.y - cy);
          return (
            <line
              key={`l-${i}`}
              x1={n.x}
              y1={n.y}
              x2={cx}
              y2={cy}
              stroke="rgba(22,48,122,0.35)"
              strokeWidth="0.8"
              strokeDasharray={len}
              style={{
                ["--len" as string]: len,
                animation: `draw 1.1s ${i * 0.12}s ease-in-out infinite alternate`,
              }}
            />
          );
        })}

        {nodes.map((n, i) => (
          <circle
            key={`n-${i}`}
            cx={n.x}
            cy={n.y}
            r="1.8"
            fill="#16307a"
            style={{ animation: `glint 1.8s ${i * 0.15}s ease-in-out infinite` }}
          />
        ))}

        <circle cx={cx} cy={cy} r="6" fill="none" stroke="#2347ff" strokeWidth="0.8"
          style={{ transformOrigin: "50px 50px", animation: "pulsering 1.8s ease-out infinite" }} />
        <circle cx={cx} cy={cy} r="6" fill="none" stroke="#2347ff" strokeWidth="0.8"
          style={{ transformOrigin: "50px 50px", animation: "pulsering 1.8s 0.9s ease-out infinite" }} />

        <circle cx={cx} cy={cy} r="3.4" fill="#2347ff" />

        <g style={{ transformOrigin: "50px 50px", animation: "orbit 2.6s linear infinite" }}>
          <circle cx={cx} cy="16" r="1.4" fill="#16307a" />
        </g>
      </svg>
      {label && (
        <span className="eyebrow shimmer-text" style={{ letterSpacing: "0.22em" }}>
          {label}
        </span>
      )}
    </div>
  );
}
