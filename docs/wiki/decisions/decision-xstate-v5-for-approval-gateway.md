---
title: XState v5 for AI Action Approval Gateway
tags: [decision, xstate, phase-2, approval-gateway, state-machine]
source: raw/phase-docs/ai-implementation-plan.md
date: 2026-04-30
status: active
---

# Decision: XState v5 ile AI Action Approval Gateway

## Bağlam

Phase 2'de AI Action Approval Gateway tasarlanıyor. AI advisor'ın write operasyonları (createRisk, deleteRisk, updateTask, vb.) için onay akışı gerek.

## Karar

**XState v5** + **json-rules-engine** kombinasyonu seçildi.

## Gerekçe

- XState v5 — formal state machine, predictable transitions
- 9 state: idle → evaluate → auto_approve / pending_approval / auto_reject → executing → completed / failed
- json-rules-engine — auto-approve kuralları için priority-based rule evaluation
- Default kurallar:
  - `info-level-auto-approve`
  - `low-risk-single-create`
  - `read-ops-auto-approve`
  - `warning-level-requires-approval`
  - `danger-level-requires-approval`

## Sonuçlar

✅ State machine her transition'ı `state_history JSONB` kolonuna kaydeder
✅ Audit log otomatik (her transition = bir audit entry)
✅ Risk-based auto-approval lane — info=auto, warning/danger=human

## Açık konular

- Tiered-Autonomy (recommend/semi/full per agent) henüz yok — Phase 12'de planlandı

## Kaynaklar

- raw/phase-docs/ai-implementation-plan.md
- `Servers/advisor/approval/stateMachine.ts`
- Migration: `20260413174310-create-ai-approval-rules.js`

## İlgili Sayfalar

- [concept-agentic-governance](../concepts/concept-agentic-governance.md)
- [synthesis-phase-1-7-mimari](../syntheses/synthesis-phase-1-7-mimari.md)
