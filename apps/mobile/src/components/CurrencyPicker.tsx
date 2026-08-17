import { countryName, currencySymbol, searchCurrencies } from "@betapouch/core";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./ui";

/**
 * Currency picker for mobile: a button that opens a searchable full-screen
 * list. Searchable by country as well as code, because people know they are
 * in Malaysia, not that the code is MYR.
 */

interface Props {
  value: string;
  onChange: (code: string) => void;
  locale?: string;
  label?: string;
}

export function CurrencyPicker({ value, onChange, locale = "en", label }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchCurrencies(query, locale, 300), [locale, query]);
  const symbol = useMemo(() => currencySymbol(value, locale), [locale, value]);

  return (
    <View style={{ gap: 4 }}>
      {label && (
        <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "500" }}>{label}</Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Currency: ${value}. Tap to change.`}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        style={{
          minHeight: 48,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.hairline,
          backgroundColor: theme.raised,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: theme.textPrimary, fontSize: 15 }}>
          {value}
          <Text style={{ color: theme.textMuted }}>{`  ${symbol}`}</Text>
        </Text>
        <Text style={{ color: theme.textMuted }}>▾</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.plane, paddingTop: 48 }}>
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: "600" }}>
              Choose a currency
            </Text>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search by country or currency"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                minHeight: 48,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.hairline,
                backgroundColor: theme.raised,
                color: theme.textPrimary,
                paddingHorizontal: 12,
                fontSize: 15,
              }}
            />
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={{ color: theme.textMuted, fontSize: 13, padding: 16 }}>
                No currency matches “{query}”.
              </Text>
            }
            renderItem={({ item }) => {
              const selected = item.code === value;
              const where = item.countries
                .slice(0, 2)
                .map((c) => countryName(c, locale))
                .join(", ");
              const more = item.countries.length - 2;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(item.code);
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.hairline,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontSize: 13,
                      fontWeight: "600",
                      width: 48,
                    }}
                  >
                    {item.code}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.textPrimary, fontSize: 15 }}>
                      {item.name}
                    </Text>
                    <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 12 }}>
                      {where}
                      {more > 0 ? ` +${more} more` : ""}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 15 }}>{item.symbol}</Text>
                  {selected && <Text style={{ color: theme.series1 }}>✓</Text>}
                </Pressable>
              );
            }}
          />

          <View style={{ padding: 16 }}>
            <Button label="Cancel" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
