/**
 * Style tokens for the Extensions folder.
 *
 * Values here MUST stay aligned with the app-wide theme in
 * `Clients/src/presentation/themes/{palette,v1SingleTheme}.ts`. This file
 * exists only because many extension components were built with static sx
 * objects that can't `useTheme()`. Do not introduce new colors here — pull
 * from `themes/palette.ts` and mirror the value.
 */

export const colors = {
  // Primary — matches themes/palette.ts brand.primary
  primary: "#13715B",
  primaryHover: "#0F5A47",
  primaryLight: "rgba(19, 113, 91, 0.08)",

  // Secondary neutral — matches v1SingleTheme colors.secondary
  secondary: "#6B7280",
  secondaryHover: "#4B5563",

  // Status: success — matches themes/palette.ts status.success
  success: "#079455",
  successHover: "#047857",
  successLight: "#E6F4EA",

  // Status: warning — matches themes/palette.ts status.warning
  warning: "#B45309",
  warningHover: "#92400E",
  warningLight: "#FFF8E1",

  // Status: error — matches themes/palette.ts status.error
  error: "#D32F2F",
  errorHover: "#B91C1C",
  errorLight: "#FFD6D6",

  // Status: info — matches themes/palette.ts status.info
  info: "#1565C0",
  infoHover: "#0D47A1",
  infoLight: "#E3F2FD",

  // Text — matches themes/palette.ts text.*
  textPrimary: "#1c2130",
  textSecondary: "#344054",
  textTertiary: "#667085",
  textDisabled: "#9CA3AF",

  // Backgrounds — matches themes/palette.ts background.*
  background: "#ffffff",
  backgroundSecondary: "#f9fafb",
  backgroundHover: "#f5f5f5",

  // Borders — matches themes/palette.ts border.light/dark
  border: "#eaecf0",
  borderLight: "#eaecf0",

  white: "#ffffff",
  disabled: "#E5E7EB",
};

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  sizes: {
    xs: "11px",
    sm: "12px",
    md: "13px",
    lg: "14px",
    xl: "16px",
    xxl: "18px",
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
};

// House standard is 4px everywhere per Clients/CLAUDE.md. All three sizes
// resolve to the same value so existing call sites that reference `md` or
// `lg` don't visually regress.
export const borderRadius = {
  sm: "4px",
  md: "4px",
  lg: "4px",
  full: "9999px",
};

export const shadows = {
  none: "none",
  sm: "0px 1px 2px rgba(16, 24, 40, 0.05)",
  md: "0px 4px 8px -2px rgba(16, 24, 40, 0.1), 0px 2px 4px -2px rgba(16, 24, 40, 0.06)",
  lg: "0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)",
};

export const buttonStyles = {
  base: {
    borderRadius: borderRadius.sm,
    fontWeight: typography.weights.medium,
    fontSize: typography.sizes.md,
    textTransform: "none" as const,
    boxShadow: shadows.none,
    transition: "all 0.2s ease",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  sizes: {
    small: { height: "28px", padding: "6px 12px", fontSize: typography.sizes.sm },
    medium: { height: "30px", padding: "8px 16px", fontSize: typography.sizes.md },
    large: { height: "40px", padding: "10px 20px", fontSize: typography.sizes.lg },
  },
  primary: {
    contained: {
      "backgroundColor": colors.primary,
      "color": colors.white,
      "border": "none",
      "&:hover": { backgroundColor: colors.primaryHover },
      "&:disabled": {
        backgroundColor: colors.disabled,
        color: colors.textDisabled,
        cursor: "not-allowed",
      },
    },
    outlined: {
      "backgroundColor": "transparent",
      "color": colors.primary,
      "border": `1px solid ${colors.primary}`,
      "&:hover": { backgroundColor: colors.primaryLight, borderColor: colors.primaryHover },
      "&:disabled": {
        borderColor: colors.disabled,
        color: colors.textDisabled,
        cursor: "not-allowed",
      },
    },
    text: {
      "backgroundColor": "transparent",
      "color": colors.primary,
      "border": "none",
      "&:hover": { backgroundColor: colors.primaryLight },
      "&:disabled": { color: colors.textDisabled, cursor: "not-allowed" },
    },
  },
  secondary: {
    contained: {
      "backgroundColor": colors.secondary,
      "color": colors.white,
      "border": "none",
      "&:hover": { backgroundColor: colors.secondaryHover },
    },
    outlined: {
      "backgroundColor": "transparent",
      "color": colors.secondary,
      "border": `1px solid ${colors.border}`,
      "&:hover": { backgroundColor: colors.backgroundHover, borderColor: colors.secondary },
    },
  },
  error: {
    contained: {
      "backgroundColor": colors.error,
      "color": colors.white,
      "border": "none",
      "&:hover": { backgroundColor: colors.errorHover },
    },
    outlined: {
      "backgroundColor": "transparent",
      "color": colors.error,
      "border": `1px solid ${colors.error}`,
      "&:hover": { backgroundColor: colors.errorLight, borderColor: colors.errorHover },
    },
  },
};

export const cardStyles = {
  base: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    border: `1px solid ${colors.border}`,
    padding: spacing.lg,
  },
  elevated: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    boxShadow: shadows.lg,
    padding: spacing.lg,
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
    borderBottom: `1px solid ${colors.borderLight}`,
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
  neutral: { backgroundColor: "rgba(107, 114, 128, 0.1)", color: "#4b5563" },
};

export const modalStyles = {
  overlay: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 1300,
  },
  content: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    boxShadow: shadows.lg,
    maxWidth: "600px",
    width: "90%",
    maxHeight: "90vh",
    overflow: "auto",
  },
  header: {
    padding: spacing.lg,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  body: {
    padding: spacing.lg,
  },
  footer: {
    padding: spacing.lg,
    borderTop: `1px solid ${colors.borderLight}`,
    display: "flex",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    margin: 0,
  },
};
