/**
 * Semantic color tokens shared by the frontend theme and the backend
 * email/PDF renderers. Scale hex lives in ./primitives.ts.
 */
import {
  grey,
  green,
  red,
  amber,
  orange,
  blue,
  indigo,
  purple,
  teal,
  pink,
} from "./primitives";

export const status = {
  // strong = vivid green reserved for transient confirmations (e.g. save success).
  // Not on the green scale; kept here until that step exists in primitives.ts.
  success: {
    bg: green[200],
    text: green[600],
    border: green[300],
    strong: "#079455",
  },
  error: { bg: red[200], text: red[500], border: red[300] },
  warning: { bg: amber[100], text: amber[600], border: amber[200] },
  info: { bg: blue[50], text: blue[800], border: blue[100] },
  default: { bg: grey[100], text: grey[500], border: grey[200] },
} as const;

export const risk = {
  critical: { bg: red[200], text: red[500], border: red[300] },
  high: { bg: orange[100], text: orange[600], border: orange[200] },
  medium: { bg: amber[100], text: amber[600], border: amber[200] },
  low: { bg: green[200], text: green[600], border: green[300] },
  veryLow: { bg: teal[50], text: teal[800], border: teal[100] },
} as const;

export const severity = {
  catastrophic: risk.critical,
  major: risk.high,
  moderate: risk.medium,
  minor: risk.low,
  negligible: risk.veryLow,
} as const;

export const accent = {
  primary: { bg: green[100], text: green[700], border: green[400] },
  indigo: { bg: indigo[50], text: indigo[600], border: indigo[100] },
  purple: { bg: purple[50], text: purple[600], border: purple[100] },
  orange: { bg: orange[50], text: orange[600], border: orange[200] },
  teal: { bg: teal[50], text: teal[800], border: teal[100] },
  blue: { bg: blue[50], text: blue[800], border: blue[100] },
  pink: { bg: pink[50], text: pink[800], border: pink[100] },
  amber: { bg: amber[100], text: amber[700], border: amber[200] },
} as const;

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

/** Icon strokes. Read the scales directly so icons do not depend on text tokens. */
export const icon = {
  default: grey[450],
  error: red[500],
} as const;

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

export const border = {
  light: grey[200],
  dark: grey[300],
} as const;

export const brand = {
  primary: green[700],
  primaryHover: green[900],
  primaryLight: green[100],
  primaryDark: green[800],
} as const;

export const editor = {
  highlight: "#fef08a",
  searchRing: "#eab308",
  codeBlockBg: "#1e1e1e",
  codeBlockText: "#d4d4d4",
  historyActiveBg: "#E6F4F1",
  historyActiveHoverBg: "#D1EDE6",
  imageErrorBg: "#fee2e2",
  imageErrorText: "#991b1b",
  imagePlaceholderBg: "#f0f0f0",
  imagePlaceholderText: "#666666",
} as const;

export const userTextColors = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#16a34a",
  "#059669",
  "#0d9488",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
] as const;

export const palette = {
  status,
  risk,
  severity,
  accent,
  chart,
  text,
  icon,
  background,
  border,
  brand,
  editor,
} as const;

export default palette;
