# Design Tokens & System Reference

This guide documents the design tokens, theme configuration, and visual standards used throughout VerifyWise.

## Theme Configuration

### File Structure

```
shared/design-tokens/
├── primitives.ts      # Color scale hex (phase 1 restyle values)
├── palette.ts         # Semantic tokens built from those scales
└── classic/           # The pre-restyle values, client only; delete at the January 2027 cutover
    ├── primitives.ts
    └── palette.ts

Clients/src/presentation/themes/
├── index.ts           # Central export hub
├── light.ts           # Main MUI theme configuration
├── palette.ts         # Hands out the active set (phase 1 or classic) with the same shape
├── uiStyle.ts         # Which look is active: localStorage `vw-ui-style`, read once at load
├── chartTheme.ts      # One chart theme: series order, risk and status marks, grid
├── cssVars.ts         # Writes tokens to :root as --vw-* custom properties for .css files
├── typography.ts      # Font scale and textStyles
├── v1SingleTheme.ts   # Standardized patterns
├── theme.d.ts         # TypeScript type definitions
├── components.ts      # Reusable component styles
├── mixins.ts          # Style mixins
├── alerts.ts          # Alert status styles
└── tables.ts          # Table-specific styles
```

## Phase 1 restyle and the classic look

The phase 1 restyle (hand-off of 12 Nov 2026) changed colours, type, corners, icons and the tab bar, with no change to layout. The classic look stays selectable until the January 2027 cutover.

- **Switch.** Settings → Preferences → Interface style. `themes/uiStyle.ts` reads `localStorage["vw-ui-style"]` once when the app loads (`"classic"` or anything else, which means phase 1). Changing it saves and reloads, because tokens are module-level constants used in hundreds of files. Code that must differ between the looks branches on `isClassicUi()`.
- **Two token sets, one shape.** `shared/design-tokens/` holds the phase 1 values; `shared/design-tokens/classic/` holds the previous values extended to the same exports. The client entry `themes/palette.ts` picks one and widens literal hex types to `string`. Raw scales for the active set come from `themes/index.ts` (`grey`, `green`, ... `signalGreen`, `series`).
- **Backend.** Emails and PDF reports compile only the top-level files, so they always use the phase 1 values.
- **New tokens.** `riskMark` (solid marks for dots, bars and slices; risk text colours are for words on a tint), `stage` (step bars), `score` (0–100 spectrum), `part` (Record/Track/Enforce, **on hold until the phase 2 sidebar**), `radius` / `radiusPx` (`sm` 2px, `md` / `lg` 2px (classic 6px / 8px), `search` 8px, `tab` 9px, `pill`; classic `sm` is 4px).
- **Charts.** Use `chartTheme` (`themes/chartTheme.ts`): `series` in fixed order for categories (fold past nine into Other), `single` for one measure, `risk.*` and `status.*` marks, `riskSummary` / `statusSummary` for count cards.
- **CSS files.** Use `var(--vw-<token>, <fallback hex>)`; `themes/cssVars.ts` sets the variables and `data-ui-style` on `<html>` so a rule can be scoped to one look.
- **Icons.** `components/VWIcon` holds the VerifyWise icon set (sidebar, app switcher, settings). Keep Lucide for small UI icons such as chevrons, close and search.
- **No hex in screens.** Use a token; for a value with no token, use the nearest one. `noHexInScreens.test.ts` scans the string literals (not comments; `rgb()`, `rgba()` and `hsl()` are out of scope) in `src/presentation/pages|components/**/*.ts(x)` and fails on a hex colour. The exceptions live in `themes/hexAllowList.ts`: the StyleGuide folder, the IntakeFormBuilder `DesignPanel`, and one exact literal in `WhatsNewSection`. Add to the list only for a colour the user picks or that documents a colour, never to skip a token.
- **Named colour maps.** For a colour that is not a series, use a look-aware map in `chartTheme.ts`: `entity`, `action` (`{ fill, hover, border }`), `entityTypes`, `fileTypes`, `medal`, `bars`, `providers` (with `providerFallback`), `contestants`, `tiles`, `menuIcons`, `confetti`, `avatars`, `lines`. `chartThemeNamed.test.ts` pins them. New code takes a named map and never indexes `chart[n]`.
- **Radius.** `radiusPx.md` and `radiusPx.lg` sit beside `sm`, `search`, `tab` and `pill` (classic 6px and 8px, phase 1 2px). The email card is 2px.
- **Table sort.** Clicking a heading cycles ascending, descending, original order (`useStandardTable`). Phase 1 shows ↑ or ↓ after the label and sets `aria-sort`. Table body cells use tabular numerals in phase 1.
- **Search box.** Phase 1 placeholder is "Search this list" and the radius is `radiusPx.search`.
- **Filters.** Use `components/Table/TableFilter.tsx` for every new table, not `FilterBy`. It renders `FilterBy` in classic and `FilterChips` in phase 1, with the same `FilterColumn[]` and `onFilterChange(conditions, "and")` contract. Pass `data` and `getFieldValue` to show counts on the chips. Match rows with `application/utils/filterConditions.ts`. Group and Columns stay in both looks. `FrameworkFilter/TabFilterBar` still uses `FilterBy`.
- **Stage steps.** `components/StageSteps` draws a lifecycle stage as four bars in phase 1 (order: in review, planned, live, retired). It is used in `LifecycleTabs/LifecyclePanel`.
- **Tab icons.** In phase 1 `TabBar` adds an icon from `TabBar/tabIcons.ts` (`TAB_ICON_BY_LABEL`, matched on the label, then on the tab value). Add a tab's icon there.
- **Note colour.** The `note` token (phase 1: `#FFF8E6` fill, `#EBBE72` border, `#5C3F08` text) tints `InfoBox` (info variant) and `EmptyStateTip` in phase 1.

