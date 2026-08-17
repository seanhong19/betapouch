import { useColorScheme } from "react-native";

/**
 * The same token set as the web app, in the form React Native wants. Dark is
 * a selected set of steps for the dark surface, not an automatic inversion.
 */

export interface Theme {
  plane: string;
  surface: string;
  raised: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  hairline: string;
  gridline: string;
  baseline: string;
  series1: string;
  seq250: string;
  seq450: string;
  good: string;
  warning: string;
  serious: string;
  critical: string;
  deltaGood: string;
  onAccent: string;
}

const light: Theme = {
  plane: "#f9f9f7",
  surface: "#fcfcfb",
  raised: "#ffffff",
  textPrimary: "#0b0b0b",
  textSecondary: "#52514e",
  textMuted: "#898781",
  hairline: "rgba(11,11,11,0.10)",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
  series1: "#2a78d6",
  seq250: "#86b6ef",
  seq450: "#2a78d6",
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  deltaGood: "#006300",
  onAccent: "#ffffff",
};

const dark: Theme = {
  plane: "#0d0d0d",
  surface: "#1a1a19",
  raised: "#232322",
  textPrimary: "#ffffff",
  textSecondary: "#c3c2b7",
  textMuted: "#898781",
  hairline: "rgba(255,255,255,0.10)",
  gridline: "#2c2c2a",
  baseline: "#383835",
  series1: "#3987e5",
  seq250: "#184f95",
  seq450: "#3987e5",
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  deltaGood: "#0ca30c",
  onAccent: "#ffffff",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const themes = { light, dark };
