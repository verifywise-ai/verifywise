---
title: Frontend Tasarım Pattern'i — AIAuditDashboard Reference
tags: [synthesis, frontend, design-system, ai-audit-dashboard, chip-component, palette]
source: raw/docs/color-migration.md
date: 2026-04-30
status: active
---

# Frontend Tasarım Pattern'i

## Altın Standart: AIAuditDashboard

`Clients/src/presentation/pages/AIAuditDashboard/index.tsx` — VerifyWise'ın görsel dilinde **canonical reference**. Tüm list/dashboard sayfaları bu pattern'i kopyalar.

## 6 Bileşenli Pattern

### 1. Header (top section)
```tsx
<Stack direction="row" justifyContent="space-between" alignItems="center" mb="8px">
  <Box>
    <Typography sx={{ fontWeight: 600, fontSize: 20, fontFamily: "'Red Hat Display', 'Geist', sans-serif", color: textColors.primary }}>
      Sayfa Başlığı
    </Typography>
    <Typography sx={{ fontSize: 13, color: textColors.secondary, mt: 0.25 }}>
      Açıklama (en fazla iki satır)
    </Typography>
  </Box>
  {/* Right action button — primary green */}
</Stack>
```

### 2. Stat Cards Row
```tsx
<Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px", mb: "8px",
            "& > *": { flex: "1 1 0", minWidth: "120px" } }}>
  {statCards.map(card => (
    <Stack sx={{ ...cardSx, borderRadius: 2, padding: "8px 14px 14px 14px" }}>
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Box sx={{ color: card.color }}>{card.icon}</Box>
        <Typography sx={{ fontSize: 12, color: textColors.secondary, fontWeight: 500 }}>
          {card.label}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: 28, fontWeight: 700, color: textColors.primary, lineHeight: 1.2 }}>
        {card.value}
      </Typography>
    </Stack>
  ))}
</Box>
```

### 3. Tabs (filter)
```tsx
<Tabs value={activeTab}
      TabIndicatorProps={{ style: { backgroundColor: brand.primary } }}
      sx={{ ..., "& .Mui-selected": { color: brand.primary } }}>
  <Tab label={
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <FileText size={14} />
      <span>{label}</span>
      {count > 0 && <Chip label={String(count)} backgroundColor={background.hover} />}
    </Stack>
  }/>
</Tabs>
```

### 4. Table
```tsx
<Card elevation={0} sx={cardSx}>
  <TableContainer>
    <Table size="small">
      <TableHead>
        <TableRow sx={{ backgroundColor: background.accent }}>
          {headers.map(h => (
            <TableCell sx={{ fontSize: 12, fontWeight: 600, color: textColors.secondary, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${borderPalette.dark}` }}>
              {h}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>...</TableBody>
    </Table>
  </TableContainer>
</Card>
```

### 5. Custom `Chip` Component
- Auto-variant from label (`<Chip label="Completed" />` → success variant)
- Light pastel gradient + matching border
- Sizes: small (24px) / medium (34px)

### 6. Detail Dialog
```tsx
<Dialog maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: "4px", border: `1px solid ${borderPalette.dark}` } }}>
  <DialogTitle sx={{ ..., borderBottom: `1px solid ${borderPalette.light}` }}>...</DialogTitle>
  <DialogContent>...</DialogContent>
  <DialogActions sx={{ borderTop: `1px solid ${borderPalette.light}` }}>...</DialogActions>
</Dialog>
```

## cardSx (shared style)

```tsx
const cardSx = {
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: "4px",
  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
};
```

## Renk Kuralları

- **Tek renkli element** workflow definition card'da: yeşil "Run" butonu
- Geri kalan: muted gri / pastel
- State chip'leri: `getStateBg(state)` + `getStateColor(state)` helper'ları
- Brand: `brand.primary = #13715B` (VerifyWise yeşili)

## Bu Pattern'i Uygulayan Sayfalar

| Sayfa | Status |
|---|---|
| AIAuditDashboard | ✅ Reference |
| AIContentReview | ✅ |
| WorkflowsPage | ✅ Redesigned (Phase 6) |
| SkillsPage | ✅ Redesigned (Phase 7) |
| _Risks page_ | ⏳ Future |
| _Vendors page_ | ⏳ Future |
| _Policies page_ | ⏳ Future |
| _Incidents page_ | ⏳ Future |

## Pre-Delivery Checklist

- [ ] `cardSx` kullanıldı mı?
- [ ] Custom Chip (MUI Chip değil)?
- [ ] `brand.primary` indicator + `Mui-selected` color?
- [ ] TableHead background `background.accent`?
- [ ] Header fontFamily Red Hat Display?
- [ ] Tüm hex'ler palette'den import edildi mi?

## Kaynaklar

- raw/docs/color-migration.md
- raw/docs/react-component-guidelines.md
- AIAuditDashboard/index.tsx (canonical reference)

## İlgili Sayfalar

- [decision-ai-audit-dashboard-pattern-for-skills-page](../decisions/decision-ai-audit-dashboard-pattern-for-skills-page.md)
- [decision-pastel-palette-vs-bright](../decisions/decision-pastel-palette-vs-bright.md)
- [decision-chip-component-canonical](../decisions/decision-chip-component-canonical.md)
- [entity-component-chip](../entities/entity-component-chip.md)
- [entity-themes-palette](../entities/entity-themes-palette.md)
