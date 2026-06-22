---
title: Enterprise GRC — MetricStream, Archer, LogicGate, Hyperproof, AuditBoard/Optro
tags: [competitor-research, enterprise-grc, metricstream, archer, logicgate, hyperproof, optro]
source: raw/competitor-research/agent-enterprise-grc.md
date: 2026-04-29
status: active
---

# Enterprise GRC — Büyük Oyuncular

## Amaç

5 büyük enterprise GRC platformunu agentic özelliklerine göre derinlemesine incele.

## Ne yapıldı

### MetricStream — AiSPIRE
- LLM + GRC ontology knowledge graph
- Continuous control sensing, duplicate-control detection
- Multi-agent orchestration via MCP — örnek chain: Cyber-threat → Vendor exposure → Compliance reporting → Board alert
- Platform-ops agents (Admin/Support/QA/Upgrade)

### Archer — Assurance AI + Engage
- Auto-maps regulatory updates → controls/policies
- Gap & conflict analysis, auto-generate missing controls (27-language)
- **Engage** — vendors don't need Archer accounts (genai populates assessments)
- AI Agent Workforce Charter

### LogicGate — Spark AI + Config Newton
- Spark: Autofill, Auto Evidence Testing, Reporting Insights, Record Linking Recommendations
- **Config Newton** — "World's first Agentic GRC Engineer" — meta-agent that authors workflows
- Auto-remediation chain: Tenable/Black Kite ingest → Spark maps to control → updates risk score → triggers workflow

### Hyperproof — AI Guided Experiences (RSAC 2026)
- **Suggested Links agent** — "Link once, map everywhere"
- Four-agent orchestration: Discover, Validate, Advise, Act

### AuditBoard / Optro — Accelerate
- NL workflows, continuous auditing, document intelligence, agentic AI
- Three-agent fieldwork chain: Data Analyst → Senior Auditor → Audit Manager
- Risk-based sampling agents — weeks-to-hours control testing

## VerifyWise için ders

| Özellik | VerifyWise Durum |
|---|---|
| Knowledge graph (controls/risks/evidence) | Kısmı (ilişkiler var ama graph değil) |
| Multi-agent orchestration | ✅ var (Coordinator + 9 named agents) |
| MCP for inter-agent | ❌ HTTP backend |
| Vendor-facing portal | ⚠️ Share link var, dedicated portal yok |
| Workflow auto-author (Config Newton) | ❌ |
| Suggested Links | ❌ |
| 3/4-agent fieldwork triad | Coordinator var, formalize edilmemiş |

## Açık konular

- LogicGate'in "Config Newton"-tarzı meta-agent (workflow author) için Phase 10+ önerisi
- Hyperproof "Suggested Links" tek başına 1-haftalık feature

## Kaynaklar

- raw/competitor-research/agent-enterprise-grc.md (orijinal: 14066 bayt)
- MetricStream AiSPIRE: https://www.metricstream.com/products/AiSPIRE.html
- LogicGate Spark AI: https://www.logicgate.com/platform/features/spark-ai/
- Hyperproof AI Guided Experiences: https://www.prnewswire.com/news-releases/hyperproof-launches-ai-guided-experiences-...

## İlgili Sayfalar

- [synthesis-rakip-gap-analysis](../../syntheses/synthesis-rakip-gap-analysis.md)
- [synthesis-persona-agent-katalogu](../../syntheses/synthesis-persona-agent-katalogu.md)
