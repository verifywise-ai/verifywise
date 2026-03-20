/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  Palette,
  PaletteOptions,
  TypeBackground,
  TypeText,
  PaletteColor,
  PaletteColorOptions,
  Shape,
  ShapeOptions,
} from "@mui/material/styles";
/* eslint-enable @typescript-eslint/no-unused-vars */

declare module "@mui/material/styles" {
  interface Palette {
    border: {
      light: string;
      dark: string;
    };
    background: TypeBackground;
    text: TypeText;
    status: StatusPalette;
    brand: {
      primary: string;
      primaryHover: string;
      primaryLight: string;
      primaryDark: string;
    };
    other: {
      icon: string;
      line: string;
      fill: string;
      grid: string;
    };
    unresolved: PaletteColor;
  }
  interface PaletteOptions {
    border?: {
      light: string;
      dark: string;
    };
    background?: TypeBackground;
    text?: TypeText;
    status?: StatusPaletteOptions;
    brand?: {
      primary?: string;
      primaryHover?: string;
      primaryLight?: string;
      primaryDark?: string;
    };
    other?: {
      icon?: string;
      line?: string;
      fill?: string;
      grid?: string;
    };
    unresolved?: PaletteColorOptions;
  }
  interface TypeBackground {
    main: string;
    alt: string;
    modal: string;
    fill: string;
    accent: string;
    surface: string;
    hover: string;
    selected: string;
    gradientStop: string;
  }
  interface TypeText {
    primary: string;
    secondary: string;
    tertiary: string;
    accent: string;
    black: string;
    icon: string;
    muted: string;
    subdued: string;
  }
  interface PaletteColor {
    text?: string;
    main?: string;
    light?: string;
    dark?: string;
    bg?: string;
    border?: string;
  }
  interface PaletteColorOptions {
    text?: string;
    main?: string;
    light?: string;
    dark?: string;
    bg?: string;
    border?: string;
  }
  interface StatusPalette {
    info: PaletteColor;
    success: PaletteColor;
    error: PaletteColor;
    warning: PaletteColor;
  }
  interface StatusPaletteOptions {
    info?: PaletteColorOptions;
    success?: PaletteColorOptions;
    error?: PaletteColorOptions;
    warning?: PaletteColorOptions;
  }
  interface Shape {
    borderRadius: number | string;
  }
  interface ShapeOptions {
    borderRadius?: number | string;
  }
  interface Shadows {
    boxShadow: string;
  }
  interface ThemeOptions {
    boxShadow?: string;
  }
  interface Theme {
    boxShadow: string;
  }
}
