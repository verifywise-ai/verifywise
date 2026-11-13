/**
 * Which look the app renders: the phase 1 restyle (default) or the classic
 * look it replaces. The classic look stays selectable until the January 2027
 * cutover; after that, delete this file, `shared/design-tokens/classic/` and
 * every `isClassicUi()` branch.
 *
 * The choice is read once, when this module loads, because tokens are plain
 * module-level constants used across hundreds of files. Changing it saves the
 * preference and reloads the page.
 */
export type UiStyle = "phase1" | "classic";

export const UI_STYLE_STORAGE_KEY = "vw-ui-style";

function readStoredUiStyle(): UiStyle {
  try {
    return window.localStorage.getItem(UI_STYLE_STORAGE_KEY) === "classic" ? "classic" : "phase1";
  } catch {
    // Storage blocked (private mode, disabled site data): use the default.
    return "phase1";
  }
}

const activeUiStyle: UiStyle = typeof window === "undefined" ? "phase1" : readStoredUiStyle();

export function getUiStyle(): UiStyle {
  return activeUiStyle;
}

export function isClassicUi(): boolean {
  return activeUiStyle === "classic";
}

/** Save the preference and reload so every token picks up the new set. */
export function setUiStyle(style: UiStyle): void {
  if (style === activeUiStyle) return;
  try {
    window.localStorage.setItem(UI_STYLE_STORAGE_KEY, style);
  } catch {
    // Without storage the choice cannot survive the reload; do nothing.
    return;
  }
  window.location.reload();
}
