/**
 * VerifyWise Typography Tokens
 *
 * Single source of truth for font families, sizes, weights, line heights,
 * and semantic text styles across every module.
 *
 * Structure mirrors palette.ts:
 *   1. Primitives — raw allowed values (fontFamily, fontSize, fontWeight, lineHeight)
 *   2. Semantic   — role-based text styles composed from primitives
 *
 * Allowed sizes only: 11, 12, 13, 14, 16, 18, 24
 * Source of rules: CodeRules/09-design-system/typography.md
 *
 * Usage:
 *   import { fontSize, textStyles, typography } from '@/presentation/themes/typography';
 *   <Typography sx={textStyles.pageTitle} />
 *   <Typography sx={{ fontSize: fontSize.base, fontWeight: fontWeight.regular }} />
 */

// ---------------------------------------------------------------------------
// 1. Primitives — raw type scale
// ---------------------------------------------------------------------------

export const fontFamily = {
  sans: "'Geist', system-ui, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif",
  mono: "'Fira Code', 'Consolas', monospace",
} as const;

/** Allowed font sizes in px. Do not invent sizes outside this scale. */
export const fontSize = {
  "caption": 11,
  "sm": 12,
  "base": 13,
  "md": 14,
  "lg": 16,
  "xl": 18,
  "2xl": 24,
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeight = {
  tight: 1.2,
  snug: 1.3,
  normal: 1.4,
  relaxed: 1.5,
  loose: 1.75,
} as const;

export type FontSizeToken = keyof typeof fontSize;
export type FontWeightToken = keyof typeof fontWeight;
export type LineHeightToken = keyof typeof lineHeight;

// ---------------------------------------------------------------------------
// 2. Semantic text styles — role-based composites
//
// Quick pick (common surfaces):
//   Page H1              → pageTitle
//   In-page section      → sectionTitle
//   Card / modal / drawer title → cardTitle
//   Modal description    → body (13), not bodySmall
//   Sidebar / tab label  → body (prefer shared Sidebar / TabBar)
//   Form label / error   → formLabel / error
// ---------------------------------------------------------------------------

export const textStyles = {
  // Headings
  /** Main page heading (e.g. Dashboard, Settings). 24 / 600 */
  pageTitle: {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.snug,
  },
  /** In-page section heading below the page title. 18 / 600 */
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.normal,
  },
  /** Card, panel, modal, or drawer title. 16 / 600 */
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.normal,
  },
  /** Nested heading under a section or card. 14 / 600 */
  subsectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.relaxed,
  },

  // Body
  /** Emphasized body / intro copy. 14 / 400 */
  bodyLarge: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.relaxed,
  },
  /**
   * Default UI text: paragraphs, modal description, sidebar/tab labels.
   * Prefer this over bodySmall for main readable content. 13 / 400
   */
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.relaxed,
  },
  /** Secondary information; quieter than body. Not for modal descriptions. 12 / 400 */
  bodySmall: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.relaxed,
  },
  /** Hints, timestamps, footnotes, helper text under fields. 11 / 400 */
  caption: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.normal,
  },

  // UI
  /** Button label text (sentence case). 13 / 500 */
  button: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.tight,
  },
  /** Label above an input field. 13 / 500 */
  formLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.relaxed,
  },
  /** Text inside text fields and selects. 13 / 400 */
  input: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.relaxed,
  },
  /** Validation / error message below an input. 11 / 400 */
  error: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.normal,
  },
  /** Table column header (often uppercase in UI). 12 / 500 */
  tableHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.relaxed,
  },
  /** Standard table cell text. 13 / 400 */
  tableCell: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.relaxed,
  },
  /** Chip / badge / tag label. 12 / 500 */
  badge: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.tight,
  },
  /** Tooltip content. 13 / 400 */
  tooltip: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.normal,
  },
} as const;

export type TextStyleToken = keyof typeof textStyles;

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  textStyles,
} as const;

export default typography;
