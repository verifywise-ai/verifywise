---
title: Master Rakip Gap Analysis (Düzeltilmiş Versiyon)
tags: [competitor-research, gap-analysis, mcp, agent-registry, shadow-ai, owasp-agentic, roadmap]
source: raw/competitor-research/master-gap-analysis.md
date: 2026-04-29
status: active
---

# Master Rakip Gap Analysis — Düzeltilmiş

## Amaç

30+ AI GRC rakibi (Credo AI, Holistic AI, OneTrust, ServiceNow, IBM watsonx, Vanta, Drata, Sprinto, Anecdotes, Cisco AI Defense, Lakera, MetricStream, Archer, LogicGate, Hyperproof, AuditBoard/Optro, Saidot, Trustible, Modulos, Monitaur, Asenion, MS Agent 365, Google Vertex, AWS Bedrock, SAS Viya, Salesforce Agent Fabric, Compliance.ai, Secureframe) tarayıp VerifyWise'ın gerçek gap'lerini çıkarmak.

## Ne yapıldı

12 paralel `verifywise-explorer` ajanı codebase doğrulaması yaptı. İlk rakip analizi raporundaki "12 critical gap" iddiası DÜZELTİLDİ. Gerçek tablo:

### ✅ ASLINDA VAR (yanlışlıkla gap denildi)
- Shadow AI — 10 DB tablo, 4 BullMQ, 5 sayfa
- AI Detection — GitHub repo scanner, Bedrock/Azure/Vertex/Databricks regex pattern
- Agent Discovery — plugin-based, 6h sync
- Model Inventory + AI Trust Center
- AI Gateway gerçek-zamanlı guardrails (Python FastAPI)
- 10 Named Persona Agent
- Approval Gateway (XState v5 + json-rules-engine)
- Conversational Analytics (NL Console + Command Planner)

### ⚠️ KISMI VAR
- Agent Memory: 3/4 tip implementee AMA `memoryService.ts` HİÇBİR YERDE import edilmiyor — **CRITICAL bug**
- AIBOM: "AI-BOM" custom format (CycloneDX 1.6 / SPDX 3.0 değil)
- Visual Builder: `@dnd-kit` yüklü ama kullanılmıyor
- MCP Server: UI sayfaları var, gerçek protokol yok

### 🔴 GERÇEKTEN YOK
1. Gerçek MCP protocol (`@modelcontextprotocol/sdk`)
2. OWASP Top 10 for Agentic Applications (Aralık 2025)
3. Memory service bağlantısı (CRITICAL bug)
4. Tiered-Autonomy (recommend/semi/full)
5. Auto-IaC remediation (Vanta-tarzı Terraform/CLI)
6. Cryptographic agent identity (DIDs/IATP)
7. Externalized OPA/Rego
8. Pre-deployment Agent Evaluation Harness
9. Anonymous Bias Reporting Channel (Public Intake var, adapt edilebilir)
10. Regulatory Intelligence Agent

## Önerilen Roadmap

| Phase | Tema | Süre |
|---|---|---|
| Phase 8 | MCP Server + Agent Registry | 1-2 hafta |
| Phase 9 | Bedrock/Foundry/Vertex Auto-Discovery | 3 hafta |
| Phase 10 | Persona Agent Pack + No-code Builder | 3 hafta |
| Phase 11 | Reg Intelligence + AIBOM | 3 hafta |
| Phase 12 | Pre-action Sim + Tiered Autonomy + Eval Harness | 3 hafta |

## Kararlar

- [decision-mcp-http-backend-vs-modelcontextprotocol-sdk](../../decisions/decision-mcp-http-backend-vs-modelcontextprotocol-sdk.md)
- [decision-codebase-verification-before-claiming-gaps](../../decisions/decision-codebase-verification-before-claiming-gaps.md)

## Sorunlar

- [bug-memory-service-not-wired](../../sorunlar/bug-memory-service-not-wired.md)

## Açık konular

- Phase 8-12 implementasyonu henüz başlamadı
- OWASP Agentic Top 10 framework module'ü içerik üretimi gerek
- Memory service bağlama hızlı kazanım (2-3 gün)

## Kaynaklar

- raw/competitor-research/master-gap-analysis.md (orijinal: `~/.claude/plans/tamam-ozaman-pahse-4-kind-flame.md`, 21999 bayt)
- 12 paralel agent raporu (sources/competitor-research/agent-*)

## İlgili Sayfalar

- [synthesis-rakip-gap-analysis](../../syntheses/synthesis-rakip-gap-analysis.md)
- [synthesis-mcp-strateji](../../syntheses/synthesis-mcp-strateji.md)
- [concept-mcp-protocol](../../concepts/concept-mcp-protocol.md)
- [concept-owasp-agentic-top-10](../../concepts/concept-owasp-agentic-top-10.md)
