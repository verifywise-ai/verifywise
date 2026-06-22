---
title: Rakip Gap Analizi — VerifyWise vs 30+ AI GRC Vendor
tags: [synthesis, gap-analysis, competitor-research, roadmap, phase-8-12]
source: raw/competitor-research/master-gap-analysis.md
date: 2026-04-30
status: active
---

# Rakip Gap Analizi (Codebase Doğrulamalı Düzeltilmiş)

## Bağlam

İlk rakip raporu "12 critical gap" iddiasıyla başladı. **5 paralel `verifywise-explorer` ajanı** codebase'i denetledi ve birçok özelliğin **aslında VAR** olduğunu tespit etti. Bu sentez DÜZELTİLMİŞ tabloyu sunar.

## ✅ ASLINDA VAR (yanlışlıkla gap denildi)

| Özellik | Konum |
|---|---|
| Shadow AI Discovery | 10 DB tablo, 4 BullMQ, 5 sayfa, advisor entegrasyonu |
| AI Detection (GitHub scan) | `aiDetection.service.ts:298` (`git clone --depth 1`) + 5dk BullMQ |
| Agent Discovery | `agentDiscoverySync.service.ts` (6h sync, plugin-based) |
| Model Inventory | 5 ilişkili tablo, Sequelize model |
| AI Trust Center | 7 Sequelize model |
| Real-time Guardrails | AI Gateway (Python FastAPI) PII + content filter |
| 10 Named Persona Agent | risk/vendor/evidence/incident/model/policy/compliance/control-assessment/coordinator/base |
| Approval Gateway (XState v5) | 9-state machine + json-rules-engine + 5 default kural |
| Risk-based Auto-approval | info=auto, warning/danger=human |
| Conversational Analytics | NL Console + Command Planner multi-step |
| Agent-to-Agent Handoff | capability-based discovery, multi-agent coordinator |
| Pre-action Preview | 5 action için `preview.ts` |
| AI Evidence Validation | 5-boyutlu skor (relevance, completeness, recency, reliability, specificity) |
| AI Dependency Graph | `@xyflow/react` + AIDepGraph (7 node type) |

## ⚠️ KISMI VAR

| Özellik | Sorun |
|---|---|
| Agent Memory | 3/4 tip implementee AMA `memoryService.ts` HİÇBİR YERDE import edilmiyor — **CRITICAL bug** |
| AIBOM | Custom "AI-BOM" format (CycloneDX 1.6/SPDX 3.0 değil) |
| Visual Builder | `@dnd-kit/*` paketler YÜKLÜ ama SkillsPage/WorkflowsPage'de kullanılmıyor |
| MCP Server | UI sayfaları var (AI Gateway), `@modelcontextprotocol/sdk` YOK — HTTP POST |
| FAIR Risk | `ale_estimate`/`residual_ale`/`total_loss_likely` alanları var, formula chain net değil |
| Frontend Trace Viewer | Backend Langfuse VAR, UI YOK |
| Drift Detection | Risk count + compliance score var, gerçek model drift YOK |

## 🔴 GERÇEKTEN YOK

1. **OWASP Top 10 for Agentic Applications (ASI01-ASI10)** — Aralık 2025'te çıktı, framework module yok
2. **Memory service bağlantısı** — CRITICAL bug, 2-3 günlük iş
3. **Tiered-Autonomy** (recommend/semi/full per agent)
4. **Auto-IaC Remediation** (Vanta-tarzı Terraform/CLI)
5. **Cryptographic Agent Identity** (DIDs/IATP)
6. **Externalized OPA/Rego policy bundle**
7. **Pre-deployment Agent Evaluation Harness**
8. **Anonymous Bias Reporting Channel** (Public Intake var, adapt edilebilir)
9. **Regulatory Intelligence Agent** (RSS/JSON feed scraper)
10. **Real cloud connectors** (AWS Bedrock SDK çağrı vs regex pattern)

## Önerilen Roadmap

| Phase | Tema | Süre |
|---|---|---|
| **8** | MCP Server + Agent Registry | 1-2 hafta |
| **9** | Bedrock/Foundry/Vertex Auto-Discovery | 3 hafta |
| **10** | Persona Agent Pack + No-code Builder | 3 hafta |
| **11** | Reg Intelligence + AIBOM | 3 hafta |
| **12** | Pre-action Sim + Tiered Autonomy + Eval Harness | 3 hafta |

**Toplam ~3 ay** — rakiplerle bleeding-edge parity için.

## Kaynaklar

- [master-gap-analysis](../sources/competitor-research/2026-04-29-master-gap-analysis.md)
- [agent-trends-12](../sources/competitor-research/2026-04-29-agent-trends-12.md)
- [agent-niche-ai-gov](../sources/competitor-research/2026-04-29-agent-niche-ai-gov.md)
- [agent-enterprise-grc](../sources/competitor-research/2026-04-29-agent-enterprise-grc.md)

## İlgili Sayfalar

- [synthesis-mcp-strateji](synthesis-mcp-strateji.md)
- [synthesis-persona-agent-katalogu](synthesis-persona-agent-katalogu.md)
- [synthesis-compliance-framework-coverage](synthesis-compliance-framework-coverage.md)
- [bug-memory-service-not-wired](../sorunlar/bug-memory-service-not-wired.md)
- [concept-mcp-protocol](../concepts/concept-mcp-protocol.md)
- [concept-owasp-agentic-top-10](../concepts/concept-owasp-agentic-top-10.md)
