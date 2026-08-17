import {
  CATEGORIES,
  CATEGORY_LABELS,
  expensesToCsv,
  expensesToJson,
  filterExpenses,
  formatMoney,
  presetRanges,
  safeFilename,
  sortByOccurredAt,
  type Category,
  type Expense,
  type ExpenseDraft,
} from "@betapouch/core";
import { useEffect, useMemo, useState } from "react";
import { ExpenseForm } from "../components/ExpenseForm";
import { useExpenses } from "../lib/expenses";
import { bytesToObjectUrl } from "../lib/images";
import { useVault } from "../lib/vault";

/**
 * Full history: filter by time, category and text, grouped by day so the
 * ledger reads as a timeline rather than an undifferentiated list.
 */
export function ExpensesScreen() {
  const { expenses, removeExpense, saveExpense, getAttachmentBytes } = useExpenses();
  const { settings } = useVault();
  const locale = settings.locale;

  const ranges = useMemo(() => [{ label: "All time", from: "", to: "" }, ...presetRanges()], []);
  const [rangeIndex, setRangeIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const range = ranges[rangeIndex];
  const filtered = useMemo(
    () =>
      sortByOccurredAt(
        filterExpenses(expenses, {
          from: range?.from || null,
          to: range?.to || null,
          search: search || null,
          categories: category ? [category] : null,
        }),
        "desc",
      ),
    [category, expenses, range?.from, range?.to, search],
  );

  const groups = useMemo(() => groupByDay(filtered, locale), [filtered, locale]);
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of filtered) {
      map.set(expense.currency, (map.get(expense.currency) ?? 0) + expense.amountMinor);
    }
    return [...map.entries()];
  }, [filtered]);

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="m-0 text-xl font-semibold tracking-tight">Edit expense</h1>
        <ExpenseForm
          draft={editing as ExpenseDraft}
          submitLabel="Save changes"
          onSubmit={async (draft) => {
            await saveExpense(draft, { id: editing.id });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
        <AttachmentStrip expense={editing} getBytes={getAttachmentBytes} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-xl font-semibold tracking-tight">History</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn py-1.5 text-xs"
            onClick={() => downloadText(expensesToCsv(filtered), safeFilename("betapouch-expenses", "csv"), "text/csv")}
            disabled={filtered.length === 0}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn py-1.5 text-xs"
            onClick={() =>
              downloadText(
                expensesToJson(filtered),
                safeFilename("betapouch-expenses", "json"),
                "application/json",
              )
            }
            disabled={filtered.length === 0}
          >
            Export JSON
          </button>
        </div>
      </header>

      {/* Filters in one row above the list. */}
      <div className="flex flex-wrap gap-2">
        <input
          className="field flex-1 basis-48"
          type="search"
          placeholder="Search merchant, notes, tags…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search expenses"
        />
        <select
          className="field w-auto"
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
        <select
          className="field w-auto"
          value={category}
          onChange={(event) => setCategory(event.target.value as Category | "")}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
        {filtered.length} {filtered.length === 1 ? "record" : "records"}
        {totals.length > 0 && " · "}
        {totals.map(([currencyCode, total]) => formatMoney(total, currencyCode, locale)).join(" + ")}
      </p>

      {filtered.length === 0 ? (
        <p className="card p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing matches those filters.
        </p>
      ) : (
        groups.map(([dayLabel, items]) => (
          <section key={dayLabel}>
            <h2
              className="sticky top-0 z-[1] m-0 py-2 text-xs font-semibold uppercase tracking-wide"
              style={{ background: "var(--plane)", color: "var(--text-muted)" }}
            >
              {dayLabel}
            </h2>
            <ul className="card m-0 list-none p-0">
              {items.map((expense) => (
                <li
                  key={expense.id}
                  className="flex items-center gap-3 border-b p-3 last:border-0"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setEditing(expense)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">
                        {expense.merchant || "Untitled"}
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {formatMoney(expense.amountMinor, expense.currency, locale)}
                      </span>
                    </div>
                    <div
                      className="mt-0.5 flex flex-wrap items-center gap-2 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span>{CATEGORY_LABELS[expense.category]}</span>
                      <span>
                        {new Date(expense.occurredAt).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {expense.attachmentIds.length > 0 && <span aria-label="Has a receipt">▣</span>}
                      {!expense.reviewed && (
                        <span style={{ color: "var(--status-serious)" }}>⚠ unchecked</span>
                      )}
                    </div>
                  </button>

                  {confirmingDelete === expense.id ? (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="btn btn-danger px-2 py-1 text-xs"
                        onClick={() => {
                          void removeExpense(expense.id);
                          setConfirmingDelete(null);
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="btn px-2 py-1 text-xs"
                        onClick={() => setConfirmingDelete(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn shrink-0 px-2 py-1 text-xs"
                      onClick={() => setConfirmingDelete(expense.id)}
                      aria-label={`Delete ${expense.merchant || "expense"}`}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function groupByDay(expenses: Expense[], locale: string): [string, Expense[]][] {
  const groups = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const label = new Date(expense.occurredAt).toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    groups.set(label, [...(groups.get(label) ?? []), expense]);
  }
  return [...groups.entries()];
}

function AttachmentStrip({
  expense,
  getBytes,
}: {
  expense: Expense;
  getBytes: (id: string) => Promise<Uint8Array | null>;
}) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let revoked = false;
    const created: string[] = [];
    void (async () => {
      for (const id of expense.attachmentIds) {
        const bytes = await getBytes(id);
        if (bytes && !revoked) created.push(bytesToObjectUrl(bytes, "image/jpeg"));
      }
      if (!revoked) setUrls(created);
    })();
    return () => {
      revoked = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [expense.attachmentIds, getBytes]);

  if (expense.attachmentIds.length === 0) return null;

  return (
    <section className="card p-4">
      <h2 className="m-0 mb-3 text-sm font-semibold">Receipt</h2>
      <div className="flex gap-3 overflow-x-auto">
        {urls.map((url) => (
          <img key={url} src={url} alt="Stored receipt" className="max-h-72 rounded-lg" />
        ))}
      </div>
    </section>
  );
}

/**
 * Downloads go through a blob URL that is revoked immediately after the click.
 * The export contains the user's full ledger in the clear — it is theirs to
 * hold, but it should not linger as a live URL on the page.
 */
function downloadText(content: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
