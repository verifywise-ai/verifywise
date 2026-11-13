/**
 * Central export for all theme-related utilities
 * Import from this file to access standardized styles across the application
 */

export { default as light } from "./light";
export { default as singleTheme } from "./v1SingleTheme";

export { alertStyles } from "./alerts";
export { tableStyles } from "./tables";
export { palette, default as colorPalette } from "./palette";
export { getUiStyle, isClassicUi, setUiStyle } from "./uiStyle";
export type { UiStyle } from "./uiStyle";

import { primitives } from "./palette";
// Raw scales for the active look (phase 1 or classic, see ./uiStyle.ts).
export const {
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
  yellow,
  signalGreen,
  cocoa,
  neutral,
  series,
} = primitives;
export const grayScale = primitives.grey;
export {
  typography,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  textStyles,
  default as typographyTokens,
} from "./typography";

export * from "./mixins";
export * from "./components";

// Re-export theme types for convenience
export type { Theme } from "@mui/material/styles";
export type { SxProps } from "@mui/material";
