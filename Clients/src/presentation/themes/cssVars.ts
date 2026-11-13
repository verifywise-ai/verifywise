/**
 * Publishes the active token set (phase 1 or classic, see ./uiStyle.ts) as CSS
 * custom properties on :root, so plain .css files can follow the switch:
 *   color: var(--vw-text-primary, #1c2130);
 * Keep the hex fallback in CSS for the first paint before this runs.
 */
import { background, border, brand, radiusPx, status, text } from "./palette";
import { getUiStyle, isClassicUi } from "./uiStyle";

const classicUi = isClassicUi();

export const CSS_TOKEN_VARS: Record<string, string> = {
  "--vw-brand-primary": brand.primary,
  "--vw-brand-primary-hover": brand.primaryHover,
  "--vw-text-primary": text.primary,
  "--vw-text-secondary": text.secondary,
  "--vw-text-tertiary": text.tertiary,
  "--vw-text-accent": text.accent,
  "--vw-background-main": background.main,
  "--vw-background-alt": background.alt,
  "--vw-background-hover": background.hover,
  "--vw-background-fill": background.fill,
  "--vw-border-light": border.light,
  "--vw-border-dark": border.dark,
  "--vw-status-info-text": status.info.text,
  "--vw-radius-sm": radiusPx.sm,
  // Table header (style guide §7: 11px / 500 uppercase, 0.07em, 9px 14px).
  "--vw-table-head-size": classicUi ? "13px" : "11px",
  "--vw-table-head-weight": classicUi ? "400" : "500",
  "--vw-table-head-padding": classicUi ? "12px 10px" : "9px 14px",
  "--vw-table-head-tracking": classicUi ? "normal" : "0.07em",
};

export function applyTokenCssVars(root: HTMLElement = document.documentElement): void {
  // Lets CSS scope rules to one look: :root[data-ui-style="phase1"] ...
  root.dataset.uiStyle = getUiStyle();
  for (const [name, value] of Object.entries(CSS_TOKEN_VARS)) {
    root.style.setProperty(name, value);
  }
}
