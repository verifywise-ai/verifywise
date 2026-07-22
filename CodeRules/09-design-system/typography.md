# Typography

Typography system for VerifyWise. Use consistent sizes, weights, and line heights.

## Font Stack

```css
/* Primary */
font-family: 'Geist', system-ui, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;

/* Monospace (code blocks) */
font-family: 'Fira Code', 'Consolas', monospace;
```

Base font size: **13px**

## Font Weights

| Weight | Name | Usage |
|--------|------|-------|
| 400 | Regular | Body text, inputs |
| 500 | Medium | Labels, buttons, badges |
| 600 | Semibold | Headings, emphasis |
| 700 | Bold | Strong emphasis (rare) |

## Heading Styles

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Page title | 24px | 600 | 1.3 | Main page headings |
| Section title | 18px | 600 | 1.4 | Section headings |
| Card title | 16px | 600 | 1.4 | Card/panel headings |
| Subsection | 14px | 600 | 1.5 | Subsection headings |

## Body Text

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Body large | 14px | 400 | 1.5 | Prominent body text |
| Body default | 13px | 400 | 1.5 | Standard body text |
| Body small | 12px | 400 | 1.5 | Secondary information |
| Caption | 11px | 400 | 1.4 | Captions, footnotes |

## UI Text Styles

| Element | Size | Weight | Line Height | Notes |
|---------|------|--------|-------------|-------|
| Button text | 13px | 500 | 1 | Sentence case |
| Form label | 13px | 500 | 1.5 | Above input fields |
| Input text | 13px | 400 | 1.5 | Inside text fields |
| Placeholder | 13px | 400 | 1.5 | `text.accent` color |
| Error message | 11px | 400 | 1.4 | Below input fields |
| Table header | 12px | 500 | 1.5 | Uppercase |
| Table cell | 13px | 400 | 1.5 | Standard data |
| Badge text | 12px | 500 | 1 | Inside chips/badges |
| Tooltip | 13px | 400 | 1.4 | Tooltip content |

## Line Heights

| Name | Value | Usage |
|------|-------|-------|
| Tight | 1.2 | Headings, titles |
| Normal | 1.4 | Default for most text |
| Relaxed | 1.5 | Body text, paragraphs |
| Loose | 1.75 | Long-form content |

## Allowed Font Sizes

Only use these sizes: **11px, 12px, 13px, 14px, 16px, 18px, 24px**

Do NOT use arbitrary sizes like 15px, 17px, 19px, etc.

## Usage in Code

Source of truth: [`Clients/src/presentation/themes/typography.ts`](../../Clients/src/presentation/themes/typography.ts)

```tsx
import { textStyles, fontSize, fontWeight } from "@/presentation/themes/typography";
import { typographyMixins } from "@/presentation/themes/mixins";

// Prefer semantic text styles
<Typography sx={textStyles.cardTitle}>Card Title</Typography>
<Typography sx={textStyles.body}>Body text</Typography>
<Typography sx={textStyles.formLabel}>Email</Typography>

// Or mixins (adds theme colors)
<Typography sx={typographyMixins.pageTitle(theme)}>Page Title</Typography>
<Typography sx={typographyMixins.cardTitle(theme)}>Card Title</Typography>

// Primitives when no role fits
<Typography sx={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Small label</Typography>
```

> **Note:** Do not use MUI Typography variants (h1-h6, body1, body2) directly.
> Use `textStyles` / mixins / `fontSize` tokens from `typography.ts`.

## Related Documents

- [Colors](./colors.md)
- [Spacing](./spacing.md)
- [Component Patterns](./component-patterns.md)
- [Design Tokens](../../docs/technical/guides/design-tokens.md#typography)
