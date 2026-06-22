---
title: OWASP Top 10 for Agentic Applications (ASI01-ASI10)
tags: [concept, owasp, agentic, security, framework, asi01]
source: raw/competitor-research/agent-trends-12.md
date: 2026-04-30
status: active
---

# OWASP Top 10 for Agentic Applications

## Tanım

OWASP'ın **Aralık 2025**'te yayınladığı, autonomous AI agents için top 10 güvenlik riski. ASI01-ASI10 kodlarıyla.

## Risk Listesi (özet)

| Kod | Risk |
|---|---|
| ASI01 | Goal Hijacking — agent'ın hedefini değiştirme |
| ASI02 | Tool Misuse — agent tool'larının yetkisiz kullanımı |
| ASI03 | Memory Poisoning — agent memory'sine kötü niyetli enjeksiyon |
| ASI04 | Cascading Failures — multi-agent koordinasyon ve hata yayılımı |
| ASI05 | Identity Theft — agent kimliğinin taklit edilmesi |
| ASI06 | Excessive Agency — Principle of Least Agency ihlali |
| ASI07 | Deceptive Behavior — agent'ın yanıltıcı çıktı üretmesi |
| ASI08 | Inter-Agent Trust — güvensiz agent-to-agent iletişim |
| ASI09 | Supply Chain — third-party agent/tool risk |
| ASI10 | Observability Gaps — gözetim eksikliği |

## "Principle of Least Agency"

Agent'a verilen yetki, hedefini gerçekleştirmek için **minimum** olmalı. Excessive Agency = ASI06.

## VerifyWise Durum

❌ **Henüz framework module olarak yok** (LLM Top 10 ve ML Top 10 var, Agentic eksik)

### Mevcut OWASP framework'leri:
- ✅ OWASP LLM Top 10 (LLM01-LLM10) — `Servers/config/llmVulnerabilityPatterns.ts`
- ✅ OWASP ML Top 10 (ML01-ML10) — migration kolonları + complianceMapping
- ❌ **OWASP Agentic Top 10** — eklenecek (Phase 8/10 önerisi)

### Eklemek için (1 hafta — çoğu içerik)
- Migration: `agentic_top_10_struct` tablosu
- 10 control row (ASI01-ASI10) + Principle of Least Agency
- Frontend `Compliance` tab'ı

## Rakip Adoption

- **Modulos** — first-class framework olarak shipped
- **Monitaur** — referans alıyor

## Kaynaklar

- raw/competitor-research/agent-trends-12.md
- raw/competitor-research/agent-niche-ai-gov.md (Modulos)
- OWASP: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/

## İlgili Sayfalar

- [synthesis-compliance-framework-coverage](../syntheses/synthesis-compliance-framework-coverage.md)
- [synthesis-rakip-gap-analysis](../syntheses/synthesis-rakip-gap-analysis.md)
- [decision-persona-agent-rebrand](../decisions/decision-persona-agent-rebrand.md)
