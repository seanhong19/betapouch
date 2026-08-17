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
] as const;

type TabId = (typeof TABS)[number]["id"];

export function App() {
  return (
    <VaultProvider>
      <ThemeSync />
      <Shell />
    </VaultProvider>
  );
}

/** Applies the stored theme preference to the document root. */
function ThemeSync() {
  const { settings, status } = useVault();
  useEffect(() => {
    const root = document.documentElement;
    if (status !== "unlocked" || settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
  }, [settings.theme, status]);
  return null;
}

function Shell() {
  const { status } = useVault();
  const [tab, setTab] = useState<TabId>("dashboard");

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <p style={{ color: "var(--text-muted)" }}>Opening BetaPouch…</p>
      </div>
    );
  }

  if (status !== "unlocked") return <LockScreen />;

  return (
    <ExpensesProvider>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6">
          {tab === "dashboard" && <DashboardScreen onNavigate={setTab} />}
          {tab === "capture" && <CaptureScreen onDone={() => setTab("expenses")} />}
          {tab === "expenses" && <ExpensesScreen />}
          {tab === "assistant" && <AssistantScreen />}
          {tab === "settings" && <SettingsScreen />}
        </main>
        <TabBar current={tab} onChange={setTab} />
      </div>
    </ExpensesProvider>
  );
}

function TabBar({ current, onChange }: { current: TabId; onChange: (tab: TabId) => void }) {
  const { lock } = useVault();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-5xl items-stretch justify-around border-t backdrop-blur"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--hairline)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Main"
    >
      {TABS.map((tab) => {
        const active = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
            style={{
              color: active ? "var(--series-1)" : "var(--text-muted)",
              minHeight: 56,
            }}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={lock}
        title="Lock the vault"
        className="flex flex-col items-center gap-0.5 px-3 py-2.5 text-[11px] font-medium"
        style={{ color: "var(--text-muted)", minHeight: 56 }}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⏻
        </span>
        Lock
      </button>
    </nav>
  );
}
