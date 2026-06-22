---
title: Compliance Framework Coverage — VerifyWise vs Standartlar
tags: [synthesis, compliance, eu-ai-act, iso-42001, iso-27001, nist-ai-rmf, owasp, gdpr]
source: raw/competitor-research/master-gap-analysis.md
date: 2026-04-30
status: active
---

# Compliance Framework Coverage

## Mevcut Framework Desteği

| Framework | Status | Not |
|---|---|---|
| **EU AI Act** | ✅ TAM | Article 10 (data governance), Article 12 (record keeping), Article 27 (FRIA), Article 49 (registry), Article 52 (transparency), Article 57 (sandbox) |
| **ISO 42001** | ✅ TAM | AI Management System |
| **ISO 27001** | ✅ TAM | Information Security |
| **NIST AI RMF** | ✅ TAM | GOVERN/MAP/MEASURE/MANAGE |
| **OWASP LLM Top 10** | ✅ TAM | LLM01-LLM10 — `Servers/config/llmVulnerabilityPatterns.ts` |
| **OWASP ML Top 10** | ✅ TAM | ML01-ML10 — migration kolonları + complianceMapping |
| **GDPR** | ✅ TAM | Article 5-99 + DPO |
| **Plugin Frameworks** | ✅ Varsayılan dışı | SOC 2, HIPAA, NIST 800-53, SOX, PCI DSS — plugin marketplace'ten |

## ❌ Eksik Frameworks

| Framework | Yıl | Etkisi |
|---|---|---|
| **OWASP Top 10 for Agentic Applications** (ASI01-ASI10) | Aralık 2025 | YÜKSEK — Modulos, Monitaur referans alıyor |
| **Colorado AI Act** (SB 24-205) | Jun 2026 | YÜKSEK — US enterprise zorunlu |
| **NYC LL144** | Aktif | ORTA — bias audit (HR sistemleri) |
| **EU DORA** | 2025 | ORTA — Digital Operational Resilience (financial) |
| **CSA Agentic NIST AI RMF Profile v1** | Feb 2026 | ORTA — bridging artifact |
| **Singapore Agentic AI Framework** | 2026 | DÜŞÜK-ORTA — APAC enterprise |
| **NIST AI Agent Standards** | Feb 2026 | YÜKSEK — gelecekteki US standardı |

## Phase 8/10 Eklemeler

| Phase | Framework | Effort |
|---|---|---|
| 10 | OWASP Agentic Top 10 (ASI01-ASI10) | 1 hafta (içerik) |
| 11 | Colorado AI Act + NYC LL144 | 2 hafta |
| 12 | EU DORA | 2 hafta |
| 13+ | Sektör-spesifik (HIPAA AI, SR 11-7, FedRAMP High) | 3-4 hafta her biri |

## Industry Specialist Agents (Önerilen)

- Healthcare AI Compliance Agent (HIPAA + FDA SaMD)
- Banking AI Compliance Agent (SR 11-7, Basel, FFIEC)
- EdTech AI Compliance Agent (FERPA, COPPA)
- Pharma AI Compliance Agent (FDA Drug AI)
- Defense AI Compliance Agent (DoD AI Ethical Principles, FedRAMP High)
- Insurance AI Compliance Agent (NAIC Model Bulletin)

## Kaynaklar

- [master-gap-analysis](../sources/competitor-research/2026-04-29-master-gap-analysis.md)
- [agent-trends-12](../sources/competitor-research/2026-04-29-agent-trends-12.md)
- [dataset-inventory-implementation](../sources/docs/2026-04-30-dataset-inventory-implementation.md) (EU AI Act Article 10)

## İlgili Sayfalar

- [concept-owasp-agentic-top-10](../concepts/concept-owasp-agentic-top-10.md)
- [concept-fair-risk-quantification](../concepts/concept-fair-risk-quantification.md)
- [synthesis-rakip-gap-analysis](synthesis-rakip-gap-analysis.md)
