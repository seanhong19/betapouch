import { formatMoney, type SeriesPoint } from "@betapouch/core";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { useTheme } from "../theme";

/**
 * Spending over time. Same rules as the web chart: one series so no legend,
 * bars capped rather than filling their slot, a recessive baseline, and the
 * selected bar's value shown rather than a number on every column.
 */

interface Props {
  points: SeriesPoint[];
  currency: string;
  locale: string;
  height?: number;
}

const BAR_MAX_WIDTH = 24;

export function SpendChart({ points, currency, locale, height = 160 }: Props) {
  const theme = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  if (points.length === 0) {
    return (
      <Text style={{ color: theme.textMuted, fontSize: 13, paddingVertical: 24, textAlign: "center" }}>
        No spending in this period.
      </Text>
    );
  }

  const max = Math.max(...points.map((p) => p.totalMinor), 1);
  const slot = width > 0 ? width / points.length : 0;
  const barWidth = Math.min(BAR_MAX_WIDTH, Math.max(3, slot - 2));
  const active = selected !== null ? points[selected] : null;

  return (
    <View>
      <View style={{ minHeight: 34 }}>
        {active ? (
          <>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{active.label}</Text>
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "600" }}>
              {formatMoney(active.totalMinor, currency, locale)}
              <Text style={{ color: theme.textMuted, fontWeight: "400" }}>
                {"  "}
                {active.count} {active.count === 1 ? "record" : "records"}
              </Text>
            </Text>
          </>
        ) : (
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>Tap a bar for its total.</Text>
        )}
      </View>

      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Line
              x1={0}
              x2={width}
              y1={height / 2}
              y2={height / 2}
              stroke={theme.gridline}
              strokeWidth={1}
            />
            <Line
              x1={0}
              x2={width}
              y1={height - 1}
              y2={height - 1}
              stroke={theme.baseline}
              strokeWidth={1}
            />
            {points.map((point, index) => {
              if (point.totalMinor <= 0) return null;
              const barHeight = Math.max(2, (point.totalMinor / max) * (height - 4));
              return (
                <Rect
                  key={point.key}
                  x={index * slot + (slot - barWidth) / 2}
                  y={height - barHeight - 1}
                  width={barWidth}
                  height={barHeight}
                  rx={Math.min(4, barWidth / 2)}
                  fill={theme.series1}
                  opacity={selected === null || selected === index ? 1 : 0.5}
                />
              );
            })}
          </Svg>
        )}

        {/* Touch targets sit above the SVG and span the whole slot, so a thin
            bar is still comfortably tappable. */}
        <View style={{ position: "absolute", inset: 0, flexDirection: "row" }}>
          {points.map((point, index) => (
            <Pressable
              key={point.key}
              accessibilityRole="button"
              accessibilityLabel={`${point.label}: ${formatMoney(point.totalMinor, currency, locale)}`}
              onPress={() => setSelected(selected === index ? null : index)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ color: theme.textMuted, fontSize: 11 }}>{points[0]?.label}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 11 }}>{points.at(-1)?.label}</Text>
      </View>
    </View>
  );
}
