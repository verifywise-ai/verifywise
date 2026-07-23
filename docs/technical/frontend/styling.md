# Frontend Styling

## Overview

VerifyWise uses Material-UI (MUI) v7 with Emotion for CSS-in-JS styling. The design system is built around a centralized theme with design tokens, reusable mixins, and component style exports. All styling flows from the theme configuration in `Clients/src/presentation/themes/`.

## Theme Architecture

```
Clients/src/presentation/
├── themes/
│   ├── light.ts          # Main theme & MUI overrides
│   ├── components.ts     # Component style exports
│   ├── mixins.ts         # Reusable style functions
│   ├── alerts.ts         # Alert color definitions
│   ├── tables.ts         # Table styling standards
│   └── v1SingleTheme.ts  # Design constants
├── styles/
│   └── colors.ts         # Dashboard color palette
├── App.css               # Global styles
└── index.css             # Font imports
```

## Color Palette

### Primary Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | `#13715B` | Brand color, buttons, links |
| Primary Dark | `#0f604d` | Hover states |
| Secondary | `#F4F4F4` | Light backgrounds |
| Secondary Dark | `#e3e3e3` | Secondary hover |

### Text Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | `#1c2130` | Headings, main text |
| Secondary | `#344054` | Body text, labels |
| Tertiary | `#475467` | Helper text |
| Accent | `#838c99` | Muted text |

### Background Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Main | `#FFFFFF` | Page background |
| Alt | `#FCFCFD` | Cards, modals |
| Fill | `#F4F4F4` | Hover states, fills |
| Accent | `#f9fafb` | Table headers |

### Border Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Light | `#eaecf0` | Subtle borders |
| Dark | `#d0d5dd` | Default borders |

### Status Colors

```typescript
// Success
text: "#079455"
main: "#17b26a"
light: "#d4f4e1"
bg: "#ecfdf3"

// Error
text: "#f04438"
main: "#d32f2f"
light: "#fbd1d1"
bg: "#f9eced"

// Warning
text: "#DC6803"
main: "#fdb022"
light: "#ffecbc"
bg: "#fffcf5"

// Info
text: primary
main: tertiary
bg: main background
```

### Dashboard Colors

Located in `Clients/src/presentation/styles/colors.ts`:

```typescript
// Severity levels
critical: "#DC2626"
high: "#EF4444"
medium: "#F59E0B"
low: "#10B981"
veryLow: "#22C55E"

// Framework status
implemented: "#13715B"
awaitingReview: "#3B82F6"
awaitingApproval: "#8B5CF6"
needsRework: "#EA580C"
notStarted: "#9CA3AF"

// UI utilities
icon: "#667085"
line: "#d6d9dd"
grid: "#a2a3a3"
```

## Typography

### Font Stack

```css
font-family: "Geist", "Inter", system-ui, -apple-system,
             BlinkMacSystemFont, Helvetica, Arial, sans-serif;
```

### Font Sizes

| Size | Value | Usage |
|------|-------|-------|
| Base | 13px | Default text |
| Small | 11px | Labels, captions |
| Medium | 13px | Body text |
| Large | 16px | Headings |
| XLarge | 24px | Page titles |

### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Normal | 400 | Body text |
| Medium | 500 | Labels |
| Semibold | 600 | Headings |
| Bold | 700 | Emphasis |

### Text Styles (from colors.ts)

```typescript
label: { fontSize: 11, color: textSecondary }
value: { fontSize: 13, fontWeight: 600, color: textPrimary }
valueSmall: { fontSize: 14, fontWeight: 600, color: textPrimary }
legendItem: { fontSize: 13, color: textSecondary }
percentage: { fontSize: 24, fontWeight: 700, color: textSecondary }
```

## Spacing System

MUI spacing with base unit of 2px:

```typescript
theme.spacing(1)  // 2px
theme.spacing(2)  // 4px
theme.spacing(4)  // 8px
theme.spacing(5)  // 10px
theme.spacing(8)  // 16px
theme.spacing(10) // 20px
theme.spacing(12) // 24px
```

## Component Sizes

### Buttons

