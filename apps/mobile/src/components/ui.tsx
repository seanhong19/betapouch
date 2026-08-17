import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme";

/** Small shared primitives so every screen looks like the same app. */

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.hairline },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "default",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const background =
    variant === "primary" ? theme.series1 : variant === "danger" ? "transparent" : theme.raised;
  const borderColor = variant === "danger" ? theme.critical : theme.hairline;
  const color =
    variant === "primary" ? theme.onAccent : variant === "danger" ? theme.critical : theme.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {label && <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>}
      <TextInput
        placeholderTextColor={theme.textMuted}
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: theme.raised,
            borderColor: theme.hairline,
            color: theme.textPrimary,
          },
          props.style,
        ]}
      />
      {hint && <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>}
    </View>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.heading, { color: theme.textPrimary }]}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.muted, { color: theme.textMuted }]}>{children}</Text>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "error" }) {
  const theme = useTheme();
  const color =
    tone === "error" ? theme.critical : tone === "warn" ? theme.serious : theme.textSecondary;
  return (
    <View style={[styles.notice, { backgroundColor: theme.plane }]}>
      <Text style={{ color, fontSize: 13 }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  button: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonLabel: { fontSize: 15, fontWeight: "600" },
  label: { fontSize: 12, fontWeight: "500" },
  hint: { fontSize: 11 },
  input: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  heading: { fontSize: 22, fontWeight: "600", letterSpacing: -0.3 },
  muted: { fontSize: 12 },
  notice: { borderRadius: 10, padding: 12 },
});
