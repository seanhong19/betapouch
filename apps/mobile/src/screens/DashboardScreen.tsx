import {
  CATEGORY_LABELS,
  filterExpenses,
  formatMoney,
  granularityFor,
  pickDisplayCurrency,
  presetRanges,
  summarisePeriod,
  timeSeries,
  totalsByCategory,
  totalsByCurrency,
} from "@betapouch/core";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SpendChart } from "../components/SpendChart";
import { Card, Heading, Muted } from "../components/ui";
import { useExpenses } from "../lib/expenses";
import { useVault } from "../lib/vault";
import { useTheme } from "../theme";

export function DashboardScreen({ onAdd }: { onAdd: () => void }) {
  const theme = useTheme();
  const { expenses, loading, damaged } = useExpenses();
  const { settings } = useVault();
  const ranges = useMemo(() => presetRanges(), []);
  const [rangeIndex, setRangeIndex] = useState(2);
  const range = ranges[rangeIndex] ?? ranges[0]!;
  const locale = settings.locale;

  const currencies = useMemo(() => totalsByCurrency(expenses), [expenses]);
  const currency = pickDisplayCurrency(expenses, settings.baseCurrency);

  const scoped = useMemo(
    () => filterExpenses(expenses, { from: range.from, to: range.to, currencies: [currency] }),
    [currency, expenses, range.from, range.to],
  );
  const summary = useMemo(
    () => summarisePeriod(expenses, { currency, from: range.from, to: range.to }),
    [currency, expenses, range.from, range.to],
  );
  const granularity = granularityFor(range.from, range.to);
  const series = useMemo(
    () => timeSeries(scoped, granularity, { currency, from: range.from, to: range.to, locale }),
    [currency, granularity, locale, range.from, range.to, scoped],
  );
  const categories = useMemo(() => totalsByCategory(scoped, currency), [currency, scoped]);

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: theme.plane }}>
        <Muted>Decrypting your records…</Muted>
      </View>
    );
  }

  if (expenses.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 12, flexGrow: 1, justifyContent: "center" }}
        style={{ backgroundColor: theme.plane }}
      >
        <Heading>Nothing recorded yet</Heading>
        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
          Photograph a receipt or type an expense in. Everything you add stays encrypted on this
          phone.
        </Text>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          style={{
            marginTop: 8,
            backgroundColor: theme.series1,
            borderRadius: 10,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: theme.onAccent, fontWeight: "600" }}>Add your first expense</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const max = Math.max(...categories.map((c) => c.totalMinor), 1);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
      style={{ backgroundColor: theme.plane }}
    >
      <Heading>Dashboard</Heading>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ranges.map((option, index) => {
          const selected = index === rangeIndex;
          return (
            <Pressable
              key={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setRangeIndex(index)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? theme.series1 : theme.hairline,
              }}
            >
              <Text style={{ color: selected ? theme.textPrimary : theme.textSecondary, fontSize: 12 }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {damaged.length > 0 && (
        <Card>
          <Text style={{ color: theme.serious, fontSize: 13 }}>
            {damaged.length} {damaged.length === 1 ? "record" : "records"} could not be decrypted and
            {damaged.length === 1 ? " is" : " are"} not included below.
          </Text>
        </Card>
      )}

      {/* Hero figure — one per screen. */}
      <Card>
        <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "500" }}>
          Total spend · {range.label.toLowerCase()}
        </Text>
        <Text style={{ color: theme.textPrimary, fontSize: 40, fontWeight: "600", marginTop: 4 }}>
          {formatMoney(summary.totalMinor, currency, locale)}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6 }}>
          {summary.count} {summary.count === 1 ? "record" : "records"}
          {summary.changeRatio !== null && (
            <Text style={{ color: summary.changeRatio > 0 ? theme.critical : theme.deltaGood }}>
              {"  "}
              {summary.changeRatio > 0 ? "↑" : "↓"}
              {Math.abs(summary.changeRatio * 100).toFixed(0)}% vs previous
            </Text>
          )}
        </Text>
        {currencies.length > 1 && (
          <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
            {currencies
              .filter((c) => c.currency !== currency)
              .map((c) => `${c.count} in ${c.currency}`)
              .join(", ")}{" "}
            not shown — currencies are never converted.
          </Text>
        )}
      </Card>

      <Card>
        <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>
          Spending by {granularity}
        </Text>
        <SpendChart points={series} currency={currency} locale={locale} />
      </Card>

      <Card>
        <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>
          Where it went
        </Text>
        <View style={{ gap: 12 }}>
          {categories.slice(0, 8).map((group) => (
            <View key={group.key} style={{ gap: 5 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.textPrimary, fontSize: 13 }}>
                  {CATEGORY_LABELS[group.key as keyof typeof CATEGORY_LABELS] ?? group.label}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: "500" }}>
                  {formatMoney(group.totalMinor, currency, locale)}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.gridline }}>
                <View
                  style={{
                    width: `${Math.max(2, (group.totalMinor / max) * 100)}%`,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.seq450,
                  }}
                />
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                {Math.round(group.share * 100)}% · {group.count}{" "}
                {group.count === 1 ? "record" : "records"}
              </Text>
            </View>
          ))}
          {categories.length === 0 && <Muted>No spending in this period.</Muted>}
        </View>
      </Card>
    </ScrollView>
  );
}
