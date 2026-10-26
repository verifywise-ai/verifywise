/**
 * Color placeholders for email MJML and PDF templates.
 * Values come from the compiled shared palette (shared/design-tokens).
 * Templates may write {{colorBrandPrimary}}. Until they do, substitution
 * changes nothing.
 */
import { background, border, brand, risk, status, text } from "./design-tokens/palette";

export const emailColorTokens: Record<string, string> = {
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
};

const COLOR_PLACEHOLDER = /{{(color[A-Za-z0-9]+)}}/g;

/** Replace {{color...}} placeholders. Any other placeholder is left in place. */
export function applyColorTokens(source: string): string {
  return source.replace(COLOR_PLACEHOLDER, (placeholder, key: string) => {
    return emailColorTokens[key] ?? placeholder;
  });
}