`shared/design-tokens/primitives.ts` holds the scale hex. `shared/design-tokens/palette.ts` builds brand, button, text, icon, background, border, and status from those scales. The client `palette.ts` re-exports the shared palette, so existing screen imports stay valid. Email and PDF rendering can import the shared modules.

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

Phase 1 values; classic values are in `shared/design-tokens/classic/`.

| Token                            | Value     | Usage                            |
| -------------------------------- | --------- | -------------------------------- |
| `brand.primary` / `primary.main` | `#14715B` | Primary actions, links, emphasis |
| `brand.primaryHover`             | `#075443` | Hover state for primary          |
| `brand.primaryLight`             | `#D9F2E9` | Light backgrounds, selected      |
| `brand.primaryDark`              | `#075443` | Dark variant                     |

### Button Colors

`button` tokens are for `CustomizableButton`. Shape: `button.<intent>.<variant>.<slot>.<state>`. Intents in this group today: `primary`, `secondary`. Variants: `contained`, `outlined`, `text`. Slots: `bg`, `text`, `border`. States: `default`, `hover`, `disabled`. Pressed is not tokenized yet; hover applies while pressed.

Values reference primitives (`green`, `grey`) directly, not `brand`. `green[700]` is the same hex as `brand.primary`, but the tokens can change independently.

Disabled values are their own tokens so they can change without touching `border.light` or `text.disabled`.

`v1SingleTheme.ts` reads these for `buttons.primary` and `buttons.secondary`. Success, warning, error, and info still use the local `colors` object in that file.

`theme.palette.secondary` (`#F4F4F4`) is the MUI light fill. It is not `CustomizableButton` secondary.

| Token                                       | Value     | Usage                                  |
| ------------------------------------------- | --------- | -------------------------------------- |
| `button.primary.contained.bg.default`       | `#13715B` | Primary filled background              |
| `button.primary.contained.bg.hover`         | `#10614D` | Primary filled hover                   |
| `button.primary.contained.bg.disabled`      | `#E5E7EB` | Primary filled disabled background     |
| `button.primary.contained.text.default`     | `#FFFFFF` | Label on a filled primary button       |
| `button.primary.contained.text.disabled`    | `#9CA3AF` | Label on a disabled filled button      |
| `button.primary.outlined.text.default`      | `#13715B` | Primary outlined label                 |
| `button.primary.outlined.border.default`    | `#13715B` | Primary outlined border                |
| `button.primary.text.text.default`          | `#13715B` | Primary text-variant label             |
| `button.secondary.contained.bg.default`     | `#6B7280` | Secondary filled background            |
| `button.secondary.contained.bg.hover`       | `#475467` | Secondary filled hover                 |
| `button.secondary.outlined.text.default`    | `#6B7280` | Secondary outlined / text label        |

