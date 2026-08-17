import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ExpensesProvider } from "./lib/expenses";
import { useVault, VaultProvider } from "./lib/vault";
import { AssistantScreen } from "./screens/AssistantScreen";
import { CaptureScreen } from "./screens/CaptureScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { ExpensesScreen } from "./screens/ExpensesScreen";
import { LockScreen } from "./screens/LockScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
const TABS = [
    { id: "dashboard", label: "Dashboard", icon: "◐" },
    { id: "capture", label: "Add", icon: "＋" },
    { id: "expenses", label: "History", icon: "☰" },
    { id: "assistant", label: "Ask", icon: "✦" },
    { id: "settings", label: "Settings", icon: "⚙" },
];
export function App() {
    return (_jsxs(VaultProvider, { children: [_jsx(ThemeSync, {}), _jsx(Shell, {})] }));
}
/** Applies the stored theme preference to the document root. */
function ThemeSync() {
    const { settings, status } = useVault();
    useEffect(() => {
        const root = document.documentElement;
        if (status !== "unlocked" || settings.theme === "system")
            root.removeAttribute("data-theme");
        else
            root.setAttribute("data-theme", settings.theme);
    }, [settings.theme, status]);
    return null;
}
function Shell() {
    const { status } = useVault();
    const [tab, setTab] = useState("dashboard");
    if (status === "loading") {
        return (_jsx("div", { className: "flex h-full items-center justify-center", children: _jsx("p", { style: { color: "var(--text-muted)" }, children: "Opening BetaPouch\u2026" }) }));
    }
    if (status !== "unlocked")
        return _jsx(LockScreen, {});
    return (_jsx(ExpensesProvider, { children: _jsxs("div", { className: "mx-auto flex h-full w-full max-w-5xl flex-col", children: [_jsxs("main", { className: "flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6", children: [tab === "dashboard" && _jsx(DashboardScreen, { onNavigate: setTab }), tab === "capture" && _jsx(CaptureScreen, { onDone: () => setTab("expenses") }), tab === "expenses" && _jsx(ExpensesScreen, {}), tab === "assistant" && _jsx(AssistantScreen, {}), tab === "settings" && _jsx(SettingsScreen, {})] }), _jsx(TabBar, { current: tab, onChange: setTab })] }) }));
}
function TabBar({ current, onChange }) {
    const { lock } = useVault();
    return (_jsxs("nav", { className: "fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-5xl items-stretch justify-around border-t backdrop-blur", style: {
            background: "var(--surface-1)",
            borderColor: "var(--hairline)",
            paddingBottom: "env(safe-area-inset-bottom)",
        }, "aria-label": "Main", children: [TABS.map((tab) => {
                const active = tab.id === current;
                return (_jsxs("button", { type: "button", onClick: () => onChange(tab.id), "aria-current": active ? "page" : undefined, className: "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", style: {
                        color: active ? "var(--series-1)" : "var(--text-muted)",
                        minHeight: 56,
                    }, children: [_jsx("span", { "aria-hidden": "true", className: "text-lg leading-none", children: tab.icon }), tab.label] }, tab.id));
            }), _jsxs("button", { type: "button", onClick: lock, title: "Lock the vault", className: "flex flex-col items-center gap-0.5 px-3 py-2.5 text-[11px] font-medium", style: { color: "var(--text-muted)", minHeight: 56 }, children: [_jsx("span", { "aria-hidden": "true", className: "text-lg leading-none", children: "\u23FB" }), "Lock"] })] }));
}
