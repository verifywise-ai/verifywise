---
title: BullMQ Cron Pattern for Phase 4 Proactive AI
tags: [decision, bullmq, phase-4, proactive-ai, scheduled-jobs]
source: raw/phase-docs/ai-implementation-plan.md
date: 2026-04-30
status: active
---

# Decision: Phase 4 için BullMQ Cron Pattern

## Bağlam

Phase 4'te proaktif AI için scheduled jobs gerek. Vendor review, policy expiry, risk anomaly, compliance score drop, task overdue, weekly digest.

## Karar

Mevcut BullMQ + Redis altyapısı + cron pattern'i kullanıldı.

## Gerekçe

- BullMQ zaten 10+ scheduled job için kullanılıyor (Slack, vendor-review, policy-due-soon, vb.)
- Redis 7.x mevcut
- Yeni teknoloji eklemiyoruz (k8s CronJob, external scheduler vb.)

## Pattern

```ts
// Servers/services/automations/automationProducer.ts
async function scheduleProactiveVendorReviewCheck() {
  await automationQueue.add(
    'proactive_vendor_review_check',
    {},
    { repeat: { pattern: '0 8 * * *' } }  // her gün 08:00
  );
}
```

## 6 Yeni Job (Phase 4)

| Cron | Job |
|---|---|
| `0 8 * * *` | proactive_vendor_review_check |
| `0 8 * * *` | proactive_policy_expiry_check |
| `0 */6 * * *` | proactive_risk_anomaly_detection |
| `0 1 * * 1` | proactive_compliance_score_check |
| `0 9 * * *` | proactive_task_overdue_check |
| `0 9 * * 1` | proactive_weekly_digest |

## Sonuçlar

✅ Worker process tüm job'ları işliyor (`All workers started and waiting for jobs...`)
✅ Email + Slack + Teams + In-app fan-out

## Kaynaklar

- raw/phase-docs/ai-implementation-plan.md
- `Servers/services/automations/automationProducer.ts`
- `Servers/services/automations/automationWorker.ts`

## İlgili Sayfalar

- [synthesis-phase-1-7-mimari](../syntheses/synthesis-phase-1-7-mimari.md)
- [bug-duplicate-tsc-watch-502](../sorunlar/bug-duplicate-tsc-watch-502.md)
