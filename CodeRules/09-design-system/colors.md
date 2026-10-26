# Colors

Complete color palette for the VerifyWise design system. Always use theme tokens — never hardcode hex values.

Scale hex lives in `shared/design-tokens/primitives.ts`. Semantic tokens live in `shared/design-tokens/palette.ts`. The client `palette.ts` re-exports the shared palette. New screen styles should use `theme.palette`, a palette export, `textStyles` / `fontSize`, and `theme.spacing()`.

## Primary

| Token                            | Value     | Usage                        |
| -------------------------------- | --------- | ---------------------------- |
| `brand.primary` / `primary.main` | `#13715B` | Brand green, primary actions |
| `brand.primaryHover`             | `#0F5A47` | Hover state for primary      |
| `brand.primaryLight`             | `#E6F0EC` | Light variant                |
| `brand.primaryDark`              | `#10614D` | Dark variant                 |

## Text

| Token            | Value     | Usage                    |
| ---------------- | --------- | ------------------------ |
| `text.primary`   | `#1C2130` | Main body text           |
| `text.secondary` | `#344054` | Supporting text          |
| `text.tertiary`  | `#475467` | Muted text, placeholders |
| `text.accent`    | `#838C99` | Hints                    |
| `text.disabled`  | `#9CA3AF` | Disabled text            |
| `text.icon`      | `#667085` | Default icon color       |

## Backgrounds

| Token               | Value     | Usage                          |
| ------------------- | --------- | ------------------------------ |
| `background.main`   | `#FFFFFF` | Page background                |
| `background.alt`    | `#F9FAFB` | Alternate panels               |
| `background.modal`  | `#F9FAFB` | Modal background               |
| `background.fill`   | `#E6F0EC` | Fill areas, selected tint      |
| `background.accent` | `#F9FAFB` | Subtle accent areas            |
| `background.hover`  | `#F3F4F6` | Hover states                   |
| `secondary.main`    | `#F4F4F4` | Secondary button fill          |
| `secondary.dark`    | `#e3e3e3` | Secondary hover and other fill |

## Borders

| Token          | Value     | Usage                     |
| -------------- | --------- | ------------------------- |
| `border.light` | `#E5E7EB` | Subtle separators         |
| `border.dark`  | `#D0D5DD` | Default borders, dividers |

> **Standard border:** Use `theme.palette.border.dark` for card borders and dividers.

## Status Colors

### Success

| Token                   | Value     | Usage                                                |
| ----------------------- | --------- | ---------------------------------------------------- |
| `status.success.text`   | `#138A5E` | Success text                                         |
| `status.success.bg`     | `#E6F4EA` | Badge/chip background                                |
| `status.success.border` | `#C8E6D0` | Success borders                                      |
| `status.success.strong` | `#079455` | Transient confirmation only. Not on the green scale. |

### Error

| Token                 | Value     | Usage                 |
| --------------------- | --------- | --------------------- |
| `status.error.text`   | `#D32F2F` | Error text            |
| `status.error.bg`     | `#FFD6D6` | Badge/chip background |
| `status.error.border` | `#F5B8B8` | Error borders         |

### Warning

| Token                   | Value     | Usage                 |
| ----------------------- | --------- | --------------------- |
| `status.warning.text`   | `#795548` | Warning text          |
| `status.warning.bg`     | `#FFF8E1` | Badge/chip background |
| `status.warning.border` | `#F5E6B8` | Warning borders       |

### Info

| Token                | Value     | Usage           |
| -------------------- | --------- | --------------- |
| `status.info.text`   | `#1565C0` | Info text       |
| `status.info.bg`     | `#E3F2FD` | Info background |
| `status.info.border` | `#BBDEFB` | Info borders    |

## Usage in code

```tsx
// Always use theme references
<Box sx={{ color: "text.primary", bgcolor: "background.main" }} />
<Typography color="text.secondary">Muted text</Typography>
<Box sx={{ borderColor: "border.dark" }} />

// Using theme object
<Box sx={{ color: (theme) => theme.palette.primary.main }} />

// Status colors with theme
<Chip sx={{ bgcolor: (theme) => theme.palette.status.success.bg }} />
```

## Related Documents

- [Typography](./typography.md)
- [Do's and Don'ts](./dos-and-donts.md)
- [Accessibility](./accessibility.md)
