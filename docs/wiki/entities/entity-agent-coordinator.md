---
title: Coordinator Agent
tags: [entity, agent, coordinator, multi-agent, orchestration]
source: Servers/advisor/agents/coordinator.agent.ts
date: 2026-04-30
status: active
---

# Coordinator Agent

## Tip

Named persona agent — multi-agent orchestrator.

## Konum

- `Servers/advisor/agents/coordinator.agent.ts`
- Registry: `Servers/advisor/agents/agentRegistry.ts`

## Sorumluluk

- `classifyIntent()` — kullanıcının request'ini hangi domain agent'a yönlendirileceğini belirler
- `executeMultiAgent()` — birden fazla agent'a paralel/sıralı request gönderir, response'ları aggregate eder
- Routing engine ile keyword/domain-based discovery

## İlişkili Agent'lar (9)

risk-agent · vendor-agent · evidence-agent · incident-agent · model-agent · policy-agent · compliance-agent · control-assessment-agent · base-agent

## Kullanım

```ts
const coordinator = agentRegistry.get('coordinator');
const result = await coordinator.executeMultiAgent({
  domains: ['risk', 'vendor'],
  query: 'hangi vendor incident'ımıza katkı yaptı?',
});
```

## Kaynaklar

- raw/codebase-claude-md/servers-claude.md
- raw/competitor-research/master-gap-analysis.md
- raw/competitor-research/agent-ideas-brainstorm.md

## İlgili Sayfalar

- [entity-agent-registry](entity-agent-registry.md)
- [synthesis-persona-agent-katalogu](../syntheses/synthesis-persona-agent-katalogu.md)
- [decision-persona-agent-rebrand](../decisions/decision-persona-agent-rebrand.md)
