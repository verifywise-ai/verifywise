---
title: Agentic Governance
tags: [concept, agentic, governance, autonomous-agents, market-segment]
source: raw/competitor-research/master-gap-analysis.md
date: 2026-04-30
status: active
---

# Agentic Governance

## Tanım

Autonomous AI agent'ların yönetişim, izleme ve uyumluluğu için pratikler ve teknolojiler. 2026 itibarıyla AI GRC pazarında **named product pillar** — feature değil, market segment.

## Tetikleyici Reglemanlar

- **EU AI Act** (Aug 2026 enforcement)
- **Colorado AI Act** (Jun 2026)
- **Singapore Agentic AI framework**
- **CSA Agentic NIST AI RMF Profile v1** (Feb 2026)

## Tipik Bileşenler

1. **Agent Inventory / Registry** — tüm agent'lar katalog
2. **Approval Gateway** — yazma operasyonları için onay
3. **Audit Trail** — her aksiyon kalıcı kayıt
4. **Memory Governance** — GDPR-uyumlu memory
5. **Tool Catalog** — agent'lar hangi tool'ları kullanabilir
6. **Identity** — cryptographic agent identity (DID)
7. **Runtime Guardrails** — sub-second LLM/tool filter
8. **Eval Harness** — pre-deployment + continuous

## VerifyWise'ın Agentic Governance Yığını

✅ **Var:**
- AI Action Approval Gateway (Phase 2 — XState v5 + json-rules-engine)
- Audit Log (`ai_action_audit_log`)
- 10 named persona agent
- Coordinator + multi-agent
- Proactive AI (Phase 4)
- Workflow engine (Phase 6)
- AI Skills + Plugin (Phase 7)

⚠️ **Kısmi:**
- Memory governance (3/4 tip + bağlanmamış)
- AI Trust Center (UI var, agent inventory primitive eksik)

❌ **Yok:**
- Cryptographic identity (DID/IATP)
- Runtime guardrails (sub-second)
- Pre-deployment eval harness
- Externalized OPA/Rego policy bundle

## Rakip Markalama

- **Trustible** — "Agentic Governance" pillar (named)
- **Modulos** — Agent Inventory Primitives + Scout Copilot
- **Holistic AI** — Sentinel + Operative dual-mode
- **Asenion** — Testing Agents (otonom probe)

## Kaynaklar

- raw/competitor-research/master-gap-analysis.md
- raw/competitor-research/agent-trends-12.md
- raw/competitor-research/agent-niche-ai-gov.md

## İlgili Sayfalar

- [synthesis-rakip-gap-analysis](../syntheses/synthesis-rakip-gap-analysis.md)
- [synthesis-phase-1-7-mimari](../syntheses/synthesis-phase-1-7-mimari.md)
- [concept-mcp-protocol](concept-mcp-protocol.md)
- [concept-owasp-agentic-top-10](concept-owasp-agentic-top-10.md)
