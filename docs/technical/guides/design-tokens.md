# Design Tokens & System Reference

This guide documents the design tokens, theme configuration, and visual standards used throughout VerifyWise.

## Theme Configuration

### File Structure

```
Clients/src/presentation/themes/
├── index.ts           # Central export hub
├── light.ts           # Main MUI theme configuration
├── v1SingleTheme.ts   # Standardized patterns
├── theme.d.ts         # TypeScript type definitions
├── components.ts      # Reusable component styles
├── mixins.ts          # Style mixins
├── alerts.ts          # Alert status styles
└── tables.ts          # Table-specific styles
```

### Theme Provider Setup

```typescript
// App.tsx
import { ThemeProvider } from "@mui/material/styles";
import { lightTheme } from "./presentation/themes";

function App() {
  return (
    <ThemeProvider theme={lightTheme}>
      {/* Application */}
    </ThemeProvider>
  );
}
```

## Color Palette

### Brand Colors

| Token | Value | Usage |
|-------|-------|-------|
| `primary.main` | `#13715B` | Primary actions, links, emphasis |
| `primary.dark` | `#0A4A3A` | Hover states, dark variants |
| `primary.light` | `#E6F2EF` | Light backgrounds, highlights |

### Text Colors

| Token | Value | Usage |
|-------|-------|-------|
| `text.primary` | `#1c2130` | Main body text, headings |
| `text.secondary` | `#344054` | Secondary text, labels |
| `text.tertiary` | `#475467` | Muted text, placeholders |
| `text.disabled` | `#9CA3AF` | Disabled state text |

### Background Colors

| Token | Value | Usage |
|-------|-------|-------|
| `background.main` | `#FFFFFF` | Main content areas |
| `background.alt` | `#FCFCFD` | Alternate sections |
| `background.fill` | `#F4F4F4` | Filled areas, inputs |
| `background.accent` | `#f9fafb` | Subtle highlights |
| `background.hover` | `#E5E7EB` | Hover states |

### Border Colors

| Token | Value | Usage |
|-------|-------|-------|
| `border.dark` | `#d0d5dd` | Default borders |
| `border.light` | `#eaecf0` | Subtle borders |

### Status Colors

#### Severity Levels

| Level | Color | Usage |
|-------|-------|-------|
| Critical | `#DC2626` | Critical risks, errors |
| High | `#EF4444` | High priority items |
| Medium | `#F59E0B` | Medium priority, warnings |
| Low | `#10B981` | Low priority items |
| Very Low | `#22C55E` | Minimal concern |

#### Implementation Status

| Status | Color | Usage |
|--------|-------|-------|
| Implemented | `#13715B` | Completed items |
| Awaiting Review | `#3B82F6` | Pending review |
| Awaiting Approval | `#8B5CF6` | Pending approval |
| Needs Rework | `#EA580C` | Requires changes |
| Not Started | `#9CA3AF` | Not begun |

#### Alert States

```typescript
// From themes/alerts.ts
export const alertStyles = {
  success: {
    text: "#079455",
    main: "#17b26a",
    background: "#ecfdf3",
  },
  error: {
    text: "#f04438",
    main: "#d32f2f",
    background: "#f9eced",
  },
  warning: {
    text: "#DC6803",
    main: "#fdb022",
    background: "#fffcf5",
  },
  info: {
    text: "#0288d1",
    main: "#475467",
    background: "#e5f6fd",
  },
};
```

## Typography

### Font Families

```typescript
const fontFamily = [
  "Geist",
  "Inter",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "Helvetica",
  "Arial",
  "sans-serif",
].join(", ");

const monoFontFamily = [
  "Geist Mono",
  "Fira Code",
  "Consolas",
  "monospace",
].join(", ");
```

### Font Sizes

| Token | Size | Usage |
|-------|------|-------|
| `xs` / `sm` | 12px | Small labels, captions |
| `base` | 13px | Default body text |
| `md` | 14px | Emphasized body text |
| `lg` | 15px | Large body text |
| `xl` | 16px | Small headings |
| `2xl` | 20px | Section headings |
| `3xl` | 22px | Page headings |
| `4xl` | 26px | Large headings |
| `5xl` | 30px | Display headings |

### Font Weights