| Size | Height | Font Size |
|------|--------|-----------|
| Small | 28px | 12px |
| Medium | 34px | 13px |
| Large | 40px | 14px |

### Inputs

| Size | Height |
|------|--------|
| Small | 32px |
| Medium | 40px |
| Large | 48px |

### Card Padding

| Size | Padding |
|------|---------|
| Small | 12px |
| Medium | 16px |
| Large | 24px |

## Border Radius

```typescript
// Theme default
theme.shape.borderRadius // 2 (used as multiplier)

// Common values
2px  // Inputs, small elements
4px  // Buttons, cards, modals
10px // Scrollbar, pills
```

## Box Shadow

```typescript
// Primary shadow (cards, modals, papers)
"0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)"
```

## Styling Approaches

### 1. sx Prop (Primary Method)

```tsx
// Direct theme usage
<Box
  sx={{
    backgroundColor: theme.palette.background.main,
    border: `1px solid ${theme.palette.border.dark}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(2),
  }}
/>
```

### 2. Theme Mixins

Reusable style functions from `themes/mixins.ts`:

```tsx
import { buttonMixins, cardMixins, layoutMixins } from "@/presentation/themes/mixins";

// Button styles
<Button sx={buttonMixins.primary()} />
<Button sx={buttonMixins.secondary()} />
<Button sx={buttonMixins.outlined()} />

// Card styles
<Card sx={cardMixins.base()} />
<Card sx={cardMixins.stats()} />
<Card sx={cardMixins.interactive()} />

// Layout styles
<Box sx={layoutMixins.flexCenter()} />
<Box sx={layoutMixins.flexBetween()} />
<Box sx={layoutMixins.container()} />

// Typography styles
<Typography sx={typographyMixins.pageTitle()} />
<Typography sx={typographyMixins.cardDescription()} />

// Status styles
<Chip sx={statusMixins.success()} />
<Chip sx={statusMixins.error()} />
<Chip sx={statusMixins.warning()} />
```

### 3. Component Style Exports

Pre-built style objects from `themes/components.ts`:

```tsx
import { buttonStyles, modalStyles, tableStyles, formStyles } from "@/presentation/themes/components";

// Button variants
<Button sx={buttonStyles.primary.medium} />
<Button sx={buttonStyles.secondary.small} />
<Button sx={buttonStyles.outlined.large} />

// Modal styles
<Dialog sx={modalStyles.container} />
<DialogTitle sx={modalStyles.header} />
<DialogActions sx={modalStyles.actions} />

// Table styles
<TableContainer sx={tableStyles.container} />
<TableHead sx={tableStyles.headerRow} />
<TableRow sx={tableStyles.bodyRow} />

// Form styles
<Box sx={formStyles.container} />
<Box sx={formStyles.fieldGroup} />
<TextField sx={formStyles.inputField} />
```

### 4. Styled Components (Secondary)

```tsx
import styled from "styled-components";

const BpIcon = styled("span")(() => ({
  borderRadius: 3,
  width: 16,
  height: 16,
  border: "1px solid #d0d5dd",
}));
```

## Responsive Design

### MUI Breakpoints

| Breakpoint | Value |
|------------|-------|
| xs | 0px |
| sm | 600px |
| md | 960px |
| lg | 1280px |
| xl | 1920px |

### Responsive sx Syntax

```tsx
<Box
  sx={{
    width: { xs: "100%", sm: "90%", md: "1056px" },
    height: { xs: "auto", md: "418px" },
    flexDirection: { xs: "column", md: "row" },
    padding: { xs: 2, md: 4 },
  }}
/>
```

### useMediaQuery Hook

```tsx
import { useMediaQuery, useTheme } from "@mui/material";

