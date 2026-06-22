---
title: Quantitative Risk Assessment (FAIR) — Feature Research
tags: [fair, quantitative-risk, ale, risk-assessment, feature-flag]
source: raw/docs/quantitative-risk-research.md
date: 2026-04-30
status: active
---

# Quantitative Risk Assessment

## Amaç

VerifyWise'ın FAIR (Factor Analysis of Information Risk) tabanlı kantitatif risk değerlendirme özelliğini dokümante et.

## Ne yapıldı

### Feature Flag (Settings > Features)
- Org-level toggle: "Quantitative Risk Assessment"
- Sadece Admin role değiştirebilir
- Field: `risk_assessment_mode = "qualitative" | "quantitative"` (default: `qualitative`)
- API:
  - `GET /api/quantitative-risks/assessment-mode`
  - `PUT /api/quantitative-risks/assessment-mode` body: `{ mode: "quantitative" }`

### Enabled olunca
- Risk form'una 3. tab "**Quantitative**" gelir (Risks + Mitigation tab'larına ek)
- Dashboard'a 3 portfolio card row eklenir
- FAIR alanları: ALE estimate, residual ALE, total loss likely, control effectiveness, ROI

### Form
`QuantitativeRiskForm` komponenti — TEF, SLE, ARO formula chain (kısmi).

## Değişen dosyalar

- `Servers/domain.layer/models/risk/risk.model.ts` (L:277-293) — quant alanlar
- `Servers/domain.layer/models/organization/organization.model.ts` (L:91-93) — `risk_assessment_mode`
- `Clients/src/application/repository/quantitativeRisk.repository.ts`
- `Clients/.../components/QuantitativeRiskForm/`

## Kararlar

- [decision-fair-vs-monetary-only](../../decisions/decision-fair-vs-monetary-only.md)

## Açık konular

- FAIR formula chain net değil (TEF/SLE/ARO formal hesaplama)
- Modulos AI'da "monetary risk quantification" var — VerifyWise rakip için tam parity için formula chain tamamlanmalı

## Kaynaklar

- raw/docs/quantitative-risk-research.md (orijinal: 14833 bayt, 2026-03-17)

## İlgili Sayfalar

- [concept-fair-risk-quantification](../../concepts/concept-fair-risk-quantification.md)
- [synthesis-rakip-gap-analysis](../../syntheses/synthesis-rakip-gap-analysis.md)
