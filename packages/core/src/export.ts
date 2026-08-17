import { minorToDecimalString } from "./money.js";
import { CATEGORY_LABELS, expenseSchema, type Expense } from "./models.js";

/**
 * CSV export.
 *
 * The interesting part is `escapeCell`. A merchant name is attacker-influenced
 * text (it comes off a receipt), and spreadsheet software treats a leading
 * `=`, `+`, `-`, `@`, tab or CR as the start of a formula. Exporting such a
 * cell verbatim turns "open my expenses in Excel" into remote code execution
 * on the user's machine. Prefixing with an apostrophe neutralises it while
 * keeping the text readable.
 */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

export function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_TRIGGERS.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

const CSV_COLUMNS = [
  "id",
  "occurred_at",
  "merchant",
  "description",
  "amount",
  "currency",
  "tax",
  "tip",
  "category",
  "payment_method",
  "tags",
  "notes",
  "source",
  "reviewed",
] as const;

export function expensesToCsv(expenses: Expense[]): string {
  const rows = [CSV_COLUMNS.join(",")];
  for (const expense of expenses) {
    rows.push(
      [
        expense.id,
        expense.occurredAt,
        expense.merchant,
        expense.description,
        minorToDecimalString(expense.amountMinor, expense.currency),
        expense.currency,
        expense.taxMinor === null ? "" : minorToDecimalString(expense.taxMinor, expense.currency),
        expense.tipMinor === null ? "" : minorToDecimalString(expense.tipMinor, expense.currency),
        CATEGORY_LABELS[expense.category],
        expense.paymentMethod ?? "",
        expense.tags.join("; "),
        expense.notes,
        expense.source,
        expense.reviewed ? "yes" : "no",
      ]
        .map(escapeCell)
        .join(","),
    );
  }
  // A BOM so Excel opens UTF-8 correctly instead of mangling accented names.
  return `﻿${rows.join("\r\n")}\r\n`;
}

export function expensesToJson(expenses: Expense[]): string {
  return JSON.stringify({ format: "betapouch-expenses", version: 1, expenses }, null, 2);
}

export interface ImportResult {
  expenses: Expense[];
  skipped: { index: number; reason: string }[];
}

/**
 * Import validates every record individually and reports what it dropped,
 * rather than failing the whole file or — worse — trusting it.
 */
export function importExpensesJson(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { expenses?: unknown }).expenses;
  if (!Array.isArray(list)) throw new Error("No expense array found in that file.");
  if (list.length > 100_000) throw new Error("That file has too many records to import.");

  const expenses: Expense[] = [];
  const skipped: { index: number; reason: string }[] = [];
  list.forEach((candidate, index) => {
    const result = expenseSchema.safeParse(candidate);
    if (result.success) expenses.push(result.data);
    else skipped.push({ index, reason: result.error.issues[0]?.message ?? "invalid record" });
  });
  return { expenses, skipped };
}

/** Filename that cannot escape a directory or smuggle control characters. */
export function safeFilename(base: string, extension: string): string {
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80);
  // A name made only of separators carries no information and reads as a
  // hidden or malformed file — fall back rather than emit "_.csv".
  const usable = /[A-Za-z0-9]/.test(cleaned) ? cleaned : "betapouch";
  return `${usable}.${extension.replace(/[^\w]/g, "") || "txt"}`;
}
