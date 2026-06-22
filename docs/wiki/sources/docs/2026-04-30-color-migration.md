---
title: Color Palette Migration — Unified Pastel Identity
tags: [design-system, palette, theming, chip-component, mui]
source: raw/docs/color-migration.md
date: 2026-04-30
status: active
---

# Color Palette Migration

## Amaç

Tüm hardcoded hex renkleri unified palette'e (`Clients/src/presentation/themes/palette.ts`) taşımak — Governance, LLM Evals, AI Detection, Shadow AI, Model Inventory dahil 4 modül için tutarlı pastel görsel kimlik.

## Ne yapıldı

### Design Principles
1. **Chip component canonical** — light pastel bg + muted text her status indicator için hedef
2. **No bright Tailwind-500 colors** — `#EF4444`, `#F59E0B`, `#10B981`, `#3B82F6` muted versiyonlarla değiştirilir
3. **One import, one source** — her dosya `@/presentation/themes/palette` import eder
4. **Theme alignment** — `light.ts` ve `alerts.ts` da `palette.ts`'i refere eder

### Palette Summary

| Semantic | Background | Text |
|---|---|---|
| success | `#E6F4EA` | `#138A5E` |
| error | `#FFD6D6` | `#D32F2F` |
| warning | `#FFF8E1` | `#795548` |
| info | `#E3F2FD` | `#1565C0` |
| default | `#F3F4F6` | `#6B7280` |

### Risk Levels
- critical, high, medium, low, very-low — her biri pastel bg + matching text + border

### Brand
- primary: `#13715B` (VerifyWise yeşili)
- primaryHover: `#0F5A47`
- primaryLight: `#E6F0EC`

## Değişen dosyalar

- `Clients/src/presentation/themes/palette.ts` — single source of truth
- `Clients/src/presentation/components/Chip.tsx` — auto-variant from label

## Kararlar

- [decision-pastel-palette-vs-bright](../../decisions/decision-pastel-palette-vs-bright.md)
- [decision-chip-component-canonical](../../decisions/decision-chip-component-canonical.md)

## Kaynaklar

- raw/docs/color-migration.md (orijinal: 9317 bayt)

## İlgili Sayfalar

- [synthesis-frontend-tasarim-pattern](../../syntheses/synthesis-frontend-tasarim-pattern.md)
- [entity-component-chip](../../entities/entity-component-chip.md)
- [entity-themes-palette](../../entities/entity-themes-palette.md)
