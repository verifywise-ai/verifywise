/**
 * Color placeholders for email MJML and PDF templates.
 * Values come from the compiled shared palette (shared/design-tokens).
 * Templates may write {{colorBrandPrimary}}. Until they do, substitution
 * changes nothing.
 */
import { background, border, brand, risk, status, text } from "./design-tokens/palette";
import logger from "../utils/logger/fileLogger";

export const emailColorTokens = {
  // Email roles. Templates use these for page and button colors, so a change
  // to a general palette token (page background, status text) does not move a
  // button fill or label by accident. Change the mapping here, in one place.
  colorPageBackground: background.surface,
  colorButtonText: background.main,
  colorButtonPrimary: brand.primary,
  colorButtonSuccess: status.success.text,
  colorButtonError: status.error.text,
  colorButtonWarning: status.warning.text,
  colorButtonInfo: status.info.text,
  colorBrandPrimary: brand.primary,
  colorBrandPrimaryHover: brand.primaryHover,
  colorBrandPrimaryLight: brand.primaryLight,
  colorBrandPrimaryDark: brand.primaryDark,
  colorTextPrimary: text.primary,
  colorTextSecondary: text.secondary,
  colorTextTertiary: text.tertiary,
  colorTextAccent: text.accent,
  colorTextIcon: text.icon,
  colorTextDisabled: text.disabled,
  colorBackground: background.main,
  colorBackgroundAlt: background.alt,
  colorBackgroundHover: background.hover,
  colorBorderLight: border.light,
  colorBorderDark: border.dark,
  colorSuccessText: status.success.text,
  colorSuccessBg: status.success.bg,
  colorSuccessBorder: status.success.border,
  colorErrorText: status.error.text,
  colorErrorBg: status.error.bg,
  colorErrorBorder: status.error.border,
  colorWarningText: status.warning.text,
  colorWarningBg: status.warning.bg,
  colorWarningBorder: status.warning.border,
  colorInfoText: status.info.text,
  colorInfoBg: status.info.bg,
  colorInfoBorder: status.info.border,
  colorRiskCriticalBg: risk.critical.bg,
  colorRiskCriticalText: risk.critical.text,
  colorRiskHighBg: risk.high.bg,
  colorRiskHighText: risk.high.text,
  colorRiskMediumBg: risk.medium.bg,
  colorRiskMediumText: risk.medium.text,
  colorRiskLowBg: risk.low.bg,
  colorRiskLowText: risk.low.text,
  colorRiskVeryLowBg: risk.veryLow.bg,
  colorRiskVeryLowText: risk.veryLow.text,
} as const satisfies Record<string, string>;

const isColorToken = (key: string): key is keyof typeof emailColorTokens =>
  Object.prototype.hasOwnProperty.call(emailColorTokens, key);

const COLOR_PLACEHOLDER = /{{(color[A-Za-z0-9]+)}}/g;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** CSS variables for templates that should stay valid CSS. Names match pdf.css. */
export const emailCssVariables: Record<string, string> = {
  "--color-primary": emailColorTokens.colorBrandPrimary,
  "--color-background": emailColorTokens.colorBackground,
  "--color-success": emailColorTokens.colorSuccessText,
  "--color-error": emailColorTokens.colorErrorText,
  "--color-error-bg": emailColorTokens.colorErrorBg,
  "--color-warning": emailColorTokens.colorWarningText,
  "--color-warning-bg": emailColorTokens.colorWarningBg,
  "--color-risk-high": emailColorTokens.colorRiskHighText,
  "--color-risk-high-bg": emailColorTokens.colorRiskHighBg,
  "--color-risk-medium": emailColorTokens.colorRiskMediumText,
  "--color-risk-medium-bg": emailColorTokens.colorRiskMediumBg,
  "--color-risk-low": emailColorTokens.colorRiskLowText,
  "--color-risk-low-bg": emailColorTokens.colorRiskLowBg,
};

/** `:root` block inserted into a report stylesheet at render time. */
export function colorTokenRoot(primaryColor?: string): string {
  const variables = { ...emailCssVariables };
  const primary = primaryColor?.trim();
  if (primary && HEX_COLOR.test(primary)) {
    variables["--color-primary"] = primary;
  }
  const declarations = Object.entries(variables)
    .map(([name, value]) => `      ${name}: ${value};`)
    .join("\n");
  return `:root {\n${declarations}\n    }`;
}

const reportedUnknownTokens = new Set<string>();

/**
 * Replace {{color...}} placeholders. Any other placeholder is left in place.
 * An unknown color key is left in place too and logged once, so a typo in a
 * template shows up in the logs instead of shipping invalid CSS silently.
 */
export function applyColorTokens(source: string): string {
  return source.replace(COLOR_PLACEHOLDER, (placeholder, key: string) => {
    if (isColorToken(key)) return emailColorTokens[key];
    if (!reportedUnknownTokens.has(key)) {
      reportedUnknownTokens.add(key);
      logger.warn(`Unknown email color token {{${key}}} left in template`);
    }
    return placeholder;
  });
}
