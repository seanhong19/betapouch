import { formatMoney, minorToDecimalString } from "./money.js";
import { CATEGORY_LABELS, type Category, type Expense } from "./models.js";

/**
 * Aggregations for the dashboard.
 *
 * One deliberate omission: there is no currency conversion. Converting would
 * mean fetching FX rates, which means a network call keyed to the user's
 * spending dates — exactly the leak this app exists to avoid. Instead totals
 * are grouped per currency and the UI shows the base currency as the headline
 * with the rest listed alongside.
 */

export type Granularity = "day" | "week" | "month";

export interface ExpenseFilter {
  /** Inclusive ISO bounds on `occurredAt`. */
  from?: string | null;
  to?: string | null;
  categories?: Category[] | null;
  merchants?: string[] | null;
  currencies?: string[] | null;
  /** Case-insensitive substring over merchant, description, notes and tags. */
  search?: string | null;
  tags?: string[] | null;
  minAmountMinor?: number | null;
  maxAmountMinor?: number | null;
  /** Only records still awaiting a human check. */
  unreviewedOnly?: boolean;
}

export function filterExpenses(expenses: Expense[], filter: ExpenseFilter = {}): Expense[] {
  const from = filter.from ? Date.parse(filter.from) : null;
  const to = filter.to ? Date.parse(filter.to) : null;
  const search = filter.search?.trim().toLowerCase() || null;
  const categories = filter.categories?.length ? new Set(filter.categories) : null;
  const merchants = filter.merchants?.length
    ? new Set(filter.merchants.map((m) => m.toLowerCase()))
    : null;
  const currencies = filter.currencies?.length ? new Set(filter.currencies) : null;
  const tags = filter.tags?.length ? new Set(filter.tags.map((t) => t.toLowerCase())) : null;

  return expenses.filter((expense) => {
    const at = Date.parse(expense.occurredAt);
    if (from !== null && at < from) return false;
    if (to !== null && at > to) return false;
    if (categories && !categories.has(expense.category)) return false;
    if (merchants && !merchants.has(expense.merchant.toLowerCase())) return false;
    if (currencies && !currencies.has(expense.currency)) return false;
    if (tags && !expense.tags.some((t) => tags.has(t.toLowerCase()))) return false;
    if (filter.unreviewedOnly && expense.reviewed) return false;
    if (filter.minAmountMinor != null && expense.amountMinor < filter.minAmountMinor) return false;
    if (filter.maxAmountMinor != null && expense.amountMinor > filter.maxAmountMinor) return false;
    if (search) {
      const haystack = [
        expense.merchant,
        expense.description,
        expense.notes,
        expense.tags.join(" "),
        ...expense.lineItems.map((i) => i.description),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function sortByOccurredAt(expenses: Expense[], direction: "asc" | "desc" = "desc"): Expense[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...expenses].sort(
    (a, b) => sign * (Date.parse(a.occurredAt) - Date.parse(b.occurredAt)),
  );
}

/** Local-time bucket key. Local, not UTC: "what did I spend on Tuesday" is a
 *  question about the user's Tuesday. */
export function bucketKey(iso: string, granularity: Granularity): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  if (granularity === "month") return `${year}-${month}`;
  if (granularity === "day") return `${year}-${month}-${day}`;
  // Week: the ISO week's Monday, expressed as a date key.
  const monday = new Date(date);
  const weekday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - weekday);
  monday.setHours(0, 0, 0, 0);
  return `${monday.getFullYear()}-${`${monday.getMonth() + 1}`.padStart(2, "0")}-${`${monday.getDate()}`.padStart(2, "0")}`;
}

export function bucketLabel(key: string, granularity: Granularity, locale = "en-US"): string {
  const date = new Date(granularity === "month" ? `${key}-01T12:00:00` : `${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  if (granularity === "month") {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

export interface SeriesPoint {
  key: string;
  label: string;
  totalMinor: number;
  count: number;
}

/**
 * Time series with empty buckets filled in — a gap in a spending chart must
 * read as "spent nothing", not as "no data", and skipping the bucket makes
 * the x-axis lie about spacing.
 */
export function timeSeries(
  expenses: Expense[],
  granularity: Granularity,
  options: { currency?: string; from?: string; to?: string; locale?: string } = {},
): SeriesPoint[] {
  const relevant = options.currency
    ? expenses.filter((e) => e.currency === options.currency)
    : expenses;

  const totals = new Map<string, { totalMinor: number; count: number }>();
  for (const expense of relevant) {
    const key = bucketKey(expense.occurredAt, granularity);
    const entry = totals.get(key) ?? { totalMinor: 0, count: 0 };
    entry.totalMinor += expense.amountMinor;
    entry.count += 1;
    totals.set(key, entry);
  }

  const times = relevant.map((e) => Date.parse(e.occurredAt));
  const start = options.from ? Date.parse(options.from) : times.length ? Math.min(...times) : null;
  const end = options.to ? Date.parse(options.to) : times.length ? Math.max(...times) : null;
  if (start === null || end === null || Number.isNaN(start) || Number.isNaN(end)) return [];

  const keys: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  if (granularity === "month") cursor.setDate(1);
  if (granularity === "week") cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

  let guard = 0;
  while (cursor.getTime() <= end && guard++ < 2000) {
    keys.push(bucketKey(cursor.toISOString(), granularity));
    if (granularity === "day") cursor.setDate(cursor.getDate() + 1);
    else if (granularity === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  // Guarantee the final bucket exists even when the loop bailed on the guard.
  const lastKey = bucketKey(new Date(end).toISOString(), granularity);
  if (keys.at(-1) !== lastKey) keys.push(lastKey);

  return keys.map((key) => ({
    key,
    label: bucketLabel(key, granularity, options.locale),
    totalMinor: totals.get(key)?.totalMinor ?? 0,
    count: totals.get(key)?.count ?? 0,
  }));
}

export interface GroupTotal {
  key: string;
  label: string;
  totalMinor: number;
  count: number;
  /** Share of the group's currency total, 0..1. */
  share: number;
}

function toGroupTotals(
  entries: Map<string, { label: string; totalMinor: number; count: number }>,
): GroupTotal[] {
  const grandTotal = [...entries.values()].reduce((sum, e) => sum + e.totalMinor, 0);
  return [...entries.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      totalMinor: entry.totalMinor,
      count: entry.count,
      share: grandTotal === 0 ? 0 : entry.totalMinor / grandTotal,
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

export function totalsByCategory(expenses: Expense[], currency?: string): GroupTotal[] {
  const relevant = currency ? expenses.filter((e) => e.currency === currency) : expenses;
  const entries = new Map<string, { label: string; totalMinor: number; count: number }>();
  for (const expense of relevant) {
    const entry = entries.get(expense.category) ?? {
      label: CATEGORY_LABELS[expense.category],
      totalMinor: 0,
      count: 0,
    };
    entry.totalMinor += expense.amountMinor;
    entry.count += 1;
    entries.set(expense.category, entry);
  }
  return toGroupTotals(entries);
}

export function totalsByMerchant(
  expenses: Expense[],
  options: { currency?: string; limit?: number } = {},
): GroupTotal[] {
  const relevant = options.currency
    ? expenses.filter((e) => e.currency === options.currency)
    : expenses;
  const entries = new Map<string, { label: string; totalMinor: number; count: number }>();
  for (const expense of relevant) {
    const label = expense.merchant.trim() || "Unknown merchant";
    const key = label.toLowerCase();
    const entry = entries.get(key) ?? { label, totalMinor: 0, count: 0 };
    entry.totalMinor += expense.amountMinor;
    entry.count += 1;
    entries.set(key, entry);
  }
  const all = toGroupTotals(entries);
  return options.limit ? all.slice(0, options.limit) : all;
}

export function totalsByCurrency(expenses: Expense[]): { currency: string; totalMinor: number; count: number }[] {
  const map = new Map<string, { totalMinor: number; count: number }>();
  for (const expense of expenses) {
    const entry = map.get(expense.currency) ?? { totalMinor: 0, count: 0 };
    entry.totalMinor += expense.amountMinor;
    entry.count += 1;
    map.set(expense.currency, entry);
  }
  return [...map.entries()]
    .map(([currency, entry]) => ({ currency, ...entry }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

/**
 * Which currency the dashboard should lead with.
 *
 * Emphatically NOT "the one with the largest total" — comparing raw minor
 * units across currencies ranks 3,960 JPY above 2,919 USD, which is both
 * wrong and exactly the cross-currency comparison this module refuses to make
 * elsewhere. The user's configured base currency wins whenever they have any
 * records in it; otherwise we fall back to the one they use most *often*,
 * since a count is the only quantity that is comparable across currencies.
 */
export function pickDisplayCurrency(expenses: Expense[], baseCurrency: string): string {
  const totals = totalsByCurrency(expenses);
  if (totals.length === 0) return baseCurrency;
  if (totals.some((entry) => entry.currency === baseCurrency)) return baseCurrency;

  return [...totals].sort(
    (a, b) => b.count - a.count || a.currency.localeCompare(b.currency),
  )[0]!.currency;
}

export interface PeriodSummary {
  currency: string;
  totalMinor: number;
  count: number;
  averageMinor: number;
  largest: Expense | null;
  /** Previous equal-length window, for the delta on stat tiles. */
  previousTotalMinor: number | null;
  changeRatio: number | null;
}

export function summarisePeriod(
  expenses: Expense[],
  options: { currency: string; from: string; to: string },
): PeriodSummary {
  const from = Date.parse(options.from);
  const to = Date.parse(options.to);
  const span = Math.max(1, to - from);

  const inPeriod = expenses.filter((e) => {
    if (e.currency !== options.currency) return false;
    const at = Date.parse(e.occurredAt);
    return at >= from && at <= to;
  });
  const previous = expenses.filter((e) => {
    if (e.currency !== options.currency) return false;
    const at = Date.parse(e.occurredAt);
    return at >= from - span && at < from;
  });

  const totalMinor = inPeriod.reduce((sum, e) => sum + e.amountMinor, 0);
  const previousTotalMinor = previous.length
    ? previous.reduce((sum, e) => sum + e.amountMinor, 0)
    : null;

  const largest = inPeriod.reduce<Expense | null>(
    (max, e) => (max === null || e.amountMinor > max.amountMinor ? e : max),
    null,
  );

  return {
    currency: options.currency,
    totalMinor,
    count: inPeriod.length,
    averageMinor: inPeriod.length ? Math.round(totalMinor / inPeriod.length) : 0,
    largest,
    previousTotalMinor,
    changeRatio:
      previousTotalMinor === null || previousTotalMinor === 0
        ? null
        : (totalMinor - previousTotalMinor) / previousTotalMinor,
  };
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export function presetRanges(now = new Date()): DateRange[] {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfDaysAgo = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const range = (from: Date, label: string): DateRange => ({
    from: from.toISOString(),
    to: endOfToday.toISOString(),
    label,
  });

  return [
    range(startOfToday, "Today"),
    range(startOfDaysAgo(7), "Last 7 days"),
    range(startOfDaysAgo(30), "Last 30 days"),
    range(startOfDaysAgo(90), "Last 90 days"),
    range(startOfMonth, "Month to date"),
    range(startOfYear, "Year to date"),
  ];
}

/** Granularity that keeps a chart readable for the span it covers. */
export function granularityFor(from: string, to: string): Granularity {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days <= 45) return "day";
  if (days <= 300) return "week";
  return "month";
}

/**
 * A compact, human-readable digest of the user's data for the AI assistant.
 *
 * Only aggregates and the few largest line entries are included — the whole
 * ledger is never shipped to a model. It is also capped so a long history
 * cannot silently turn into a very large upload.
 */
export function buildExpenseSummary(
  expenses: Expense[],
  options: { currency: string; locale?: string; maxMerchants?: number; maxRecent?: number } = {
    currency: "USD",
  },
): string {
  const locale = options.locale ?? "en-US";
  const currency = options.currency;
  const scoped = expenses.filter((e) => e.currency === currency);
  if (scoped.length === 0) return "The user has no expenses recorded in this currency yet.";

  const sorted = sortByOccurredAt(scoped, "asc");
  const first = sorted[0] as Expense;
  const last = sorted.at(-1) as Expense;
  const total = scoped.reduce((sum, e) => sum + e.amountMinor, 0);
  const money = (minor: number) => formatMoney(minor, currency, locale);

  const lines: string[] = [
    `Currency: ${currency}`,
    `Records: ${scoped.length} between ${first.occurredAt.slice(0, 10)} and ${last.occurredAt.slice(0, 10)}`,
    `Total: ${money(total)} (average ${money(Math.round(total / scoped.length))} per record)`,
    "",
    "By category:",
    ...totalsByCategory(scoped, currency).map(
      (g) => `- ${g.label}: ${money(g.totalMinor)} across ${g.count} (${Math.round(g.share * 100)}%)`,
    ),
    "",
    `Top merchants:`,
    ...totalsByMerchant(scoped, { currency, limit: options.maxMerchants ?? 10 }).map(
      (g) => `- ${g.label}: ${money(g.totalMinor)} across ${g.count}`,
    ),
    "",
    "Monthly totals:",
    ...timeSeries(scoped, "month", { currency, locale })
      .slice(-18)
      .map((p) => `- ${p.label}: ${money(p.totalMinor)} (${p.count})`),
    "",
    "Most recent records:",
    ...sortByOccurredAt(scoped, "desc")
      .slice(0, options.maxRecent ?? 15)
      .map(
        (e) =>
          `- ${e.occurredAt.slice(0, 10)} ${e.merchant || "Unknown"} ${minorToDecimalString(e.amountMinor, currency)} ${CATEGORY_LABELS[e.category]}`,
      ),
  ];

  const other = totalsByCurrency(expenses).filter((c) => c.currency !== currency);
  if (other.length) {
    lines.push("", "Other currencies (not converted):");
    for (const entry of other) {
      lines.push(`- ${entry.currency}: ${formatMoney(entry.totalMinor, entry.currency, locale)} across ${entry.count}`);
    }
  }

  return lines.join("\n");
}
