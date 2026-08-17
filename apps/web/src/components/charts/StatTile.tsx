import type { ReactNode } from "react";

/**
 * Stat tile: label · value · optional delta · optional sparkline.
 *
 * The delta's colour encodes direction × whether up is good. For spending,
 * up is bad — so a rise is warm, not green. Colour never carries it alone:
 * the arrow and the "vs previous period" text say the same thing.
 */

interface Props {
  label: string;
  value: string;
  /** Signed ratio, e.g. 0.12 for +12%. */
  delta?: number | null;
  deltaLabel?: string;
  /** true when a rise is a good thing. Spending: false. */
  upIsGood?: boolean;
  sparkline?: number[];
  footnote?: ReactNode;
}

export function StatTile({
  label,
  value,
  delta = null,
  deltaLabel = "vs previous period",
  upIsGood = false,
  sparkline,
  footnote,
}: Props) {
  const hasDelta = delta !== null && Number.isFinite(delta);
  const rising = hasDelta && (delta as number) > 0;
  const flat = hasDelta && Math.abs(delta as number) < 0.005;
  const good = rising === upIsGood;

  const deltaColor = !hasDelta || flat
    ? "var(--text-muted)"
    : good
      ? "var(--delta-good)"
      : "var(--status-critical)";

  return (
    <div className="card p-4">
      <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      {/* Proportional figures: this is a standalone display number, not a column. */}
      <div className="mt-1 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>

      {hasDelta && (
        <div className="mt-1.5 flex items-center gap-1 text-xs" style={{ color: deltaColor }}>
          <span aria-hidden="true">{flat ? "→" : rising ? "↑" : "↓"}</span>
          <span className="tabular font-medium">
            {flat ? "no change" : `${Math.abs((delta as number) * 100).toFixed(0)}%`}
          </span>
          <span style={{ color: "var(--text-muted)" }}>{deltaLabel}</span>
        </div>
      )}

      {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} />}

      {footnote && (
        <div className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {footnote}
        </div>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const width = 100;
  const height = 24;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const path = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${index * step},${height - (value / max) * height}`)
    .join(" ");
  const lastValue = values.at(-1) ?? 0;

  return (
    <svg
      className="mt-2.5"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--seq-250)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Current period in the accent, with a surface ring so it stays
          legible where it crosses the line. */}
      <circle
        cx={(values.length - 1) * step}
        cy={height - (lastValue / max) * height}
        r="3"
        fill="var(--series-1)"
        stroke="var(--surface-1)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
