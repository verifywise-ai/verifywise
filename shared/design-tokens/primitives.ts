/**
 * PHASE 1 RESTYLE: drop-in replacement for shared/design-tokens/primitives.ts
 *
 * Every scale and step the product already uses is kept, so no import breaks.
 * Only the hex values change. New scales are added at the bottom.
 * Values come from brand-core v2.6 ("The four palettes") and the UI Proposal
 * (https://claude.ai/artifact/Wc5fkAqRW7L1q423kBsBzY).
 *
 * The four palettes, one job each:
 *   1. Brand green (green.*)                    brand, primary buttons, selected states
 *   2. Signal (red, orange, amber, signalGreen) risk tiers and status only, always with a label
 *   3. Chart (series.*)                        chart series; tints in indigo, pink, teal, cocoa, blue, purple for badges
 *   4. Part (part.*)                            ON HOLD until the new sidebar (phase 2)
 */

/** Neutral greys, slightly green-tinted to sit with the brand. 50 = white, 900 = ink. */
export const grey = {
  50: "#FFFFFF", // panel, cards
  100: "#FAFAFA", // page background
  150: "#F3F6F5", // raised: table header, hover, tab background
  200: "#E4E6E6", // hairline borders
  300: "#D1D5D5", // stronger borders, inputs
  350: "#A3AFAC", // disabled text
  400: "#8A9894", // subdued text
  450: "#6B7C78", // icons
  500: "#5C6D69",
  600: "#495A56", // secondary text ("mid")
  700: "#33453F",
  800: "#24362F",
  900: "#1A2E2B", // primary text ("ink")
  950: "#000000",
} as const;

export type GreyStep = keyof typeof grey;

/** Brand green. 700 = Primary Green #14715B. Brand and UI states only, never a risk tier. */
export const green = {
  50: "#EFFAF6", // hover on selectable rows and sidebar items
  100: "#D9F2E9", // selected
  200: "#B7E3D4", // pressed
  300: "#8BCEB8",
  400: "#59B298",
  500: "#3C9E84",
  600: "#2A886F",
  700: "#14715B", // Primary Green
  800: "#075443", // hover on primary
  900: "#08392D",
} as const;

export type GreenStep = keyof typeof green;

/** Signal red: Critical, errors. 50/200 tints, 500 mark, 700 text on a tint. */
export const red = {
  50: "#FEF5F5",
  200: "#FDE2E2",
  300: "#F5B5B5",
  500: "#DC2626",
  700: "#B91C1C",
} as const;

export type RedStep = keyof typeof red;

/** Signal yellow mark (Medium). Kept for existing imports. */
export const yellow = {
  600: "#EAB308",
} as const;

export type YellowStep = keyof typeof yellow;

/** Signal yellow: Medium, caution. Text is dark olive so it reads on the tint. */
export const amber = {
  100: "#FCF3C4",
  200: "#F2DE84",
  500: "#EAB308",
  600: "#725A00",
  700: "#725A00",
} as const;

export type AmberStep = keyof typeof amber;

/** Signal orange: High, warnings. */
export const orange = {
  50: "#FEF6EC",
  100: "#FDEBD5",
  200: "#F8C98F",
  500: "#F28C18",
  600: "#9A4D05",
} as const;

export type OrangeStep = keyof typeof orange;

/** Info messages and badge tints. Sky (series 8) is series.sky. */
export const blue = {
  50: "#E3F2FC",
  100: "#BFE0F5",
  500: "#8CC8EE",
  800: "#2D6F99",
} as const;

export type BlueStep = keyof typeof blue;

/** Badge tints. Indigo (series 1) is series.indigo. */
export const indigo = {
  50: "#E4E7FA",
  100: "#C3CAF2",
  500: "#4A5BD4",
  600: "#3A49B8",
} as const;

export type IndigoStep = keyof typeof indigo;

