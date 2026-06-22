---
title: themes/palette.ts — Unified Color Palette
tags: [entity, frontend, palette, theming, single-source]
source: Clients/src/presentation/themes/palette.ts
date: 2026-04-30
status: active
---

# themes/palette.ts

## Tip

Frontend unified color palette — single source of truth.

## Konum

`Clients/src/presentation/themes/palette.ts`

## Sorumluluk

Tüm hardcoded hex renkleri buradan import edilir. Modules: Governance, LLM Evals, AI Detection, Shadow AI, Model Inventory.

## Sections

- `status` — success, error, warning, info, default
- `risk` — critical, high, medium, low, very-low
- `severity` — catastrophic, major, moderate, minor, negligible (alias to risk)
- `accent` — primary, indigo, purple, orange, teal, blue, pink, amber
- `chart` — 8-color sequence (cycle if > 8 series)
- `text` — primary, secondary, tertiary, accent, disabled, icon, muted, subdued
- `background` — main, alt, modal, fill, accent, hover, selected, surface, gradientStop
- `border` — light, dark
- `brand` — primary (#13715B), primaryHover, primaryLight, primaryDark

## Kullanım

```tsx
import { text, background, border, brand, status } from '@/presentation/themes/palette';
```

## Kaynaklar

- raw/docs/color-migration.md (full migration plan)

## İlgili Sayfalar

- [entity-component-chip](entity-component-chip.md)
- [decision-pastel-palette-vs-bright](../decisions/decision-pastel-palette-vs-bright.md)
- [synthesis-frontend-tasarim-pattern](../syntheses/synthesis-frontend-tasarim-pattern.md)
