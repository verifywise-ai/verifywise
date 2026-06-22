---
title: FAIR Risk Quantification
tags: [concept, fair, quantitative-risk, ale, tef, sle, aro, monetary]
source: raw/docs/quantitative-risk-research.md
date: 2026-04-30
status: active
---

# FAIR (Factor Analysis of Information Risk)

## Tanım

FAIR — risk'i **monetary** (parasal) terimlerle ölçen quantitative framework. Qualitative (high/medium/low) yerine USD cinsinden expected loss hesaplanır.

## Temel Kavramlar

| Terim | Anlam |
|---|---|
| **TEF** | Threat Event Frequency — saldırı/olay olma frekansı (yıllık) |
| **SLE** | Single Loss Expectancy — bir olay başına beklenen kayıp ($) |
| **ARO** | Annualized Rate of Occurrence — yıllık beklenen olay sayısı |
| **ALE** | Annualized Loss Expectancy — yıllık beklenen toplam kayıp = SLE × ARO |
| **Residual Risk** | Mevcut control'ler sonrası kalan risk |
| **Control Effectiveness** | Control'lerin risk azaltma yüzdesi |

## VerifyWise Implementation

✅ **Var:**
- `risks.ale_estimate`, `residual_ale`, `total_loss_likely`, `control_effectiveness`
- `organizations.risk_assessment_mode = 'qualitative' | 'quantitative'`
- Toggle: Settings > Features
- `QuantitativeRiskForm` komponenti
- API: `GET/PUT /api/quantitative-risks/assessment-mode`

⚠️ **Eksik:**
- TEF, SLE, ARO formula chain net implement edilmemiş
- Monte Carlo simulation yok
- Insurance quote helper yok

## Rakip Karşılaştırması

| Vendor | FAIR Support |
|---|---|
| Modulos AI | ✅ "Monetary risk quantification" first-class |
| VerifyWise | ⚠️ Kısmı (alanlar var, formula yok) |
| Çoğu rakip | ❌ Sadece qualitative |

## Phase 12+ Önerisi

- TEF/SLE/ARO formula chain tamamla
- Monte Carlo Risk Simulator agent
- Scenario Planner agent
- Insurance Quote Helper agent

## Kaynaklar

- raw/docs/quantitative-risk-research.md
- raw/competitor-research/agent-niche-ai-gov.md (Modulos)
- The Open Group FAIR standard

## İlgili Sayfalar

- [synthesis-rakip-gap-analysis](../syntheses/synthesis-rakip-gap-analysis.md)
- [synthesis-persona-agent-katalogu](../syntheses/synthesis-persona-agent-katalogu.md)