/** Badge tints. Violet (series 6) is series.violet. */
export const purple = {
  50: "#ECE4F8",
  100: "#D3C3EF",
  500: "#7A4FC4",
  600: "#5F3AA3",
} as const;

export type PurpleStep = keyof typeof purple;

/** Badge tints. Teal (series 4) is series.teal. */
export const teal = {
  50: "#D8EFEE",
  100: "#A9DCDA",
  500: "#148A87",
  800: "#0E6A68",
} as const;

export type TealStep = keyof typeof teal;

/** Badge tints. Rose (series 2) is series.rose. */
export const pink = {
  50: "#FBE5EE",
  100: "#F3BFD4",
  500: "#E07BA5",
  800: "#A83F6C",
} as const;

export type PinkStep = keyof typeof pink;

/* ------------------------------------------------------------------ */
/* NEW SCALES                                                          */
/* ------------------------------------------------------------------ */

/** Signal green: Low risk, success, passed. Not the brand green. */
export const signalGreen = {
  100: "#DCF2E4",
  300: "#A6DDB9",
  500: "#22A55A",
  700: "#17703B",
} as const;

/** Badge tints (accent.cocoa). Not a chart series. */
export const cocoa = {
  50: "#F1E6DD",
  100: "#DDC6B4",
  500: "#8A5A3B",
  800: "#6E4529",
} as const;

/** Neutral signal: "no signal", Very low, Other in charts. */
export const neutral = {
  100: "#EEF1F0",
  300: "#C9D1CF",
  500: "#BFC9C7",
  700: "#495A56",
} as const;

/**
 * Chart series: 9 hues plus Other, all at one lightness and colour strength
 * (OKLCH L 0.58, C 0.115), so no series looks heavier than another.
 * Each meets about 4.3:1 contrast on white, enough for thin lines and small dots.
 * Avoids the risk hues: rose, clay, sand and moss stand in for red, orange, yellow and green.
 */
export const series = {
  indigo: "#6076BE",
  teal: "#008B91",
  rose: "#AE5B7E",
  moss: "#6B8632",
  violet: "#8A67B1",
  sky: "#2A82B7",
  clay: "#B36043",
  sand: "#90790F",
  plum: "#A0609B",
  other: "#A0A6A4",
} as const;

/**
 * Score spectrum, 0 (red) to 100 (green) in steps of 10.
 * For score bars and gauges only, e.g. a Trust Index score of 64 uses score[6].
 */
export const score = [
  "#DC2626",
  "#E65723",
  "#EE7B1D",
  "#F19416",
  "#EEA411",
  "#EAB308",
  "#C9B925",
  "#A4BD34",
  "#7EBA43",
  "#59B051",
  "#22A55A",
] as const;

/**
 * PART COLOURS: ON HOLD. Do not use in phase 1.
 * Record, Track and Enforce wayfinding for the new sidebar (phase 2):
 * section headings, hover / selected / pressed states and module icons.
 * Never a chart mark, pill or risk tier.
 */
export const part = {
  record: {
    solid: "#208DAA",
    text: "#196F86",
    hover: "#F1F8FB",
    selected: "#DCEDF3",
    pressed: "#C8E2EB",
  },
  track: {
    solid: "#E09B26",
    text: "#85590F",
    hover: "#FDF7EC",
    selected: "#F9EBD3",
    pressed: "#F3DCB5",
  },
  enforce: {
    solid: "#1D8A4C",
    text: "#187340",
    hover: "#EFF8F2",
    selected: "#DBEFE2",
    pressed: "#C3E4CF",
  },
} as const;

/** Corner radius in px. Keep exactly these: the slight roundness of the UI Proposal. */
export const radius = {
  sm: 2, // buttons, cards, inputs, menus, modals, table wrappers, segmented controls
  search: 8, // the search field above a table
  tab: 9, // top corners of a tab in the tab bar (bottom corners square)
  pill: 999, // pills, filter chips, link chips
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
