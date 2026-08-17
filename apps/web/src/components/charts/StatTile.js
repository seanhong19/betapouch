import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function StatTile({ label, value, delta = null, deltaLabel = "vs previous period", upIsGood = false, sparkline, footnote, }) {
    const hasDelta = delta !== null && Number.isFinite(delta);
    const rising = hasDelta && delta > 0;
    const flat = hasDelta && Math.abs(delta) < 0.005;
    const good = rising === upIsGood;
    const deltaColor = !hasDelta || flat
        ? "var(--text-muted)"
        : good
            ? "var(--delta-good)"
            : "var(--status-critical)";
    return (_jsxs("div", { className: "card p-4", children: [_jsx("div", { className: "text-xs font-medium", style: { color: "var(--text-secondary)" }, children: label }), _jsx("div", { className: "mt-1 text-2xl font-semibold leading-tight", style: { color: "var(--text-primary)" }, children: value }), hasDelta && (_jsxs("div", { className: "mt-1.5 flex items-center gap-1 text-xs", style: { color: deltaColor }, children: [_jsx("span", { "aria-hidden": "true", children: flat ? "→" : rising ? "↑" : "↓" }), _jsx("span", { className: "tabular font-medium", children: flat ? "no change" : `${Math.abs(delta * 100).toFixed(0)}%` }), _jsx("span", { style: { color: "var(--text-muted)" }, children: deltaLabel })] })), sparkline && sparkline.length > 1 && _jsx(Sparkline, { values: sparkline }), footnote && (_jsx("div", { className: "mt-2 text-[11px]", style: { color: "var(--text-muted)" }, children: footnote }))] }));
}
function Sparkline({ values }) {
    const max = Math.max(...values, 1);
    const width = 100;
    const height = 24;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const path = values
        .map((value, index) => `${index === 0 ? "M" : "L"}${index * step},${height - (value / max) * height}`)
        .join(" ");
    const lastValue = values.at(-1) ?? 0;
    return (_jsxs("svg", { className: "mt-2.5", viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", style: { width: "100%", height, display: "block", overflow: "visible" }, "aria-hidden": "true", children: [_jsx("path", { d: path, fill: "none", stroke: "var(--seq-250)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" }), _jsx("circle", { cx: (values.length - 1) * step, cy: height - (lastValue / max) * height, r: "3", fill: "var(--series-1)", stroke: "var(--surface-1)", strokeWidth: "2", vectorEffect: "non-scaling-stroke" })] }));
}
