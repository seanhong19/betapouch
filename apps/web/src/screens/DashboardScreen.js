import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { filterExpenses, formatMoney, formatMoneyCompact, granularityFor, presetRanges, sortByOccurredAt, summarisePeriod, timeSeries, totalsByCategory, totalsByCurrency, totalsByMerchant, } from "@betapouch/core";
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
export function DashboardScreen({ onNavigate }) {
    const { expenses, loading, damaged } = useExpenses();
    const { settings } = useVault();
    const ranges = useMemo(() => presetRanges(), []);
    const [rangeIndex, setRangeIndex] = useState(2); // Last 30 days
    const range = ranges[rangeIndex];
    const locale = settings.locale;
    const currencies = useMemo(() => totalsByCurrency(expenses), [expenses]);
    const [currency, setCurrency] = useState(null);
    const activeCurrency = currency ?? currencies[0]?.currency ?? settings.baseCurrency;
    const scoped = useMemo(() => filterExpenses(expenses, { from: range.from, to: range.to, currencies: [activeCurrency] }), [activeCurrency, expenses, range.from, range.to]);
    const summary = useMemo(() => summarisePeriod(expenses, { currency: activeCurrency, from: range.from, to: range.to }), [activeCurrency, expenses, range.from, range.to]);
    const granularity = granularityFor(range.from, range.to);
    const series = useMemo(() => timeSeries(scoped, granularity, { currency: activeCurrency, from: range.from, to: range.to, locale }), [activeCurrency, granularity, locale, range.from, range.to, scoped]);
    const categories = useMemo(() => totalsByCategory(scoped, activeCurrency), [activeCurrency, scoped]);
    const merchants = useMemo(() => totalsByMerchant(scoped, { currency: activeCurrency, limit: 12 }), [activeCurrency, scoped]);
    const unreviewed = useMemo(() => expenses.filter((e) => !e.reviewed).length, [expenses]);
    if (loading) {
        return _jsx("p", { style: { color: "var(--text-muted)" }, children: "Decrypting your records\u2026" });
    }
    if (expenses.length === 0) {
        return _jsx(EmptyState, { onNavigate: onNavigate });
    }
    const dailyAverage = summary.count > 0
        ? Math.round(summary.totalMinor /
            Math.max(1, Math.ceil((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000)))
        : 0;
    return (_jsxs("div", { className: "flex flex-col gap-5", children: [_jsxs("header", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "Dashboard" }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("select", { className: "field w-auto py-1.5 text-xs", value: rangeIndex, onChange: (event) => setRangeIndex(Number(event.target.value)), "aria-label": "Date range", children: ranges.map((option, index) => (_jsx("option", { value: index, children: option.label }, option.label))) }), currencies.length > 1 && (_jsx("select", { className: "field w-auto py-1.5 text-xs", value: activeCurrency, onChange: (event) => setCurrency(event.target.value), "aria-label": "Currency", children: currencies.map((entry) => (_jsx("option", { value: entry.currency, children: entry.currency }, entry.currency))) }))] })] }), damaged.length > 0 && (_jsxs("p", { role: "alert", className: "card p-3 text-sm", style: { color: "var(--status-serious)" }, children: [damaged.length, " ", damaged.length === 1 ? "record" : "records", " could not be decrypted and", damaged.length === 1 ? " is" : " are", " not included in these totals."] })), _jsxs("section", { className: "card p-5", children: [_jsxs("div", { className: "text-xs font-medium", style: { color: "var(--text-secondary)" }, children: ["Total spend \u00B7 ", range.label.toLowerCase()] }), _jsx("div", { className: "mt-1 text-[44px] font-semibold leading-none tracking-tight", children: formatMoney(summary.totalMinor, activeCurrency, locale) }), _jsxs("div", { className: "mt-2 text-sm", style: { color: "var(--text-muted)" }, children: [summary.count, " ", summary.count === 1 ? "record" : "records", currencies.length > 1 && (_jsxs(_Fragment, { children: [" · ", currencies
                                        .filter((c) => c.currency !== activeCurrency)
                                        .map((c) => `${c.count} in ${c.currency}`)
                                        .join(", "), " ", "not shown"] }))] })] }), _jsxs("section", { className: "grid grid-cols-1 gap-3 sm:grid-cols-3", children: [_jsx(StatTile, { label: "Average per record", value: formatMoneyCompact(summary.averageMinor, activeCurrency, locale), footnote: `Across ${summary.count} ${summary.count === 1 ? "record" : "records"}` }), _jsx(StatTile, { label: "Change", value: formatMoneyCompact(summary.totalMinor, activeCurrency, locale), delta: summary.changeRatio, upIsGood: false, sparkline: series.map((point) => point.totalMinor), footnote: summary.previousTotalMinor === null
                            ? "No comparable earlier period"
                            : `Previously ${formatMoney(summary.previousTotalMinor, activeCurrency, locale)}` }), _jsx(StatTile, { label: "Daily average", value: formatMoneyCompact(dailyAverage, activeCurrency, locale), footnote: summary.largest
                            ? `Largest: ${summary.largest.merchant || "Unknown"} ${formatMoney(summary.largest.amountMinor, activeCurrency, locale)}`
                            : undefined })] }), _jsxs("section", { className: "card p-5", children: [_jsxs("h2", { className: "m-0 text-sm font-semibold", children: ["Spending by ", granularity, _jsx("span", { className: "ml-2 font-normal", style: { color: "var(--text-muted)" }, children: activeCurrency })] }), _jsx("div", { className: "mt-4", children: _jsx(ColumnChart, { points: series, currency: activeCurrency, locale: locale }) })] }), _jsxs("div", { className: "grid grid-cols-1 gap-5 lg:grid-cols-2", children: [_jsxs("section", { className: "card p-5", children: [_jsx("h2", { className: "m-0 mb-4 text-sm font-semibold", children: "Where it went" }), _jsx(BreakdownBars, { groups: categories, currency: activeCurrency, locale: locale, limit: 8, emptyMessage: "No spending in this period." })] }), _jsxs("section", { className: "card p-5", children: [_jsx("h2", { className: "m-0 mb-4 text-sm font-semibold", children: "Top merchants" }), _jsx(BreakdownBars, { groups: merchants, currency: activeCurrency, locale: locale, limit: 8, emptyMessage: "No merchants recorded in this period." })] })] }), _jsxs("section", { className: "card p-5", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h2", { className: "m-0 text-sm font-semibold", children: "Recent" }), _jsx("button", { type: "button", className: "text-xs underline", onClick: () => onNavigate("expenses"), children: "See all" })] }), _jsx("ul", { className: "m-0 flex list-none flex-col p-0", children: sortByOccurredAt(scoped, "desc")
                            .slice(0, 5)
                            .map((expense) => (_jsxs("li", { className: "flex items-baseline justify-between gap-3 border-b py-2.5 last:border-0", style: { borderColor: "var(--hairline)" }, children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "truncate text-sm", children: expense.merchant || "Untitled" }), _jsx("div", { className: "text-xs", style: { color: "var(--text-muted)" }, children: new Date(expense.occurredAt).toLocaleDateString(locale, {
                                                month: "short",
                                                day: "numeric",
                                            }) })] }), _jsx("span", { className: "tabular shrink-0 text-sm font-medium", children: formatMoney(expense.amountMinor, expense.currency, locale) })] }, expense.id))) })] }), unreviewed > 0 && (_jsxs("p", { className: "text-xs", style: { color: "var(--text-muted)" }, children: [unreviewed, " auto-extracted ", unreviewed === 1 ? "record has" : "records have", " not been checked yet."] }))] }));
}
function EmptyState({ onNavigate }) {
    return (_jsxs("div", { className: "mx-auto flex max-w-md flex-col items-center py-16 text-center", children: [_jsx("div", { className: "text-5xl", "aria-hidden": "true", children: "\u25D0" }), _jsx("h1", { className: "mb-2 mt-4 text-xl font-semibold", children: "Nothing recorded yet" }), _jsx("p", { className: "m-0 text-sm", style: { color: "var(--text-secondary)" }, children: "Photograph a receipt, drop in a file, or type an expense by hand. Everything you add stays encrypted on this device." }), _jsx("button", { type: "button", className: "btn btn-primary mt-6", onClick: () => onNavigate("capture"), children: "Add your first expense" })] }));
}
