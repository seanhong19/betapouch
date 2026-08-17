import {
  CATEGORY_LABELS,
  filterExpenses,
  formatMoney,
  sortByOccurredAt,
  type Expense,
} from "@betapouch/core";
import { useMemo, useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { Field, Heading, Muted } from "../components/ui";
import { useExpenses } from "../lib/expenses";
import { useVault } from "../lib/vault";
import { useTheme } from "../theme";

export function ExpensesScreen() {
  const theme = useTheme();
  const { expenses, removeExpense } = useExpenses();
  const { settings } = useVault();
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const locale = settings.locale;

  const sections = useMemo(() => {
    const filtered = sortByOccurredAt(
      filterExpenses(expenses, { search: search || null }),
      "desc",
    );
    const groups = new Map<string, Expense[]>();
    for (const expense of filtered) {
      const title = new Date(expense.occurredAt).toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      groups.set(title, [...(groups.get(title) ?? []), expense]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [expenses, locale, search]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.plane }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Heading>History</Heading>
        <Field
          value={search}
          onChangeText={setSearch}
          placeholder="Search merchant, notes, tags…"
          autoCapitalize="none"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: "center" }}>
            <Muted>{expenses.length === 0 ? "Nothing recorded yet." : "Nothing matches that search."}</Muted>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={{
              backgroundColor: theme.plane,
              color: theme.textMuted,
              fontSize: 11,
              fontWeight: "600",
              letterSpacing: 0.5,
              paddingVertical: 8,
              textTransform: "uppercase",
            }}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.hairline,
            }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "500", flex: 1 }}
                >
                  {item.merchant || "Untitled"}
                </Text>
                <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "600" }}>
                  {formatMoney(item.amountMinor, item.currency, locale)}
                </Text>
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                {CATEGORY_LABELS[item.category]}
                {item.attachmentIds.length > 0 ? "  ▣" : ""}
                {item.reviewed ? "" : "  ⚠ unchecked"}
              </Text>
            </View>

            {confirming === item.id ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void removeExpense(item.id);
                    setConfirming(null);
                  }}
                >
                  <Text style={{ color: theme.critical, fontSize: 13, fontWeight: "600" }}>
                    Delete
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setConfirming(null)}>
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Keep</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.merchant || "expense"}`}
                onPress={() => setConfirming(item.id)}
                hitSlop={12}
              >
                <Text style={{ color: theme.textMuted, fontSize: 16 }}>✕</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}
