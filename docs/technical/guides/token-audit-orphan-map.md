# Token Audit — Orphan Map (Phase 1: Colors)

> **Branch:** `feature/design-token-foundation`  
> **Last updated:** 2026-07-09

## Figma neutral scale (primitives)

Source of truth: [`Clients/src/presentation/themes/primitives.ts`](../../Clients/src/presentation/themes/primitives.ts) (`grey` export)

| Step | Hex | Semantic usage |
|------|-----|----------------|
| 50 | `#f9fafb` | `background.accent` |
| 100 | `#F3F4F6` | `background.hover`, `status.default.bg` |
| 200 | `#E5E7EB` | `border.light`, `status.default.border` |
| 300 | `#d0d5dd` | `border.dark` |
| 400 | `#99A1AF` | `text.muted`, `text.disabled` |
| 500 | `#6B7280` | `text.icon`, `status.default.text` |
| 600 | `#4b5563` | `text.tertiary`, `text.subdued` |
| 700 | `#374151` | `text.secondary` |
| 800 | `#1f2937` | — (available for emphasis) |
| 900 | `#111827` | `text.primary` |
| 950 | `#000000` | `text.black` |

Status, risk, accent, brand, and chart hues are unchanged in `palette.ts` until their Figma scales are added.

## Top orphan hex → token mapping

Use **`palette.*`** in components (not raw hex or `neutral[n]` unless in theme files).

| Orphan | Count (approx) | Primitive | Semantic token |
|--------|----------------|-----------|----------------|
| `#d0d5dd` | 117 | `neutral.300` | `palette.border.dark` |
| `#666` / `#666666` | 106 | `neutral.600` | `palette.text.subdued` |
| `#dc2626` | 57 | `red.500` | `palette.risk.critical.text` |
| `#13715b` | 50 | `green.500` | `palette.brand.primary` |
| `#fafafa` / `#f9fafb` | 50+ | `neutral.50` | `palette.background.accent` |
| `#10b981` | 42 | `mint.500` | `palette.risk.low.text` |
| `#ef4444` | 39 | `orange.500` | `palette.risk.high.text` |
| `#f59e0b` | 38 | `brown.500` | `palette.risk.medium.text` |
| `#eaecf0` / `#e0e4e9` | 64 | `neutral.200` | `palette.border.light` |
| `#374151` / `#1f2937` / `#111827` | 80+ | `neutral.700–900` | `palette.text.secondary` / `primary` |
| `#3b82f6` / `#4c7bf4` | 52 | `blue.500` | `palette.status.info.text` |
| `#8b5cf6` | 21 | `purple.500` | `palette.accent.purple.text` |
| `#92400e` | 31 | `brown.500` | `palette.status.warning.text` |
| `#d32f2f` | 21 | `red.500` | `palette.status.error.text` |



## Policy

- No new hex greys or status colors in `presentation/` components.
- New colors only via `primitives.ts` + design review.
- Fonts, spacing, and border radius: deferred to Phases 2–4.
