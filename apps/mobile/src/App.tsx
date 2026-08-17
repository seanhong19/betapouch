import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Heading, Notice } from "./components/ui";
import { verifyCrypto } from "./lib/crypto";
import { ExpensesProvider } from "./lib/expenses";
import { useVault, VaultProvider } from "./lib/vault";
import { CaptureScreen } from "./screens/CaptureScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { ExpensesScreen } from "./screens/ExpensesScreen";
import { LockScreen } from "./screens/LockScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useTheme } from "./theme";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "◐" },
  { id: "capture", label: "Add", icon: "＋" },
  { id: "expenses", label: "History", icon: "☰" },
  { id: "settings", label: "Settings", icon: "⚙" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function App() {
  return (
    <SafeAreaProvider>
      <CryptoGate>
        <VaultProvider>
          <Shell />
        </VaultProvider>
      </CryptoGate>
    </SafeAreaProvider>
  );
}

/**
 * Nothing runs until the native crypto module has proved itself with a real
 * encrypt/decrypt round trip. Starting the app without working cryptography
 * would mean the first thing it does is fail to protect data it has already
 * accepted from the user.
 */
function CryptoGate({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const [state, setState] = useState<"checking" | "ok" | "failed">("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    void verifyCrypto()
      .then(() => setState("ok"))
      .catch((error: unknown) => {
        setDetail(error instanceof Error ? error.message : "Unknown cryptography failure.");
        setState("failed");
      });
  }, []);

  if (state === "checking") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.plane, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.textMuted }}>Starting BetaPouch…</Text>
      </View>
    );
  }

  if (state === "failed") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.plane }}>
        <View style={{ padding: 20, gap: 16, flex: 1, justifyContent: "center" }}>
          <Heading>Cannot start safely</Heading>
          <Notice tone="error">{detail}</Notice>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            BetaPouch will not run without working encryption. It will not fall back to storing your
            expenses unprotected.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

function Shell() {
  const theme = useTheme();
  const { status } = useVault();
  const [tab, setTab] = useState<TabId>("dashboard");

  if (status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.plane, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.textMuted }}>Opening your vault…</Text>
      </View>
    );
  }

  if (status !== "unlocked") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.plane }}>
        <StatusBar style="auto" />
        <LockScreen />
      </SafeAreaView>
    );
  }

  return (
    <ExpensesProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.plane }}>
        <StatusBar style="auto" />
        <View style={{ flex: 1 }}>
          {tab === "dashboard" && <DashboardScreen onAdd={() => setTab("capture")} />}
          {tab === "capture" && <CaptureScreen onDone={() => setTab("expenses")} />}
          {tab === "expenses" && <ExpensesScreen />}
          {tab === "settings" && <SettingsScreen />}
        </View>

        <View
          style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: theme.hairline,
            backgroundColor: theme.surface,
          }}
        >
          {TABS.map((item) => {
            const active = item.id === tab;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(item.id)}
                style={{ flex: 1, alignItems: "center", paddingVertical: 10, minHeight: 56 }}
              >
                <Text style={{ fontSize: 18, color: active ? theme.series1 : theme.textMuted }}>
                  {item.icon}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "500",
                    color: active ? theme.series1 : theme.textMuted,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </ExpensesProvider>
  );
}
