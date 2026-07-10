/**
 * VerifyWise Unified Color Palette
 *
 * Single source of truth for ALL colors across every module:
 * Governance, LLM Evals, AI Detection, Shadow AI, Model Inventory.
 *
 * Grey, green, and red tokens derive from primitives.ts.
 * Other status, risk, accent, and chart hues remain here until their scales are defined.
 *
 * Usage:
 *   import { palette } from '@/presentation/themes/palette';
 *   <Box sx={{ color: palette.status.error.text }} />
 *
 * Migration guide: see /docs/COLOR_MIGRATION.md
 */

import { grey, green, red } from "./primitives";

// ---------------------------------------------------------------------------
// 1. Semantic status colors (success / error / warning / info / default)
//    Background = light pastel, text = muted dark tone.
// ---------------------------------------------------------------------------

export const status = {
  success: { bg: green[200], text: green[600], border: green[300] },
  error: { bg: red[200], text: red[500], border: red[300] },
  warning: { bg: "#FFF8E1", text: "#795548", border: "#F5E6B8" },
  info: { bg: "#E3F2FD", text: "#1565C0", border: "#BBDEFB" },
  default: { bg: grey[100], text: grey[500], border: grey[200] },
} as const;

// ---------------------------------------------------------------------------
// 2. Risk levels (critical → very-low)
//    Same pastel style as Chip. Used in risk tables, charts, badges.
// ---------------------------------------------------------------------------

export const risk = {
  critical: { bg: red[200], text: red[500], border: red[300] },
  high: { bg: "#FFE5D0", text: "#E64A19", border: "#F5CDB0" },
  medium: { bg: "#FFF8E1", text: "#795548", border: "#F5E6B8" },
  low: { bg: green[200], text: green[600], border: green[300] },
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
  primary: { bg: green[100], text: green[700], border: green[400] },
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
// 6. Text hierarchy (Figma grey scale)
// ---------------------------------------------------------------------------

export const text = {
  primary: grey[900],
  secondary: grey[700],
  tertiary: grey[600],
  accent: grey[400],
  disabled: grey[350],
  black: grey[950],
  icon: grey[450],
  muted: grey[600],
  subdued: grey[450],
} as const;

// ---------------------------------------------------------------------------
// 7. Backgrounds
// ---------------------------------------------------------------------------

export const background = {
  main: grey[50],
  alt: grey[100],
  modal: grey[100],
  fill: green[100],
  accent: grey[100],
  hover: grey[150],
  selected: green[100],
  surface: grey[150],
  gradientStop: "#f8fafc",
} as const;

// ---------------------------------------------------------------------------
// 8. Borders (Figma grey scale)
// ---------------------------------------------------------------------------

export const border = {
  light: grey[200],
  dark: grey[300],
} as const;

// ---------------------------------------------------------------------------
// 9. Primary / brand
// ---------------------------------------------------------------------------

export const brand = {
  primary: green[700],
  primaryHover: green[900],
  primaryLight: green[100],
  primaryDark: green[800],
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
