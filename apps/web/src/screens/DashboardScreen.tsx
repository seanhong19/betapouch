import {
  filterExpenses,
  formatMoney,
  formatMoneyCompact,
  granularityFor,
  presetRanges,
  sortByOccurredAt,
  summarisePeriod,
  timeSeries,
  totalsByCategory,
  totalsByCurrency,
  totalsByMerchant,
  type DateRange,
} from "@betapouch/core";
import { useMemo, useState } from "react";
import { BreakdownBars } from "../components/charts/BreakdownBars";
import { ColumnChart } from "../components/charts/ColumnChart";
import { StatTile } from "../components/charts/StatTile";
import { useExpenses } from "../lib/expenses";
import { useVault } from "../lib/vault";

/**
 * The dashboard.
 *
 * One hero figure, a row of stat tiles, then the time series and the two
 * ranked breakdowns. Filters sit in a single row above the charts, and every
 * chart reads from the same filtered set so the numbers always agree.
 */
export function DashboardScreen({ onNavigate }: { onNavigate: (tab: "capture" | "expenses") => void }) {
  const { expenses, loading, damaged } = useExpenses();
  const { settings } = useVault();
  const ranges = useMemo(() => presetRanges(), []);
  const [rangeIndex, setRangeIndex] = useState(2); // Last 30 days
  const range = ranges[rangeIndex] as DateRange;

  const locale = settings.locale;
  const currencies = useMemo(() => totalsByCurrency(expenses), [expenses]);
  const [currency, setCurrency] = useState<string | null>(null);
  const activeCurrency =
    currency ?? currencies[0]?.currency ?? settings.baseCurrency;

  const scoped = useMemo(
    () => filterExpenses(expenses, { from: range.from, to: range.to, currencies: [activeCurrency] }),
    [activeCurrency, expenses, range.from, range.to],
  );

  const summary = useMemo(
    () => summarisePeriod(expenses, { currency: activeCurrency, from: range.from, to: range.to }),
    [activeCurrency, expenses, range.from, range.to],
  );

  const granularity = granularityFor(range.from, range.to);
  const series = useMemo(
    () => timeSeries(scoped, granularity, { currency: activeCurrency, from: range.from, to: range.to, locale }),
    [activeCurrency, granularity, locale, range.from, range.to, scoped],
  );

  const categories = useMemo(() => totalsByCategory(scoped, activeCurrency), [activeCurrency, scoped]);
  const merchants = useMemo(
    () => totalsByMerchant(scoped, { currency: activeCurrency, limit: 12 }),
    [activeCurrency, scoped],
  );
  const unreviewed = useMemo(() => expenses.filter((e) => !e.reviewed).length, [expenses]);

  if (loading) {
    return <p style={{ color: "var(--text-muted)" }}>Decrypting your records…</p>;
  }

  if (expenses.length === 0) {
    return <EmptyState onNavigate={onNavigate} />;
  }

  const dailyAverage =
    summary.count > 0
      ? Math.round(
          summary.totalMinor /
            Math.max(1, Math.ceil((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000)),
        )
      : 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="field w-auto py-1.5 text-xs"
            value={rangeIndex}
            onChange={(event) => setRangeIndex(Number(event.target.value))}
            aria-label="Date range"
          >
            {ranges.map((option, index) => (
              <option key={option.label} value={index}>
                {option.label}
              </option>
            ))}
          </select>
          {currencies.length > 1 && (
            <select
              className="field w-auto py-1.5 text-xs"
              value={activeCurrency}
              onChange={(event) => setCurrency(event.target.value)}
              aria-label="Currency"
            >
              {currencies.map((entry) => (
                <option key={entry.currency} value={entry.currency}>
                  {entry.currency}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {damaged.length > 0 && (
        <p
          role="alert"
          className="card p-3 text-sm"
          style={{ color: "var(--status-serious)" }}
        >
          {damaged.length} {damaged.length === 1 ? "record" : "records"} could not be decrypted and
          {damaged.length === 1 ? " is" : " are"} not included in these totals.
        </p>
      )}

      {/* Hero figure — exactly one per view. */}
      <section className="card p-5">
        <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Total spend · {range.label.toLowerCase()}
        </div>
        <div className="mt-1 text-[44px] font-semibold leading-none tracking-tight">
          {formatMoney(summary.totalMinor, activeCurrency, locale)}
        </div>
        <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {summary.count} {summary.count === 1 ? "record" : "records"}
          {currencies.length > 1 && (
            <>
              {" · "}
              {currencies
                .filter((c) => c.currency !== activeCurrency)
                .map((c) => `${c.count} in ${c.currency}`)
                .join(", ")}{" "}
              not shown
            </>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Average per record"
          value={formatMoneyCompact(summary.averageMinor, activeCurrency, locale)}
          footnote={`Across ${summary.count} ${summary.count === 1 ? "record" : "records"}`}
        />
        <StatTile
          label="Change"
          value={formatMoneyCompact(summary.totalMinor, activeCurrency, locale)}
          delta={summary.changeRatio}
          upIsGood={false}
          sparkline={series.map((point) => point.totalMinor)}
          footnote={
            summary.previousTotalMinor === null
              ? "No comparable earlier period"
              : `Previously ${formatMoney(summary.previousTotalMinor, activeCurrency, locale)}`
          }
        />
        <StatTile
          label="Daily average"
          value={formatMoneyCompact(dailyAverage, activeCurrency, locale)}
          footnote={
            summary.largest
              ? `Largest: ${summary.largest.merchant || "Unknown"} ${formatMoney(summary.largest.amountMinor, activeCurrency, locale)}`
              : undefined
          }
        />
      </section>

      <section className="card p-5">
        <h2 className="m-0 text-sm font-semibold">
          Spending by {granularity}
          <span className="ml-2 font-normal" style={{ color: "var(--text-muted)" }}>
            {activeCurrency}
          </span>
        </h2>
        <div className="mt-4">
          <ColumnChart points={series} currency={activeCurrency} locale={locale} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="m-0 mb-4 text-sm font-semibold">Where it went</h2>
          <BreakdownBars
            groups={categories}
            currency={activeCurrency}
            locale={locale}
            limit={8}
            emptyMessage="No spending in this period."
          />
        </section>

        <section className="card p-5">
          <h2 className="m-0 mb-4 text-sm font-semibold">Top merchants</h2>
          <BreakdownBars
            groups={merchants}
            currency={activeCurrency}
            locale={locale}
            limit={8}
            emptyMessage="No merchants recorded in this period."
          />
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 text-sm font-semibold">Recent</h2>
          <button type="button" className="text-xs underline" onClick={() => onNavigate("expenses")}>
            See all
          </button>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {sortByOccurredAt(scoped, "desc")
            .slice(0, 5)
            .map((expense) => (
              <li
                key={expense.id}
                className="flex items-baseline justify-between gap-3 border-b py-2.5 last:border-0"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{expense.merchant || "Untitled"}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(expense.occurredAt).toLocaleDateString(locale, {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <span className="tabular shrink-0 text-sm font-medium">
                  {formatMoney(expense.amountMinor, expense.currency, locale)}
                </span>
              </li>
            ))}
        </ul>
      </section>

      {unreviewed > 0 && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {unreviewed} auto-extracted {unreviewed === 1 ? "record has" : "records have"} not been
          checked yet.
        </p>
      )}
    </div>
  );
}

function EmptyState({ onNavigate }: { onNavigate: (tab: "capture" | "expenses") => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="text-5xl" aria-hidden="true">
        ◐
      </div>
      <h1 className="mb-2 mt-4 text-xl font-semibold">Nothing recorded yet</h1>
      <p className="m-0 text-sm" style={{ color: "var(--text-secondary)" }}>
        Photograph a receipt, drop in a file, or type an expense by hand. Everything you add stays
        encrypted on this device.
      </p>
      <button type="button" className="btn btn-primary mt-6" onClick={() => onNavigate("capture")}>
        Add your first expense
      </button>
    </div>
  );
}
