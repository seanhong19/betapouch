import { formatMoney, type GroupTotal } from "@betapouch/core";

/**
 * Ranked breakdown (categories, merchants) as horizontal bars.
 *
 * Deliberately one hue rather than a colour per row. There are thirteen
 * categories and the validated categorical palette holds eight — so colouring
 * by identity here would mean inventing hues that fail CVD separation. The
 * row's own label carries identity; the bar carries only magnitude, which is
 * exactly what a one-hue sequential encoding is for.
 */

interface Props {
  groups: GroupTotal[];
  currency: string;
  locale: string;
  limit?: number;
  emptyMessage?: string;
  onSelect?: (key: string) => void;
}

export function BreakdownBars({
  groups,
  currency,
  locale,
  limit = 8,
  emptyMessage = "Nothing to show yet.",
  onSelect,
}: Props) {
  if (groups.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        {emptyMessage}
      </p>
    );
  }

  const shown = groups.slice(0, limit);
  const rest = groups.slice(limit);
  const max = Math.max(...shown.map((g) => g.totalMinor), 1);

  // Anything past the cap folds into one honest "Other" row rather than
  // being silently dropped from a chart that claims to show a breakdown.
  const rows = rest.length
    ? [
        ...shown,
        {
          key: "__other__",
          label: `Other (${rest.length})`,
          totalMinor: rest.reduce((sum, g) => sum + g.totalMinor, 0),
          count: rest.reduce((sum, g) => sum + g.count, 0),
          share: rest.reduce((sum, g) => sum + g.share, 0),
        },
      ]
    : shown;

  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {rows.map((group) => {
        const width = Math.max(1.5, (group.totalMinor / max) * 100);
        const interactive = Boolean(onSelect) && group.key !== "__other__";
        return (
          <li key={group.key}>
            <button
              type="button"
              disabled={!interactive}
              onClick={interactive ? () => onSelect?.(group.key) : undefined}
              className="block w-full rounded-md px-1 py-0.5 text-left"
              style={{ cursor: interactive ? "pointer" : "default", background: "transparent" }}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate" style={{ color: "var(--text-primary)" }}>
                  {group.label}
                </span>
                <span
                  className="tabular shrink-0 font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatMoney(group.totalMinor, currency, locale)}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: "var(--gridline)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${width}%`,
                    background:
                      group.key === "__other__" ? "var(--seq-250)" : "var(--seq-450)",
                  }}
                />
              </div>
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {Math.round(group.share * 100)}% · {group.count}{" "}
                {group.count === 1 ? "record" : "records"}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
