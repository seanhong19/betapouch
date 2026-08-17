import { describe, expect, it } from "vitest";
import {
  bucketKey,
  buildExpenseSummary,
  filterExpenses,
  granularityFor,
  summarisePeriod,
  timeSeries,
  totalsByCategory,
  totalsByCurrency,
  totalsByMerchant,
} from "./analytics.js";
import { escapeCell, expensesToCsv, importExpensesJson, safeFilename } from "./export.js";
import { expenseSchema, type Expense } from "./models.js";

function makeExpense(partial: Partial<Expense> & { id: string; occurredAt: string; amountMinor: number }): Expense {
  return expenseSchema.parse({
    createdAt: partial.occurredAt,
    updatedAt: partial.occurredAt,
    ...partial,
  });
}

const EXPENSES: Expense[] = [
  makeExpense({ id: "1", occurredAt: "2025-03-01T10:00:00.000Z", amountMinor: 1000, merchant: "Kopi", category: "dining" }),
  makeExpense({ id: "2", occurredAt: "2025-03-02T10:00:00.000Z", amountMinor: 2500, merchant: "Kopi", category: "dining" }),
  makeExpense({ id: "3", occurredAt: "2025-03-05T10:00:00.000Z", amountMinor: 4000, merchant: "SuperMart", category: "groceries" }),
  makeExpense({ id: "4", occurredAt: "2025-02-20T10:00:00.000Z", amountMinor: 3000, merchant: "SuperMart", category: "groceries" }),
  makeExpense({ id: "5", occurredAt: "2025-03-06T10:00:00.000Z", amountMinor: 900, merchant: "Metro", category: "transport", currency: "EUR" }),
];

describe("filterExpenses", () => {
  it("filters by date range inclusively", () => {
    const result = filterExpenses(EXPENSES, {
      from: "2025-03-01T00:00:00.000Z",
      to: "2025-03-02T23:59:59.999Z",
    });
    expect(result.map((e) => e.id)).toEqual(["1", "2"]);
  });

  it("filters by category and currency", () => {
    expect(filterExpenses(EXPENSES, { categories: ["groceries"] })).toHaveLength(2);
    expect(filterExpenses(EXPENSES, { currencies: ["EUR"] })).toHaveLength(1);
  });

  it("searches merchant and notes case-insensitively", () => {
    expect(filterExpenses(EXPENSES, { search: "kopi" })).toHaveLength(2);
    expect(filterExpenses(EXPENSES, { search: "nothing here" })).toHaveLength(0);
  });

  it("filters by amount bounds", () => {
    expect(filterExpenses(EXPENSES, { minAmountMinor: 2500 }).map((e) => e.id)).toEqual(["2", "3", "4"]);
  });

  it("returns everything for an empty filter", () => {
    expect(filterExpenses(EXPENSES)).toHaveLength(EXPENSES.length);
  });
});

describe("totals", () => {
  it("groups by category with shares that sum to 1", () => {
    const groups = totalsByCategory(EXPENSES, "USD");
    expect(groups[0]?.key).toBe("groceries");
    expect(groups[0]?.totalMinor).toBe(7000);
    const shareSum = groups.reduce((s, g) => s + g.share, 0);
    expect(shareSum).toBeCloseTo(1, 6);
  });

  it("groups by merchant, largest first, and caps the list", () => {
    const groups = totalsByMerchant(EXPENSES, { currency: "USD", limit: 1 });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("SuperMart");
  });

  it("keeps currencies separate instead of inventing an exchange rate", () => {
    const byCurrency = totalsByCurrency(EXPENSES);
    expect(byCurrency.find((c) => c.currency === "USD")?.totalMinor).toBe(10500);
    expect(byCurrency.find((c) => c.currency === "EUR")?.totalMinor).toBe(900);
  });
});

