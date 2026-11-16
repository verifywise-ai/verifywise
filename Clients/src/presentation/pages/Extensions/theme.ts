import { palette as vwPalette, radiusPx } from "../../themes/palette";
/**
 * Style tokens for the MLflow and Azure AI Foundry tabs.
 *
 * Every value comes from the app-wide tokens in `themes/palette.ts`. This file
 * exists only because those tabs use static sx objects that can't
 * `useTheme()`. Do not add colours or sizes here that are not tokens; buttons
 * and modals use the house components (CustomizableButton, StandardModal).
 */

export const colors = {
  // Status — matches themes/palette.ts status.*
  success: vwPalette.status.success.text,
  successLight: vwPalette.status.success.bg,
  warning: vwPalette.status.warning.text,
  warningLight: vwPalette.risk.medium.bg,
  error: vwPalette.status.error.text,
  errorLight: vwPalette.status.error.border,
  info: vwPalette.status.info.text,
  infoLight: vwPalette.status.info.bg,

  // Text — matches themes/palette.ts text.*
  textPrimary: vwPalette.text.primary,
  textSecondary: vwPalette.text.secondary,
  textTertiary: vwPalette.text.icon,

  // Backgrounds — matches themes/palette.ts background.*
  background: vwPalette.background.main,
  backgroundSecondary: vwPalette.background.alt,
  backgroundHover: vwPalette.background.hover,

  // Borders — matches themes/palette.ts border.light
  border: vwPalette.border.light,
};

export const typography = {
  sizes: {
    sm: "12px",
    md: "13px",
  },
  weights: {
    medium: 500,
    semibold: 600,
  },
};

export const borderRadius = {
  sm: radiusPx.sm,
  md: radiusPx.sm,
};

export const cardStyles = {
  base: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    border: `1px solid ${colors.border}`,
    padding: "16px",
  },
};

export const tableStyles = {
  header: {
    backgroundColor: colors.backgroundSecondary,
    fontWeight: typography.weights.semibold,
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    // House does not uppercase table headers — matches themes/tables.ts.
    padding: "12px 16px",
  },
  cell: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    padding: "12px 16px",
    borderBottom: `1px solid ${colors.border}`,
  },
  row: {
    "&:hover": { backgroundColor: colors.backgroundHover },
  },
};

export const chipStyles = {
  base: {
    borderRadius: borderRadius.sm,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    padding: "2px 8px",
    display: "inline-flex",
    alignItems: "center",
  },
  success: { backgroundColor: colors.successLight, color: colors.success },
  warning: { backgroundColor: colors.warningLight, color: colors.warning },
  error: { backgroundColor: colors.errorLight, color: colors.error },
  info: { backgroundColor: colors.infoLight, color: colors.info },
  neutral: { backgroundColor: vwPalette.status.default.bg, color: vwPalette.text.tertiary },
};