const theme = useTheme();
const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));
```

## MUI Component Overrides

Global overrides in `themes/light.ts`:

### MuiButton

```typescript
MuiButton: {
  defaultProps: {
    disableRipple: true,
    disableElevation: true,
  },
  styleOverrides: {
    root: {
      borderRadius: "4px",
      textTransform: "none", // Preserve casing
    },
  },
}
```

### MuiTextField / MuiOutlinedInput

```typescript
MuiOutlinedInput: {
  styleOverrides: {
    root: {
      borderRadius: "2px",
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: "#d0d5dd",
      },
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: "#d0d5dd",
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "#d0d5dd",
      },
    },
  },
}
```

### MuiPaper

```typescript
MuiPaper: {
  styleOverrides: {
    root: {
      border: "1px solid #eaecf0",
      borderRadius: "4px",
      boxShadow: "0px 4px 24px -4px rgba(16, 24, 40, 0.08)...",
    },
  },
}
```

### MuiTableHead

```typescript
MuiTableHead: {
  styleOverrides: {
    root: {
      background: "linear-gradient(to bottom, #f9fafb, #f3f4f6)",
    },
  },
}
```

### MuiTooltip

```typescript
MuiTooltip: {
  styleOverrides: {
    tooltip: {
      fontSize: "13px",
      backgroundColor: "#1F2937",
      padding: "8px 12px",
      borderRadius: "4px",
    },
  },
}
```

## Icon System

### Lucide React (Primary)

```tsx
import { Upload, Trash2, Download, Eye, FileText, CheckCircle } from "lucide-react";
import { Settings, Send, Bot, X, Save, AlertCircle, Clock } from "lucide-react";

// Standard icon button styling
<IconButton
  sx={{
    padding: theme.spacing(0.5),
    "&:hover": {
      backgroundColor: theme.palette.background.fill,
    },
    "& svg path": {
      stroke: theme.palette.other.icon, // #667085
    },
  }}
>
  <Settings size={18} />
</IconButton>
```

### Asset Icons

Located in `Clients/src/presentation/assets/icons/`:
- PDF, CSV, XLS file type icons (SVG)
- Custom brand icons

## Global CSS

### Custom Scrollbar (App.css)

```css
::-webkit-scrollbar {
  width: 12px;
}
::-webkit-scrollbar-track {
  background: #f1f1f1;
}
::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: #555;
}
```

### Global Ripple Disable

```css
.MuiTouchRipple-root {
  display: none !important;
}
```

## Theme Provider Setup

```tsx
// App.tsx
import { ThemeProvider } from "@emotion/react";
import { CssBaseline } from "@mui/material";
import { light } from "./presentation/themes/light";

function App() {
  return (
    <ThemeProvider theme={light}>
      <CssBaseline />
      {/* App content */}
    </ThemeProvider>
  );
}
```

## Best Practices

### Do

```tsx
// Use theme values
sx={{ padding: theme.spacing(2) }}
sx={{ color: theme.palette.text.primary }}
sx={{ borderRadius: theme.shape.borderRadius }}

// Use mixins for consistency
sx={buttonMixins.primary()}
sx={cardMixins.base()}

// Use responsive syntax
sx={{ width: { xs: "100%", md: "50%" } }}

// Use status mixins for states
sx={statusMixins.success()}
sx={statusMixins.error()}
```

### Don't

```tsx
// Don't hardcode colors
sx={{ color: "#1c2130" }}  // Use theme.palette.text.primary

// Don't hardcode spacing
sx={{ padding: "16px" }}   // Use theme.spacing(8)

// Don't use px for breakpoints
sx={{ "@media (min-width: 600px)": {} }}  // Use responsive object syntax

// Don't disable ripple at component level
disableRipple  // Already disabled globally
```

## Design System Constants

| Property | Value |
|----------|-------|
| Primary color | `#13715B` |
| Border color | `#d0d5dd` |
| Border radius | `4px` (buttons/cards), `2px` (inputs) |
| Button height | `34px` (medium) |
| Base spacing | `2px` multiplier |
| Base font size | `13px` |
| Font family | Geist, Inter, system |

## Key Files

| File | Purpose |
|------|---------|
| `themes/light.ts` | Theme configuration, MUI overrides |
| `themes/components.ts` | Component style exports |
| `themes/mixins.ts` | Reusable style functions |
| `themes/alerts.ts` | Alert color definitions |
| `themes/tables.ts` | Table styling standards |
| `styles/colors.ts` | Dashboard color palette |
| `App.css` | Global styles, scrollbar |
| `index.css` | Font imports |

## Related Documentation

- [Frontend Overview](./overview.md)
- [Frontend Components](./components.md)
