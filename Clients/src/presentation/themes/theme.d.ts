// ---------------------------------------------------------------------------
// MUI module augmentation — custom palette & theme properties
//
// MUI v7 declares interfaces in internal submodules (createPalette,
// createThemeNoVars) which are re-exported from @mui/material/styles.
// We augment BOTH the re-exporting module and the internal declaring modules
// so the types merge correctly regardless of which path TypeScript resolves.
// ---------------------------------------------------------------------------

import "@mui/material/styles";

// Status palette helpers
interface _StatusColor {
  text?: string;
  main?: string;
  light?: string;
  dark?: string;
  bg?: string;
  border?: string;
}

interface _StatusPalette {
  info: _StatusColor;
  success: _StatusColor;
  error: _StatusColor;
  warning: _StatusColor;
}

interface _StatusPaletteOptions {
  info?: _StatusColor;
  success?: _StatusColor;
  error?: _StatusColor;
  warning?: _StatusColor;
}

// Shared shape for the palette augmentations
interface _CustomTypeBackground {
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

interface _CustomTypeText {
  tertiary: string;
  accent: string;
  black: string;
  icon: string;
  muted: string;
  subdued: string;
}

interface _CustomPaletteExtras {
  border: { light: string; dark: string };
  status: _StatusPalette;
  brand: {
    primary: string;
    primaryHover: string;
    primaryLight: string;
    primaryDark: string;
  };
  other: { icon: string; line: string; fill: string; grid: string };
}

interface _CustomPaletteColorExtras {
  text?: string;
  bg?: string;
  border?: string;
}

interface _UnresolvedColorOptions {
  main?: string;
  light?: string;
  dark?: string;
  bg?: string;
  contrastText?: string;
}

// ---------------------------------------------------------------------------
// Augment @mui/material/styles (the public re-exporting module)
// ---------------------------------------------------------------------------
declare module "@mui/material/styles" {
  interface TypeBackground extends _CustomTypeBackground {}
  interface TypeText extends _CustomTypeText {}
  interface Palette extends _CustomPaletteExtras {
    unresolved: PaletteColor;
  }
  interface PaletteOptions {
    border?: { light: string; dark: string };
    status?: _StatusPaletteOptions;
    brand?: {
      primary?: string;
      primaryHover?: string;
      primaryLight?: string;
      primaryDark?: string;
    };
    other?: { icon?: string; line?: string; fill?: string; grid?: string };
    unresolved?: _UnresolvedColorOptions;
  }
  interface PaletteColor extends _CustomPaletteColorExtras {}
  interface SimplePaletteColorOptions extends _CustomPaletteColorExtras {}
  interface Theme {
    boxShadow: string;
  }
  interface ThemeOptions {
    boxShadow?: string;
  }
}

// ---------------------------------------------------------------------------
// Augment the internal declaring modules (where interfaces are originally
// defined). With bundler resolution these resolve to the ESM paths.
// ---------------------------------------------------------------------------
declare module "@mui/material/styles/createPalette" {
  interface TypeBackground extends _CustomTypeBackground {}
  interface TypeText extends _CustomTypeText {}
  interface Palette extends _CustomPaletteExtras {
    unresolved: PaletteColor;
  }
  interface PaletteOptions {
    border?: { light: string; dark: string };
    status?: _StatusPaletteOptions;
    brand?: {
      primary?: string;
      primaryHover?: string;
      primaryLight?: string;
      primaryDark?: string;
    };
    other?: { icon?: string; line?: string; fill?: string; grid?: string };
    unresolved?: _UnresolvedColorOptions;
  }
  interface PaletteColor extends _CustomPaletteColorExtras {}
  interface SimplePaletteColorOptions extends _CustomPaletteColorExtras {}
}
