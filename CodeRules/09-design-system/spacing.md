# Spacing & Layout

VerifyWise uses a **2px base unit** for `theme.spacing()`. This differs from MUI's default 8px.

## Spacing Scale

| `theme.spacing(n)` | Result | Usage |
|---------------------|--------|-------|
| `spacing(1)` | 2px | Micro spacing, icon gaps |
| `spacing(2)` | 4px | Tight spacing, small padding |
| `spacing(4)` | 8px | Default gap, button padding |
| `spacing(6)` | 12px | Card padding, field spacing |
| `spacing(8)` | 16px | Section spacing, large gaps |
| `spacing(10)` | 20px | Container padding |
| `spacing(12)` | 24px | Modal padding, major spacing |
| `spacing(16)` | 32px | Page padding, section margins |
| `spacing(20)` | 40px | Large page padding |

> **Important:** `theme.spacing(4)` = **8px**, not 32px. Multiply `n × 2` to get pixels.

## Common Padding Patterns

| Context | Padding |
|---------|---------|
| Buttons / Inputs | `8px 12px` |
| Cards / Containers | `12px 16px` |
| Page sections | `16px 20px` |
| Modal content | `24px 32px` |
| Page content | `32px 40px` |

## Gap Values

| Gap | Usage |
|-----|-------|
| 4px | Tight grouping (icon + text) |
| 8px | Related items (form fields in a row) |
| 12px | Section items |
| 16px | Cards in a grid |
| 24px | Major sections |
| 32px | Page sections |

> Always use `gap` for flex/grid spacing instead of margins between children.

## Common Margins

| Context | Value |
|---------|-------|
| Label to input | `mb: "4px"` |
| Title to subtitle | `mb: "8px"` |
| Section header to content | `mb: "16px"` |
| Section to section | `mb: "24px"` |
| Page header to content | `mb: "32px"` |
| Footer / checklist sections | `mt: "40px"` |

## Layout Mixins

Use mixins from `@/presentation/themes/mixins` for common layout patterns:

```tsx
import { layoutMixins, cardMixins, formMixins } from "@/presentation/themes/mixins";

// Centering
<Box sx={layoutMixins.flexCenter()}>Centered content</Box>

// Space between
<Box sx={layoutMixins.flexBetween()}>
  <span>Left</span>
  <span>Right</span>
</Box>

// Card base
<Box sx={cardMixins.base(theme)}>Card content</Box>

// Form field container
<Box sx={formMixins.fieldContainer(theme)}>
  <label>Name</label>
  <input />
</Box>
```

### Available Mixins

| Category | Mixins |
|----------|--------|
| **Layout** | `flexCenter()`, `flexBetween()`, `flexStart()`, `fullHeight()`, `container(theme)` |
| **Button** | `primary(theme)`, `secondary(theme)`, `outlined(theme)` |
| **Card** | `base(theme)`, `stats(theme)`, `interactive(theme)` |
| **Modal** | `container(theme)`, `header(theme)`, `closeButton(theme)` |
| **Table** | `container(theme)`, `headerCell(theme)`, `bodyCell(theme)`, `hoverableRow(theme)` |
| **Form** | `container(theme)`, `fieldContainer(theme)`, `inputField(theme)` |
| **Icon** | `button(theme)`, `standard(theme)` |
| **Typography** | `pageTitle(theme)`, `pageDescription(theme)`, `cardTitle(theme)`, `cardDescription(theme)` |
| **Status** | `success(theme)`, `error(theme)`, `warning(theme)`, `info(theme)` |

## Usage in Code

```tsx
// Use theme.spacing() for consistent spacing
<Box sx={{ p: 4, gap: 4 }}>  {/* 8px padding, 8px gap */}
  <Typography sx={{ mb: "16px" }}>Title</Typography>
  <Content />
</Box>

// Responsive spacing
<Box sx={{ p: { xs: 4, md: 8 } }}>  {/* 8px on mobile, 16px on desktop */}
  Content
</Box>
```

## Related Documents

- [Typography](./typography.md)
- [Breakpoints](./breakpoints.md)
- [Component Patterns](./component-patterns.md)