| Token | Weight | Usage |
|-------|--------|-------|
| `normal` | 400 | Body text |
| `medium` | 500 | Emphasized text, buttons |
| `semibold` | 600 | Headings, labels |
| `bold` | 700 | Strong emphasis |

### Line Heights

| Token | Value | Usage |
|-------|-------|-------|
| `tight` | 1.2 | Headings |
| `snug` | 1.3 | Compact text |
| `normal` | 1.4 | Default body |
| `relaxed` | 1.5 | Readable paragraphs |

## Spacing

### Spacing Scale

| Token | Size | Usage |
|-------|------|-------|
| `xs` | 4px | Tight spacing, icon gaps |
| `sm` | 8px | Small gaps, padding |
| `md` | 12px | Default spacing |
| `lg` | 16px | Section spacing |
| `xl` | 24px | Large gaps |
| `2xl` | 32px | Section margins |
| `3xl` | 40px | Page sections |
| `4xl` | 48px | Major sections |

### Using Theme Spacing

```typescript
// MUI theme.spacing() uses 8px base
sx={{
  padding: 2,        // 16px (2 * 8)
  marginTop: 1,      // 8px (1 * 8)
  gap: 1.5,          // 12px (1.5 * 8)
}}
```

## Component Sizes

### Buttons

| Size | Height | Font Size | Padding |
|------|--------|-----------|---------|
| Small | 28px | 12px | 8px 12px |
| Medium | 34px | 13px | 10px 16px |
| Large | 40px | 14px | 12px 20px |

```typescript
// Standard button (medium)
<Button
  sx={{
    height: 34,
    fontSize: 13,
    fontWeight: 500,
    borderRadius: "4px",
  }}
>
  Button Text
</Button>
```

### Inputs

| Size | Height | Usage |
|------|--------|-------|
| Small | 32px | Compact forms |
| Medium | 40px | Default |
| Large | 48px | Prominent inputs |

### Cards

| Padding | Size | Usage |
|---------|------|-------|
| Small | 12px | Compact cards |
| Medium | 16px | Default cards |
| Large | 24px | Prominent cards |

## Shape & Borders

### Border Radius

```typescript
// Standard border radius
borderRadius: "4px"  // Primary standard

// Using theme
borderRadius: theme.shape.borderRadius  // 4px
borderRadius: theme.spacing(1.5)        // 12px for modals
```

### Border Styles

```typescript
// Default border
border: "1px solid #d0d5dd"

// Light border
border: "1px solid #eaecf0"

// Using theme
border: `1px solid ${theme.palette.border.dark}`
border: `1px solid ${theme.palette.border.light}`
```

## Shadows

### Primary Shadow

```typescript
boxShadow: "0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)"
```

### No Shadow (Default)

Most components use no shadow by default:

```typescript
boxShadow: "none"
```

## Component Style Patterns

### Modal Styles

```typescript
// From themes/components.ts
export const modalStyles = {
  paper: {
    maxWidth: 480,
    width: "100%",
    padding: theme.spacing(2.5),
    borderRadius: theme.spacing(1.5),
    boxShadow: "0px 4px 24px -4px rgba(16, 24, 40, 0.08)",
    animation: "scaleIn 0.2s",
  },
};
```

### Card Styles

```typescript
export const cardStyles = {
  root: {
    border: `1px solid ${theme.palette.border.dark}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(2),
    boxShadow: "none",
  },
};
```

### Table Styles

```typescript
export const tableStyles = {
  header: {
    background: "linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)",
    borderBottom: "1px solid #d0d5dd",
  },
  cell: {
    padding: "12px 10px",
    fontSize: 13,
    borderBottom: "1px solid #eaecf0",
  },
  rowHover: {
    backgroundColor: "#f5f5f5",
  },
};
```

### Form Styles

```typescript
export const formStyles = {
  textField: {
    "& .MuiOutlinedInput-root": {
      "& fieldset": {
        borderColor: "#d0d5dd",
      },
      "&:hover fieldset": {
        borderColor: "#d0d5dd",
      },
      "&.Mui-focused fieldset": {
        borderColor: "#d0d5dd",
      },
    },
  },
};
```

## Style Mixins

The `themes/mixins.ts` file provides reusable style functions:

### Button Mixins

```typescript
import { buttonMixins } from "../themes/mixins";

// Primary button
sx={buttonMixins.primary}

// Secondary button
sx={buttonMixins.secondary}

