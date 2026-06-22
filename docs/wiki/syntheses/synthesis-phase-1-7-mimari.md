---
title: Phase 1-7 AI Agentic Stack Mimari Genel Bakışı
tags: [synthesis, phase-1, phase-2, phase-3, phase-4, phase-5, phase-6, phase-7, architecture, agentic]
source: raw/phase-docs/ai-implementation-plan.md
date: 2026-04-30
status: active
---

# Phase 1-7 AI Agentic Stack — Mimari Genel Bakış

## Vizyon

VerifyWise AI Advisor → AI Operating System dönüşümü. Read-only Q&A'dan otonom uyum operasyonlarına geçiş.

## Yığın Görseli

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Phase 7 — AI Skills + Plugin Auto-Discovery         │
│  (HTTP/MCP-style backend, dynamic tool loader, plugin aiSkill)       │
├─────────────────────────────────────────────────────────────────────┤
│                  Phase 6 — Compliance Autopilot (Workflow Engine)    │
│  (modelDeployment, policyRenewal, frameworkGap; branching states)    │
├─────────────────────────────────────────────────────────────────────┤
│                  Phase 5 — Natural Language Command Console          │
│  (generateObject + Zod plan + executor with placeholder substitution)│
│  ⚠️ Standalone page kaldırıldı — chat'in multi-step capability'sine taşındı │
├─────────────────────────────────────────────────────────────────────┤
│                  Phase 4 — Proactive AI                              │
│  (BullMQ cron + 6 scheduled jobs + Teams/Slack/Email/In-app)         │
│  + Statistical anomaly detection (RISK_ANOMALY_MULTIPLIER = 2)       │
├─────────────────────────────────────────────────────────────────────┤
│                  Phase 3 — Multi-Step Orchestration                  │
│  (Coordinator agent + 9 named domain agents)                         │
├─────────────────────────────────────────────────────────────────────┤
│                  Phase 2 — AI Action Approval Gateway                │
│  (XState v5 + json-rules-engine + ai_action_audit_log)               │
│  9 states: idle → evaluate → auto/pending/reject → exec → done/fail  │
├─────────────────────────────────────────────────────────────────────┤
│                  Phase 1 — Tool Catalogue Expansion                  │
│  (47 read-only → 263 tools, 157 read + 106 write)                    │
├─────────────────────────────────────────────────────────────────────┤
│                  Phase 0 — Foundation                                │
│  (Evidence Agent + Readiness + AI Content Review + Agent Registry)   │
└─────────────────────────────────────────────────────────────────────┘
```

## Phase Detayları

### Phase 0 — Foundation
- 4 yeni tablo (`20260325161242-create-phase0-ai-tables.js`)
- Document parsers (PDF, DOCX)
- Agent registry pattern
- AI Content Review (EU AI Act Article 52)

### Phase 1 — Tool Catalogue
- 263 tool target (157 read + 106 write)
- Vercel AI SDK toolBridge
- 30+ domain (risk, vendor, model, policy, incident, evidence, framework, training, automation, vb.)

### Phase 2 — Approval Gateway
- XState v5 state machine (9 states)
- json-rules-engine (priority-based)
- 5 default kural (info-auto, low-risk-create, read-ops, warning-required, danger-required)
- `ai_action_audit_log` table

### Phase 3 — Multi-Agent
- Coordinator agent — `classifyIntent` + `executeMultiAgent`
- 9 named agents (risk, vendor, evidence, incident, model, policy, compliance, control-assessment, base)
- Capability-based discovery
- Vercel AI SDK `stopWhen: stepCountIs(15)`

### Phase 4 — Proactive AI
- 6 BullMQ scheduled jobs
- Teams webhook (Adaptive Card) + Slack + Email (MJML) + In-app (SSE + Redis pub/sub)
- Anomaly detection (`detectRiskAnomaly`, `detectComplianceScoreDrop`)
- 4 yeni MJML template

### Phase 5 — Command Console
- Vercel AI SDK `generateObject()` + Zod plan schema
- Sequential walker + `{{step_N.result.x}}` placeholder substitution
- `ai_command_plans` table
- ⚠️ **Standalone page sonradan kaldırıldı** (Chat zaten multi-step ile yetkin)

### Phase 6 — Compliance Autopilot
- Workflow engine (`engine.ts` step runner: ok/skip/branch/pause/fail)
- 3 workflow definition (modelDeployment, policyRenewal, frameworkGap)
- `ai_workflow_runs` table
- WorkflowsPage (AI Audit pattern'inde redesigned)

### Phase 7 — AI Skills + Plugin Auto-Discovery
- `ai_skills` table (skill_key, source, backend, tools JSONB)
- `dynamicToolLoader.ts` — `loadSkillsForOrg(orgId, reservedNames)`
- Plugin manifest `aiSkill` field auto-registers skill
- AI Gateway MCP UI sayfaları (gerçek protocol Phase 8'de)

## Eksikler (Roadmap)

Phase 8-12 önerileri için bkz. [synthesis-rakip-gap-analysis](synthesis-rakip-gap-analysis.md).

## Kaynaklar

- [ai-implementation-plan](../sources/phase-docs/2026-04-30-ai-implementation-plan.md)
- [master-gap-analysis](../sources/competitor-research/2026-04-29-master-gap-analysis.md)

## İlgili Sayfalar

- [synthesis-rakip-gap-analysis](synthesis-rakip-gap-analysis.md)
- [synthesis-mcp-strateji](synthesis-mcp-strateji.md)
- [synthesis-persona-agent-katalogu](synthesis-persona-agent-katalogu.md)
- [decision-xstate-v5-for-approval-gateway](../decisions/decision-xstate-v5-for-approval-gateway.md)
- [decision-bullmq-cron-pattern](../decisions/decision-bullmq-cron-pattern.md)
- [decision-mcp-http-backend-vs-modelcontextprotocol-sdk](../decisions/decision-mcp-http-backend-vs-modelcontextprotocol-sdk.md)