### Text Colors

| Token            | Value     | Usage                    |
| ---------------- | --------- | ------------------------ |
| `text.primary`   | `#1C2130` | Main body text, headings |
| `text.secondary` | `#344054` | Secondary text, labels   |
| `text.tertiary`  | `#475467` | Muted text, placeholders |
| `text.accent`    | `#838C99` | Hints                    |
| `text.disabled`  | `#9CA3AF` | Disabled state text      |
| `text.icon`      | `#667085` | Muted text; same grey as `icon.default` |

### Icon Colors

Icon strokes. They read the color scales directly and do not alias text tokens.

| Token          | Value     | Usage                              |
| -------------- | --------- | ---------------------------------- |
| `icon.default` | `#667085` | Default icon stroke                |
| `icon.error`   | `#D32F2F` | Destructive icons, such as delete  |

### Background Colors

| Token               | Value     | Usage                               |
| ------------------- | --------- | ----------------------------------- |
| `background.main`   | `#FFFFFF` | Main content areas                  |
| `background.alt`    | `#F9FAFB` | Alternate sections                  |
| `background.modal`  | `#F9FAFB` | Modal background                    |
| `background.fill`   | `#E6F0EC` | Filled areas, selected tint         |
| `background.accent` | `#F9FAFB` | Subtle highlights                   |
| `background.hover`  | `#F3F4F6` | Hover states                        |
| `secondary.main`    | `#F4F4F4` | MUI secondary fill (not CustomizableButton) |
| `secondary.dark`    | `#e3e3e3` | MUI secondary hover                         |

### Border Colors

| Token          | Value     | Usage           |
| -------------- | --------- | --------------- |
| `border.dark`  | `#D1D5D5` | Inputs, stronger borders |
| `border.light` | `#E4E6E6` | Hairline: cards, tables, tabs |

### Status Colors

#### Severity Levels

| Level    | Text      | Background | Usage                     |
| -------- | --------- | ---------- | ------------------------- |
| Critical | `#D32F2F` | `#FFD6D6`  | Critical risks, errors    |
| High     | `#E64A19` | `#FFE5D0`  | High priority items       |
| Medium   | `#795548` | `#FFF8E1`  | Medium priority, warnings |
| Low      | `#138A5E` | `#E6F4EA`  | Low priority items        |
| Very low | `#00695C` | `#E0F7FA`  | Minimal concern           |

#### Implementation Status

| Status  | Text      | Background | Usage                |
| ------- | --------- | ---------- | -------------------- |
| Success | `#138A5E` | `#E6F4EA`  | Completed, confirmed |
| Error   | `#D32F2F` | `#FFD6D6`  | Failed, critical     |
| Warning | `#795548` | `#FFF8E1`  | Needs attention      |
| Info    | `#1565C0` | `#E3F2FD`  | Informational        |
| Default | `#6B7280` | `#F9FAFB`  | Neutral              |

#### Alert States

Alert styles in `themes/alerts.ts` use the same status hexes: success `#138A5E` / `#E6F4EA`, error `#D32F2F` / `#FFD6D6`, warning `#795548` / `#FFF8E1`, info `#1565C0` / `#E3F2FD`.

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

| Token       | Size | Usage                  |
| ----------- | ---- | ---------------------- |
| `xs` / `sm` | 12px | Small labels, captions |
| `base`      | 13px | Default body text      |
| `md`        | 14px | Emphasized body text   |
| `lg`        | 15px | Large body text        |
| `xl`        | 16px | Small headings         |
| `2xl`       | 20px | Section headings       |
| `3xl`       | 22px | Page headings          |
| `4xl`       | 26px | Large headings         |
| `5xl`       | 30px | Display headings       |

### Font Weights

| Token      | Weight | Usage                    |
| ---------- | ------ | ------------------------ |
| `normal`   | 400    | Body text                |
| `medium`   | 500    | Emphasized text, buttons |
| `semibold` | 600    | Headings, labels         |
| `bold`     | 700    | Strong emphasis          |

