---
title: Custom Chip Component
tags: [entity, frontend, component, chip, palette, auto-variant]
source: Clients/src/presentation/components/Chip.tsx
date: 2026-04-30
status: active
---

# Custom Chip Component

## Tip

Frontend canonical badge component.

## Konum

`Clients/src/presentation/components/Chip.tsx`

## Sorumluluk

- Light pastel gradient + matching border
- **Auto-variant from label** — "completed" → success, "failed" → error, "pending" → warning, vb.
- Risk levels (critical/high/medium/low/very-low)
- Custom backgroundColor + textColor override
- Size: small (24px) / medium (34px)

## API

```tsx
<Chip label="Completed" />              // auto-detects success variant
<Chip label="High" variant="high" />    // explicit risk variant
<Chip label="Custom" backgroundColor="#E8F5E9" textColor="#2E7D32" />
```

## Kullanan sayfalar

- AIAuditDashboard (period chips, table state badges)
- AIContentReview
- WorkflowsPage (state badges)
- SkillsPage (source badges)
- Tüm risk/incident/policy listeleri

## Kaynaklar

- raw/docs/color-migration.md
- raw/docs/react-component-guidelines.md

## İlgili Sayfalar

- [entity-themes-palette](entity-themes-palette.md)
- [decision-chip-component-canonical](../decisions/decision-chip-component-canonical.md)
- [synthesis-frontend-tasarim-pattern](../syntheses/synthesis-frontend-tasarim-pattern.md)
