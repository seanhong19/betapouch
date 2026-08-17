import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CATEGORIES, CATEGORY_LABELS, expensesToCsv, expensesToJson, filterExpenses, formatMoney, presetRanges, safeFilename, sortByOccurredAt, } from "@betapouch/core";
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
    const [category, setCategory] = useState("");
    const [editing, setEditing] = useState(null);
    const [confirmingDelete, setConfirmingDelete] = useState(null);
    const range = ranges[rangeIndex];
    const filtered = useMemo(() => sortByOccurredAt(filterExpenses(expenses, {
        from: range?.from || null,
        to: range?.to || null,
        search: search || null,
        categories: category ? [category] : null,
    }), "desc"), [category, expenses, range?.from, range?.to, search]);
    const groups = useMemo(() => groupByDay(filtered, locale), [filtered, locale]);
    const totals = useMemo(() => {
        const map = new Map();
        for (const expense of filtered) {
            map.set(expense.currency, (map.get(expense.currency) ?? 0) + expense.amountMinor);
        }
        return [...map.entries()];
    }, [filtered]);
    if (editing) {
        return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "Edit expense" }), _jsx(ExpenseForm, { draft: editing, submitLabel: "Save changes", onSubmit: async (draft) => {
                        await saveExpense(draft, { id: editing.id });
                        setEditing(null);
                    }, onCancel: () => setEditing(null) }), _jsx(AttachmentStrip, { expense: editing, getBytes: getAttachmentBytes })] }));
    }
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("header", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "History" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn py-1.5 text-xs", onClick: () => downloadText(expensesToCsv(filtered), safeFilename("betapouch-expenses", "csv"), "text/csv"), disabled: filtered.length === 0, children: "Export CSV" }), _jsx("button", { type: "button", className: "btn py-1.5 text-xs", onClick: () => downloadText(expensesToJson(filtered), safeFilename("betapouch-expenses", "json"), "application/json"), disabled: filtered.length === 0, children: "Export JSON" })] })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("input", { className: "field flex-1 basis-48", type: "search", placeholder: "Search merchant, notes, tags\u2026", value: search, onChange: (event) => setSearch(event.target.value), "aria-label": "Search expenses" }), _jsx("select", { className: "field w-auto", value: rangeIndex, onChange: (event) => setRangeIndex(Number(event.target.value)), "aria-label": "Date range", children: ranges.map((option, index) => (_jsx("option", { value: index, children: option.label }, option.label))) }), _jsxs("select", { className: "field w-auto", value: category, onChange: (event) => setCategory(event.target.value), "aria-label": "Category", children: [_jsx("option", { value: "", children: "All categories" }), CATEGORIES.map((value) => (_jsx("option", { value: value, children: CATEGORY_LABELS[value] }, value)))] })] }), _jsxs("p", { className: "m-0 text-xs", style: { color: "var(--text-muted)" }, children: [filtered.length, " ", filtered.length === 1 ? "record" : "records", totals.length > 0 && " · ", totals.map(([currencyCode, total]) => formatMoney(total, currencyCode, locale)).join(" + ")] }), filtered.length === 0 ? (_jsx("p", { className: "card p-8 text-center text-sm", style: { color: "var(--text-muted)" }, children: "Nothing matches those filters." })) : (groups.map(([dayLabel, items]) => (_jsxs("section", { children: [_jsx("h2", { className: "sticky top-0 z-[1] m-0 py-2 text-xs font-semibold uppercase tracking-wide", style: { background: "var(--plane)", color: "var(--text-muted)" }, children: dayLabel }), _jsx("ul", { className: "card m-0 list-none p-0", children: items.map((expense) => (_jsxs("li", { className: "flex items-center gap-3 border-b p-3 last:border-0", style: { borderColor: "var(--hairline)" }, children: [_jsxs("button", { type: "button", className: "min-w-0 flex-1 text-left", onClick: () => setEditing(expense), children: [_jsxs("div", { className: "flex items-baseline justify-between gap-3", children: [_jsx("span", { className: "truncate text-sm font-medium", children: expense.merchant || "Untitled" }), _jsx("span", { className: "tabular shrink-0 text-sm font-semibold", children: formatMoney(expense.amountMinor, expense.currency, locale) })] }), _jsxs("div", { className: "mt-0.5 flex flex-wrap items-center gap-2 text-xs", style: { color: "var(--text-muted)" }, children: [_jsx("span", { children: CATEGORY_LABELS[expense.category] }), _jsx("span", { children: new Date(expense.occurredAt).toLocaleTimeString(locale, {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    }) }), expense.attachmentIds.length > 0 && _jsx("span", { "aria-label": "Has a receipt", children: "\u25A3" }), !expense.reviewed && (_jsx("span", { style: { color: "var(--status-serious)" }, children: "\u26A0 unchecked" }))] })] }), confirmingDelete === expense.id ? (_jsxs("span", { className: "flex shrink-0 gap-1", children: [_jsx("button", { type: "button", className: "btn btn-danger px-2 py-1 text-xs", onClick: () => {
                                                void removeExpense(expense.id);
                                                setConfirmingDelete(null);
                                            }, children: "Delete" }), _jsx("button", { type: "button", className: "btn px-2 py-1 text-xs", onClick: () => setConfirmingDelete(null), children: "Keep" })] })) : (_jsx("button", { type: "button", className: "btn shrink-0 px-2 py-1 text-xs", onClick: () => setConfirmingDelete(expense.id), "aria-label": `Delete ${expense.merchant || "expense"}`, children: "\u2715" }))] }, expense.id))) })] }, dayLabel))))] }));
}
function groupByDay(expenses, locale) {
    const groups = new Map();
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
function AttachmentStrip({ expense, getBytes, }) {
    const [urls, setUrls] = useState([]);
    useEffect(() => {
        let revoked = false;
        const created = [];
        void (async () => {
            for (const id of expense.attachmentIds) {
                const bytes = await getBytes(id);
                if (bytes && !revoked)
                    created.push(bytesToObjectUrl(bytes, "image/jpeg"));
            }
            if (!revoked)
                setUrls(created);
        })();
        return () => {
            revoked = true;
            for (const url of created)
                URL.revokeObjectURL(url);
        };
    }, [expense.attachmentIds, getBytes]);
    if (expense.attachmentIds.length === 0)
        return null;
    return (_jsxs("section", { className: "card p-4", children: [_jsx("h2", { className: "m-0 mb-3 text-sm font-semibold", children: "Receipt" }), _jsx("div", { className: "flex gap-3 overflow-x-auto", children: urls.map((url) => (_jsx("img", { src: url, alt: "Stored receipt", className: "max-h-72 rounded-lg" }, url))) })] }));
}
/**
 * Downloads go through a blob URL that is revoked immediately after the click.
 * The export contains the user's full ledger in the clear — it is theirs to
 * hold, but it should not linger as a live URL on the page.
 */
function downloadText(content, filename, mimeType) {
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