### Line Heights

| Token     | Value | Usage               |
| --------- | ----- | ------------------- |
| `tight`   | 1.2   | Headings            |
| `snug`    | 1.3   | Compact text        |
| `normal`  | 1.4   | Default body        |
| `relaxed` | 1.5   | Readable paragraphs |

## Spacing

### Spacing Scale

| Token | Size | Usage                    |
| ----- | ---- | ------------------------ |
| `xs`  | 4px  | Tight spacing, icon gaps |
| `sm`  | 8px  | Small gaps, padding      |
| `md`  | 12px | Default spacing          |
| `lg`  | 16px | Section spacing          |
| `xl`  | 24px | Large gaps               |
| `2xl` | 32px | Section margins          |
| `3xl` | 40px | Page sections            |
| `4xl` | 48px | Major sections           |

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

| Size   | Height | Font Size | Padding   |
| ------ | ------ | --------- | --------- |
| Small  | 28px   | 12px      | 8px 12px  |
| Medium | 34px   | 13px      | 10px 16px |
| Large  | 40px   | 14px      | 12px 20px |

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

| Size   | Height | Usage            |
| ------ | ------ | ---------------- |
| Small  | 32px   | Compact forms    |
| Medium | 40px   | Default          |
| Large  | 48px   | Prominent inputs |

### Cards

| Padding | Size | Usage           |
| ------- | ---- | --------------- |
| Small   | 12px | Compact cards   |
| Medium  | 16px | Default cards   |
| Large   | 24px | Prominent cards |

## Shape & Borders

### Border Radius

```typescript
import { radiusPx } from "../themes/palette";

borderRadius: radiusPx.sm; // 2px (classic 4px): buttons, cards, inputs, menus, modals
borderRadius: radiusPx.search; // 8px: the search field above a table
borderRadius: `${radiusPx.tab} ${radiusPx.tab} 0 0`; // 9px top corners of a tab
borderRadius: radiusPx.pill; // pills, filter chips, link chips
```

In `sx`, a bare number is multiplied by `theme.shape.borderRadius` (2), so `borderRadius: 4` renders 8px. Use `radiusPx` instead of numbers.

### Border Styles

```typescript
// Default border
border: "1px solid #d0d5dd";

// Light border
border: "1px solid #E5E7EB";

// Using theme
border: `1px solid ${theme.palette.border.dark}`;
border: `1px solid ${theme.palette.border.light}`;
```

## Shadows

### Primary Shadow

```typescript
boxShadow: "0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)";
```

### No Shadow (Default)

Most components use no shadow by default:

```typescript
boxShadow: "none";
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

| Purpose    | Light     | Dark/Emphasis |
| ---------- | --------- | ------------- |
| Brand      | `#13715B` | `#0F5A47`     |
| Text       | `#1C2130` | `#344054`     |
| Border     | `#E5E7EB` | `#D0D5DD`     |
| Background | `#FFFFFF` | `#F9FAFB`     |
| Success    | `#E6F4EA` | `#138A5E`     |
| Error      | `#FFD6D6` | `#D32F2F`     |
| Warning    | `#FFF8E1` | `#795548`     |

## Key Files

| File                                            | Purpose                                 |
| ----------------------------------------------- | --------------------------------------- |
| `shared/design-tokens/primitives.ts`            | Color scale hex                         |
| `shared/design-tokens/palette.ts`               | Semantic tokens built from those scales |
| `Clients/src/presentation/themes/palette.ts`    | Re-exports the shared semantic palette  |
| `Clients/src/presentation/themes/light.ts`      | Main MUI theme                          |
| `Clients/src/presentation/themes/components.ts` | Reusable component styles               |
| `Clients/src/presentation/themes/mixins.ts`     | Style mixins                            |
| `Clients/src/presentation/themes/alerts.ts`     | Alert status styles                     |
| `Clients/src/presentation/themes/theme.d.ts`    | TypeScript definitions                  |
| `Clients/src/presentation/styles/colors.ts`     | Color palette                           |

## Related Documentation

- [Frontend Patterns](./frontend-patterns.md)
- [Code Style Guide](./code-style.md)
- [Adding New Features](./adding-new-feature.md)
