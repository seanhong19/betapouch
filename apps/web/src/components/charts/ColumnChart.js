import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatMoney } from "@betapouch/core";
import { useId, useState } from "react";
const BAR_MAX_WIDTH = 24;
const BAR_GAP = 2;
export function ColumnChart({ points, currency, locale, height = 200 }) {
    const clipId = useId();
    const [hovered, setHovered] = useState(null);
    if (points.length === 0) {
        return (_jsx("p", { className: "py-10 text-center text-sm", style: { color: "var(--text-muted)" }, children: "No spending in this period." }));
    }
    const max = Math.max(...points.map((p) => p.totalMinor), 1);
    const peakIndex = points.reduce((best, p, i) => (p.totalMinor > (points[best]?.totalMinor ?? 0) ? i : best), 0);
    const width = 100; // percentage-based viewBox keeps it fluid
    const plotHeight = height - 28; // room for the x labels
    const slot = width / points.length;
    const barWidth = Math.min(BAR_MAX_WIDTH / 4, Math.max(0.6, slot - BAR_GAP / 4));
    // Round the top gridline to a clean number so the axis reads well.
    const gridValues = [0.5, 1].map((f) => max * f);
    const labelEvery = Math.max(1, Math.ceil(points.length / 7));
    return (_jsxs("figure", { className: "m-0", children: [_jsxs("div", { className: "relative", children: [_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", style: { width: "100%", height, display: "block" }, role: "img", "aria-label": `Spending per period, peak ${formatMoney(points[peakIndex]?.totalMinor ?? 0, currency, locale)}`, children: [_jsx("defs", { children: _jsx("clipPath", { id: clipId, children: _jsx("rect", { x: "0", y: "0", width: width, height: height }) }) }), gridValues.map((value) => {
                                const y = plotHeight - (value / max) * plotHeight;
                                return (_jsx("line", { x1: "0", x2: width, y1: y, y2: y, stroke: "var(--gridline)", strokeWidth: "0.3", vectorEffect: "non-scaling-stroke" }, value));
                            }), _jsx("line", { x1: "0", x2: width, y1: plotHeight, y2: plotHeight, stroke: "var(--baseline)", strokeWidth: "0.4", vectorEffect: "non-scaling-stroke" }), _jsx("g", { clipPath: `url(#${clipId})`, children: points.map((point, index) => {
                                    const barHeight = (point.totalMinor / max) * plotHeight;
                                    const x = index * slot + (slot - barWidth) / 2;
                                    const y = plotHeight - barHeight;
                                    const isHovered = hovered === index;
                                    return (_jsxs("g", { children: [_jsx("rect", { x: index * slot, y: 0, width: slot, height: plotHeight, fill: "transparent", onMouseEnter: () => setHovered(index), onMouseLeave: () => setHovered(null) }), point.totalMinor > 0 && (_jsx("rect", { x: x, y: y, width: barWidth, height: Math.max(barHeight, 0.8), rx: "1", fill: "var(--series-1)", opacity: hovered === null || isHovered ? 1 : 0.55, pointerEvents: "none" }))] }, point.key));
                                }) })] }), hovered !== null && points[hovered] && (_jsxs("div", { className: "pointer-events-none absolute top-1 rounded-lg px-2.5 py-1.5 text-xs shadow-sm", style: {
                            background: "var(--surface-2)",
                            border: "1px solid var(--hairline)",
                            color: "var(--text-primary)",
                            left: `${Math.min(78, (hovered / points.length) * 100)}%`,
                        }, children: [_jsx("div", { style: { color: "var(--text-secondary)" }, children: points[hovered].label }), _jsx("div", { className: "font-semibold", children: formatMoney(points[hovered].totalMinor, currency, locale) }), _jsxs("div", { style: { color: "var(--text-muted)" }, children: [points[hovered].count, " ", points[hovered].count === 1 ? "record" : "records"] })] }))] }), _jsx("div", { className: "tabular mt-1 flex justify-between text-[11px]", style: { color: "var(--text-muted)" }, children: points
                    .filter((_, i) => i % labelEvery === 0)
                    .map((point) => (_jsx("span", { children: point.label }, point.key))) })] }));
}