describe("timeSeries", () => {
  it("fills empty buckets so gaps read as zero spend", () => {
    const series = timeSeries(EXPENSES, "day", {
      currency: "USD",
      from: "2025-03-01T00:00:00.000Z",
      to: "2025-03-05T00:00:00.000Z",
    });
    expect(series).toHaveLength(5);
    expect(series.map((p) => p.totalMinor)).toEqual([1000, 2500, 0, 0, 4000]);
  });

  it("buckets by month", () => {
    const series = timeSeries(EXPENSES, "month", { currency: "USD" });
    expect(series.map((p) => p.key)).toEqual(["2025-02", "2025-03"]);
    expect(series[1]?.totalMinor).toBe(7500);
  });

  it("returns an empty series for no data", () => {
    expect(timeSeries([], "day", { currency: "USD" })).toEqual([]);
  });

  it("puts a week in its Monday bucket", () => {
    // 2025-03-05 is a Wednesday; its ISO week starts Monday 2025-03-03.
    expect(bucketKey("2025-03-05T10:00:00", "week")).toBe("2025-03-03");
  });
});

describe("summarisePeriod", () => {
  it("computes totals and compares against the preceding window", () => {
    const summary = summarisePeriod(EXPENSES, {
      currency: "USD",
      from: "2025-03-01T00:00:00.000Z",
      to: "2025-03-31T23:59:59.999Z",
    });
    expect(summary.totalMinor).toBe(7500);
    expect(summary.count).toBe(3);
    expect(summary.averageMinor).toBe(2500);
    expect(summary.largest?.id).toBe("3");
    expect(summary.previousTotalMinor).toBe(3000);
    expect(summary.changeRatio).toBeCloseTo(1.5, 6);
  });

  it("reports a null change rather than dividing by zero", () => {
    const summary = summarisePeriod(EXPENSES, {
      currency: "USD",
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-01-31T00:00:00.000Z",
    });
    expect(summary.changeRatio).toBeNull();
    expect(summary.totalMinor).toBe(0);
  });
});

describe("granularityFor", () => {
  it("scales the bucket size to the span", () => {
    expect(granularityFor("2025-03-01", "2025-03-20")).toBe("day");
    expect(granularityFor("2025-01-01", "2025-06-01")).toBe("week");
    expect(granularityFor("2023-01-01", "2025-01-01")).toBe("month");
  });
});

describe("buildExpenseSummary", () => {
  it("summarises aggregates, not the raw ledger", () => {
    const summary = buildExpenseSummary(EXPENSES, { currency: "USD" });
    expect(summary).toContain("Records: 4");
    expect(summary).toContain("By category:");
    expect(summary).toContain("Other currencies (not converted)");
  });

  it("says so plainly when there is nothing to summarise", () => {
    expect(buildExpenseSummary([], { currency: "USD" })).toContain("no expenses");
  });
});

describe("csv export", () => {
  it("neutralises formula injection in merchant names", () => {
    expect(escapeCell("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(escapeCell("+1234")).toBe("'+1234");
    expect(escapeCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("writes a header and one row per expense", () => {
    const csv = expensesToCsv(EXPENSES);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(EXPENSES.length + 1);
    expect(lines[0]).toContain("occurred_at");
    expect(lines[1]).toContain("10.00");
  });
});

describe("import", () => {
  it("keeps valid records and reports the ones it dropped", () => {
    const raw = JSON.stringify({
      expenses: [EXPENSES[0], { id: "bad", amountMinor: "not a number" }],
    });
    const result = importExpensesJson(raw);
    expect(result.expenses).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it("rejects a file that is not JSON", () => {
    expect(() => importExpensesJson("<html>")).toThrow();
  });
});

describe("safeFilename", () => {
  it("strips traversal sequences and path separators", () => {
    const name = safeFilename("../../etc/passwd", "csv");
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
    expect(name.endsWith(".csv")).toBe(true);
  });

  it("falls back to a default when nothing usable is left", () => {
    expect(safeFilename("", "json")).toBe("betapouch.json");
    expect(safeFilename("...", "json")).toBe("betapouch.json");
  });

  it("keeps the extension free of injected separators", () => {
    expect(safeFilename("report", "csv/../sh")).toBe("report.csvsh");
  });
});
