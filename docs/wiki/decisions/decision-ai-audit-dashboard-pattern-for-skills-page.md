---
title: AI Audit Dashboard Pattern as Reference for All List Pages
tags: [decision, frontend, design-pattern, ai-audit-dashboard, workflows-page, skills-page]
source: raw/docs/color-migration.md
date: 2026-04-30
status: active
---

# Decision: AI Audit Dashboard Pattern → Tüm List Sayfaları

## Bağlam

`AIAuditDashboard` sayfası VerifyWise'ın visual dilinde "altın standart" haline geldi. Diğer list-tarzı sayfalar (Workflows, Skills, vb.) farklı pattern'lerle yazılmıştı — kullanıcı görsel tutarsızlık tespit etti.

## Karar

**Tüm list/dashboard sayfaları AIAuditDashboard pattern'ini kopyalayacak**:

1. **Header** — title (`fontFamily: 'Red Hat Display'`, fontSize 20, fontWeight 600) + description (fontSize 13, secondary color) + right-aligned action button
2. **Stat cards row** — `flex 1 1 0; minWidth 120px`, `cardSx + padding: "8px 14px 14px 14px"`, icon + label + 28px value
3. **Tabs** — `brand.primary` indicator, `Mui-selected` color, FileText icon + label + count Chip
4. **Table** — `cardSx`, TableHead background `background.accent`, headers fontSize 12, fontWeight 600, uppercase, letterSpacing 0.3
5. **Detail Dialog** — `maxWidth: "sm"`, borderRadius 4px, DialogTitle borderBottom divider, DialogActions borderTop divider
6. **Custom Chip** — auto-variant from label

## Sonuçlar

✅ WorkflowsPage redesigned (matches AIAuditDashboard)
✅ SkillsPage redesigned (matches AIAuditDashboard)

## Etkilenen Sayfalar (gelecek)

- Risks page
- Vendors page
- Policies page
- Incidents page
- Audit ledger page

## Reference Implementation

`Clients/src/presentation/pages/AIAuditDashboard/index.tsx`

## Kaynaklar

- raw/docs/color-migration.md
- raw/docs/react-component-guidelines.md

## İlgili Sayfalar

- [synthesis-frontend-tasarim-pattern](../syntheses/synthesis-frontend-tasarim-pattern.md)
- [entity-component-chip](../entities/entity-component-chip.md)
- [entity-themes-palette](../entities/entity-themes-palette.md)
