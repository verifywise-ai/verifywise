/**
 * VerifyWise Unified Color Palette
 *
 * Single source of truth for ALL colors across every module:
 * Governance, LLM Evals, AI Detection, Shadow AI, Model Inventory.
 *
 * Design philosophy: calm, pastel backgrounds with muted text —
 * derived from the Chip component's proven palette. All status,
 * risk, chart, and accent colors live here so every module stays
 * visually coherent.
 *
 * Usage:
 *   import { palette } from '@/presentation/themes/palette';
 *   <Box sx={{ color: palette.status.error.text }} />
 *
 * Migration guide: see /docs/COLOR_MIGRATION.md
 */

// ---------------------------------------------------------------------------
// 1. Semantic status colors (success / error / warning / info / default)
//    Background = light pastel, text = muted dark tone.
// ---------------------------------------------------------------------------

export const status = {
  success: { bg: "#E6F4EA", text: "#138A5E", border: "#C8E6D0" },
  error: { bg: "#FFD6D6", text: "#D32F2F", border: "#F5B8B8" },
  warning: { bg: "#FFF8E1", text: "#795548", border: "#F5E6B8" },
  info: { bg: "#E3F2FD", text: "#1565C0", border: "#BBDEFB" },
  default: { bg: "#F3F4F6", text: "#6B7280", border: "#E5E7EB" },
} as const;

// ---------------------------------------------------------------------------
// 2. Risk levels (critical → very-low)
//    Same pastel style as Chip. Used in risk tables, charts, badges.
// ---------------------------------------------------------------------------

export const risk = {
  critical: { bg: "#FFD6D6", text: "#D32F2F", border: "#F5B8B8" },
  high: { bg: "#FFE5D0", text: "#E64A19", border: "#F5CDB0" },
  medium: { bg: "#FFF8E1", text: "#795548", border: "#F5E6B8" },
  low: { bg: "#E6F4EA", text: "#138A5E", border: "#C8E6D0" },
  veryLow: { bg: "#E0F7FA", text: "#00695C", border: "#B2EBF2" },
} as const;

// ---------------------------------------------------------------------------
// 3. Severity aliases (map to the same risk colors)
// ---------------------------------------------------------------------------

export const severity = {
  catastrophic: risk.critical,
  major: risk.high,
  moderate: risk.medium,
  minor: risk.low,
  negligible: risk.veryLow,
} as const;

// ---------------------------------------------------------------------------
// 4. Feature accent colors (sidebar icons, top-bar buttons, module branding)
//    Muted / pastel versions — distinct per feature but calming.
// ---------------------------------------------------------------------------

export const accent = {
  primary: { bg: "#E6F0EC", text: "#13715B", border: "#C2DDD3" },
  indigo: { bg: "#E8EAF6", text: "#3949AB", border: "#C5CAE9" },
  purple: { bg: "#EDE7F6", text: "#5E35B1", border: "#D1C4E9" },
  orange: { bg: "#FFF3E0", text: "#E65100", border: "#FFE0B2" },
  teal: { bg: "#E0F2F1", text: "#00695C", border: "#B2DFDB" },
  blue: { bg: "#E3F2FD", text: "#1565C0", border: "#BBDEFB" },
  pink: { bg: "#FCE4EC", text: "#AD1457", border: "#F8BBD0" },
  amber: { bg: "#FFF8E1", text: "#FF8F00", border: "#FFECB3" },
} as const;

// ---------------------------------------------------------------------------
// 5. Chart palette (ordered sequence for pie/bar/line charts)
//    Same hue families as accents but tuned for data-viz legibility.
//    8 colors — enough for most charts; cycle if > 8 series.
// ---------------------------------------------------------------------------

export const chart = [
  "#5C8A7D", // muted teal-green (primary family)
  "#7986CB", // muted indigo
  "#A1887F", // muted brown
  "#9575CD", // muted purple
  "#4DB6AC", // muted teal
  "#E57373", // muted red
  "#FFB74D", // muted orange
  "#81C784", // muted green
] as const;

// ---------------------------------------------------------------------------
// 6. Text hierarchy (from theme — repeated here for palette completeness)
// ---------------------------------------------------------------------------

export const text = {
  primary: "#1c2130",
  secondary: "#344054",
  tertiary: "#475467",
  accent: "#838c99",
  disabled: "#9CA3AF",
  black: "#000000",
  icon: "#667085",
  muted: "#98A2B3",
  subdued: "#616161",
} as const;

// ---------------------------------------------------------------------------
// 7. Backgrounds
// ---------------------------------------------------------------------------

export const background = {
  main: "#FFFFFF",
  alt: "#FCFCFD",
  modal: "#FCFCFD",
  fill: "#E6F0EC",
  accent: "#f9fafb",
  hover: "#F3F4F6",
  selected: "#E6F0EC",
  surface: "#f5f5f5",
  gradientStop: "#f8fafc",
} as const;

// ---------------------------------------------------------------------------
// 8. Borders
// ---------------------------------------------------------------------------

export const border = {
  light: "#eaecf0",
  dark: "#d0d5dd",
} as const;

// ---------------------------------------------------------------------------
// 9. Primary / brand
// ---------------------------------------------------------------------------

export const brand = {
  primary: "#13715B",
  primaryHover: "#0F5A47",
  primaryLight: "#E6F0EC",
  primaryDark: "#10614d",
} as const;

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const palette = {
  status,
  risk,
  severity,
  accent,
  chart,
  text,
  background,
  border,
  brand,
} as const;

export default palette;