// Danger button
sx={buttonMixins.danger}
```

### Card Mixins

```typescript
import { cardMixins } from "../themes/mixins";

// Standard card
sx={cardMixins.standard}

// Elevated card
sx={cardMixins.elevated}

// Interactive card (hover effect)
sx={cardMixins.interactive}
```

### Typography Mixins

```typescript
import { typographyMixins } from "../themes/mixins";

// Page title
sx={typographyMixins.pageTitle}

// Section heading
sx={typographyMixins.sectionHeading}

// Body text
sx={typographyMixins.body}
```

### Status Mixins

```typescript
import { statusMixins } from "../themes/mixins";

// Get status chip style
sx={statusMixins.getChipStyle("implemented")}
sx={statusMixins.getChipStyle("critical")}
```

## MUI Theme Customizations

### Disabled Ripple

All MUI components have ripple effect disabled:

```typescript
// In theme configuration
MuiButtonBase: {
  defaultProps: {
    disableRipple: true,
  },
},
```

### Tooltip Styling

```typescript
MuiTooltip: {
  styleOverrides: {
    tooltip: {
      backgroundColor: "#1F2937",
      fontSize: 13,
      padding: "8px 12px",
    },
  },
},
```

### Custom Button Variants

```typescript
// Group variant for button groups
<Button variant="group">Grouped Button</Button>
```

## TypeScript Type Extensions

Custom theme types are defined in `theme.d.ts`:

```typescript
// theme.d.ts
declare module "@mui/material/styles" {
  interface Palette {
    border: {
      dark: string;
      light: string;
    };
    background: {
      main: string;
      alt: string;
      fill: string;
      accent: string;
      hover: string;
    };
    text: {
      tertiary: string;
    };
  }
}
```

## Usage Examples

### Accessing Theme in Components

```typescript
import { useTheme } from "@mui/material/styles";

function MyComponent() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.background.main,
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: theme.shape.borderRadius,
        padding: theme.spacing(2),
      }}
    >
      Content
    </Box>
  );
}
```

### Using sx Prop with Theme

```typescript
<Box
  sx={(theme) => ({
    color: theme.palette.text.secondary,
    "&:hover": {
      backgroundColor: theme.palette.background.hover,
    },
  })}
>
  Hover me
</Box>
```

### Combining Mixins with Custom Styles

```typescript
import { cardMixins, typographyMixins } from "../themes/mixins";

<Card sx={{ ...cardMixins.standard, padding: 3 }}>
  <Typography sx={typographyMixins.sectionHeading}>
    Section Title
  </Typography>
</Card>
```

## Design Principles

1. **Use theme values** - Always reference theme tokens instead of hardcoded values
2. **Prefer sx prop** - Use MUI's sx prop over inline styles or styled-components
3. **Consistent spacing** - Follow the spacing scale for predictable layouts
4. **Standard sizes** - Use predefined component sizes (button: 34px, inputs: 40px)
5. **Border radius 4px** - Maintain consistent corner radius across components
6. **No shadows** - Most components have no shadow; use sparingly for elevation
7. **Disabled ripple** - Interactive elements don't show ripple effects
8. **Type safety** - Use SxProps<Theme> for style prop types

## Color Reference Chart

### Quick Reference

| Purpose | Light | Dark/Emphasis |
|---------|-------|---------------|
| Brand | `#13715B` | `#0A4A3A` |
| Text | `#1c2130` | `#344054` |
| Border | `#eaecf0` | `#d0d5dd` |
| Background | `#FFFFFF` | `#f9fafb` |
| Success | `#17b26a` | `#079455` |
| Error | `#f04438` | `#d32f2f` |
| Warning | `#fdb022` | `#DC6803` |

## Key Files

| File | Purpose |
|------|---------|
| `Clients/src/presentation/themes/light.ts` | Main MUI theme |
| `Clients/src/presentation/themes/components.ts` | Reusable component styles |
| `Clients/src/presentation/themes/mixins.ts` | Style mixins |
| `Clients/src/presentation/themes/alerts.ts` | Alert status styles |
| `Clients/src/presentation/themes/theme.d.ts` | TypeScript definitions |
| `Clients/src/presentation/styles/colors.ts` | Color palette |

## Related Documentation

- [Frontend Patterns](./frontend-patterns.md)
- [Code Style Guide](./code-style.md)
- [Adding New Features](./adding-new-feature.md)
