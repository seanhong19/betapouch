import { formatMoney, type SeriesPoint } from "@betapouch/core";
import { useId, useState } from "react";

/**
 * Spending over time. One series, so no legend box — the card's title says
 * what is plotted. Bars are capped at 24px with a 4px rounded cap and a
 * square baseline; the peak is direct-labelled and everything else is left to
 * the axis and the hover tooltip.
 */

interface Props {
  points: SeriesPoint[];
  currency: string;
  locale: string;
  height?: number;
}

const BAR_MAX_WIDTH = 24;
const BAR_GAP = 2;

export function ColumnChart({ points, currency, locale, height = 200 }: Props) {
  const clipId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        No spending in this period.
      </p>
    );
  }

  const max = Math.max(...points.map((p) => p.totalMinor), 1);
  const peakIndex = points.reduce((best, p, i) => (p.totalMinor > (points[best]?.totalMinor ?? 0) ? i : best), 0);

  const width = 100; // percentage-based viewBox keeps it fluid
  const plotHeight = height - 28; // room for the x labels
  const slot = width / points.length;
  const barWidth = Math.min(BAR_MAX_WIDTH / 4, Math.max(0.6, slot - BAR_GAP / 4));

  // Round the top gridline to a clean number so the axis reads well.
  const gridValues = [0.5, 1].map((f) => max * f);

  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height, display: "block" }}
          role="img"
          aria-label={`Spending per period, peak ${formatMoney(points[peakIndex]?.totalMinor ?? 0, currency, locale)}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={width} height={height} />
            </clipPath>
          </defs>

          {gridValues.map((value) => {
            const y = plotHeight - (value / max) * plotHeight;
            return (
              <line
                key={value}
                x1="0"
                x2={width}
                y1={y}
                y2={y}
                stroke="var(--gridline)"
                strokeWidth="0.3"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <line
            x1="0"
            x2={width}
            y1={plotHeight}
            y2={plotHeight}
            stroke="var(--baseline)"
            strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
          />

          <g clipPath={`url(#${clipId})`}>
            {points.map((point, index) => {
              const barHeight = (point.totalMinor / max) * plotHeight;
              const x = index * slot + (slot - barWidth) / 2;
              const y = plotHeight - barHeight;
              const isHovered = hovered === index;
              return (
                <g key={point.key}>
                  {/* Hit target spans the whole slot so thin bars stay hoverable. */}
                  <rect
                    x={index * slot}
                    y={0}
                    width={slot}
                    height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                  />
                  {point.totalMinor > 0 && (
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(barHeight, 0.8)}
                      rx="1"
                      fill="var(--series-1)"
                      opacity={hovered === null || isHovered ? 1 : 0.55}
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Tooltip is HTML, not SVG: real text rendering, no transform maths. */}
        {hovered !== null && points[hovered] && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--hairline)",
              color: "var(--text-primary)",
              left: `${Math.min(78, (hovered / points.length) * 100)}%`,
            }}
          >
            <div style={{ color: "var(--text-secondary)" }}>{points[hovered].label}</div>
            <div className="font-semibold">
              {formatMoney(points[hovered].totalMinor, currency, locale)}
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              {points[hovered].count} {points[hovered].count === 1 ? "record" : "records"}
            </div>
          </div>
        )}
      </div>

      <div
        className="tabular mt-1 flex justify-between text-[11px]"
        style={{ color: "var(--text-muted)" }}
      >
        {points
          .filter((_, i) => i % labelEvery === 0)
          .map((point) => (
            <span key={point.key}>{point.label}</span>
          ))}
      </div>
    </figure>
  );
}
