import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatMoney } from "@betapouch/core";
export function BreakdownBars({ groups, currency, locale, limit = 8, emptyMessage = "Nothing to show yet.", onSelect, }) {
    if (groups.length === 0) {
        return (_jsx("p", { className: "py-6 text-center text-sm", style: { color: "var(--text-muted)" }, children: emptyMessage }));
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
    return (_jsx("ul", { className: "m-0 flex list-none flex-col gap-2.5 p-0", children: rows.map((group) => {
            const width = Math.max(1.5, (group.totalMinor / max) * 100);
            const interactive = Boolean(onSelect) && group.key !== "__other__";
            return (_jsx("li", { children: _jsxs("button", { type: "button", disabled: !interactive, onClick: interactive ? () => onSelect?.(group.key) : undefined, className: "block w-full rounded-md px-1 py-0.5 text-left", style: { cursor: interactive ? "pointer" : "default", background: "transparent" }, children: [_jsxs("div", { className: "mb-1 flex items-baseline justify-between gap-3 text-sm", children: [_jsx("span", { className: "truncate", style: { color: "var(--text-primary)" }, children: group.label }), _jsx("span", { className: "tabular shrink-0 font-medium", style: { color: "var(--text-secondary)" }, children: formatMoney(group.totalMinor, currency, locale) })] }), _jsx("div", { className: "h-2 w-full overflow-hidden rounded-full", style: { background: "var(--gridline)" }, children: _jsx("div", { className: "h-full rounded-full", style: {
                                    width: `${width}%`,
                                    background: group.key === "__other__" ? "var(--seq-250)" : "var(--seq-450)",
                                } }) }), _jsxs("div", { className: "mt-1 text-[11px]", style: { color: "var(--text-muted)" }, children: [Math.round(group.share * 100), "% \u00B7 ", group.count, " ", group.count === 1 ? "record" : "records"] })] }) }, group.key));
        }) }));
}
