/**
 * CLASSIC look (before the phase 1 restyle). Kept so the old UI stays
 * switchable until the January 2027 cutover; delete this folder then.
 * Same exports and shapes as ../primitives.ts. Client only: the backend
 * compiles ../primitives.ts.
 *
 * Shared color scales. Hex values live here so the frontend and backend share
 * one typed module. Screens import the semantic palette, not these scales.
 */

/** Grey scale: 50 (lightest) → 950 (black) */
export const grey = {
  50: "#FFFFFF",
  100: "#F9FAFB",
  150: "#F3F4F6",
  200: "#E5E7EB",
  300: "#D0D5DD",
  350: "#9CA3AF",
  400: "#838C99",
  450: "#667085",
  500: "#6B7280",
  600: "#475467",
  700: "#344054",
  800: "#1F2937",
  900: "#1C2130",
  950: "#000000",
} as const;

export type GreyStep = keyof typeof grey;

/** Green scale: 50 (lightest) → 900 (darkest) */
export const green = {
  50: "#F0FDF4",
  100: "#E6F0EC",
  200: "#E6F4EA",
  300: "#C8E6D0",
  400: "#C2DDD3",
  500: "#10B981",
  600: "#138A5E",
  700: "#13715B",
  800: "#10614D",
  900: "#0F5A47",
} as const;

export type GreenStep = keyof typeof green;

/** Red scale (partial): 50 (subtle tint) → 500 (main). */
export const red = {
  50: "#FEF2F2",
  200: "#FFD6D6",
  300: "#F5B8B8",
  500: "#D32F2F",
  700: "#B71C1C",
} as const;

export type RedStep = keyof typeof red;

/** Yellow scale */
export const yellow = {
  600: "#FBBF24",
} as const;

export type YellowStep = keyof typeof yellow;

/** Warning / medium — amber surfaces with brown-toned text */
export const amber = {
  100: "#FFF8E1",
  200: "#F5E6B8",
  500: "#F59E0B",
  600: "#795548",
  700: "#92400E",
} as const;

export type AmberStep = keyof typeof amber;

/** Orange scale */
export const orange = {
  50: "#FFF4EB",
  100: "#FFE5D0",
  200: "#F5CDB0",
  500: "#FB8C00",
  600: "#E64A19",
} as const;

export type OrangeStep = keyof typeof orange;

/** Blue scale */
export const blue = {
  50: "#F0F9FF",
  100: "#BBDEFB",
  500: "#3B82F6",
  800: "#1565C0",
} as const;

export type BlueStep = keyof typeof blue;

/** Indigo scale */
export const indigo = {
  50: "#E8EAF6",
  100: "#C5CAE9",
  500: "#5C6BC0",
  600: "#3949AB",
} as const;

export type IndigoStep = keyof typeof indigo;

/** Purple scale */
export const purple = {
  50: "#EDE7F6",
  100: "#D1C4E9",
  500: "#7E57C2",
  600: "#5E35B1",
} as const;

export type PurpleStep = keyof typeof purple;

/** Teal scale */
export const teal = {
  50: "#E0F2F1",
  100: "#B2DFDB",
  500: "#26A69A",
  800: "#00695C",
} as const;

export type TealStep = keyof typeof teal;

/** Pink scale */
export const pink = {
  50: "#FCE4EC",
  100: "#F8BBD0",
  500: "#EC407A",
  800: "#AD1457",
} as const;

export type PinkStep = keyof typeof pink;

/* Scales added by the phase 1 restyle, filled with today's equivalents so the
 * classic and phase 1 sets have the same shape. */

/** Success / low risk: today's green tints and text. */
export const signalGreen = {
  100: "#E6F4EA",
  300: "#C8E6D0",
  500: "#079455",
  700: "#138A5E",
} as const;

/** Brown, used by today's chart colours. */
export const cocoa = {
  50: "#EFEBE9",
  100: "#D7CCC8",
  500: "#A1887F",
  800: "#5D4037",
} as const;

/** Neutral signal: today's very-low teal stays in risk.veryLow; this is grey. */
export const neutral = {
  100: "#F3F4F6",
  300: "#D0D5DD",
  500: "#9CA3AF",
  700: "#475467",
} as const;

/** Today's chart colours, in today's order (see palette.chart). */
export const series = {
  indigo: "#7986CB",
  teal: "#4DB6AC",
  rose: "#E57373",
  moss: "#81C784",
  violet: "#9575CD",
  sky: "#5C8A7D",
  clay: "#FFB74D",
  sand: "#A1887F",
  plum: "#9575CD",
  other: "#9CA3AF",
} as const;

export const score = [
  "#DC2626", "#E65723", "#EE7B1D", "#F19416", "#EEA411", "#EAB308",
  "#C9B925", "#A4BD34", "#7EBA43", "#59B051", "#22A55A",
] as const;

/** Not used in the classic look; present so the shapes match. */
export const part = {
  record: { solid: "#208DAA", text: "#196F86", hover: "#F1F8FB", selected: "#DCEDF3", pressed: "#C8E2EB" },
  track: { solid: "#E09B26", text: "#85590F", hover: "#FDF7EC", selected: "#F9EBD3", pressed: "#F3DCB5" },
  enforce: { solid: "#1D8A4C", text: "#187340", hover: "#EFF8F2", selected: "#DBEFE2", pressed: "#C3E4CF" },
} as const;

/** Corner radius in px. Today everything is 4px. */
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  lgPlus: 10,
  xxl: 16,
  search: 4,
  tab: 4,
  pill: 999,
} as const;

export const colorScales = {
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
  signalGreen,
  cocoa,
  neutral,
} as const;

export default grey;
