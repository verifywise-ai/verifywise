---
title: Agent Registry
tags: [entity, agent-registry, capability, discovery]
source: Servers/advisor/agents/agentRegistry.ts
date: 2026-04-30
status: active
---

# Agent Registry

## Tip

Capability-based agent discovery layer.

## Konum

`Servers/advisor/agents/agentRegistry.ts`

## Sorumluluk

- 10 named agent'ı in-memory tutar (risk, vendor, evidence, incident, model, policy, compliance, control-assessment, coordinator, base)
- `findAgentsByDomain(domain: string)` — domain'e göre uygun agent listesi
- `findAgentsByKeywords(keywords: string[])` — anahtar kelimelerle eşleşen agent
- Tip güvenliği: her agent `BaseAgent` interface'ini implement eder

## Kullanım

```ts
const agents = agentRegistry.findAgentsByDomain('risk');
// → [risk-agent, compliance-agent]
```

## Kaynaklar

- raw/codebase-claude-md/servers-claude.md
- raw/phase-docs/ai-implementation-plan-phase0.md (agent registry foundation)

## İlgili Sayfalar

- [entity-agent-coordinator](entity-agent-coordinator.md)
- [decision-persona-agent-rebrand](../decisions/decision-persona-agent-rebrand.md)
