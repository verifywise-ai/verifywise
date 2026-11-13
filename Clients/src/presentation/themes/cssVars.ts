/**
 * Publishes the active token set (phase 1 or classic, see ./uiStyle.ts) as CSS
 * custom properties on :root, so plain .css files can follow the switch:
 *   color: var(--vw-text-primary, #1c2130);
 * Keep the hex fallback in CSS for the first paint before this runs.
 */
import { background, border, brand, radiusPx, status, text } from "./palette";

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
};

export function applyTokenCssVars(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(CSS_TOKEN_VARS)) {
    root.style.setProperty(name, value);
  }
}
