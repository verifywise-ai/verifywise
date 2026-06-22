---
title: BUG — policyRenewal workflow manuel Run'da policyId eksik
tags: [bug, phase-6, workflow, policy-renewal, trigger-payload]
source: 2026-04-29 chat session
date: 2026-04-29
status: active
---

# BUG: policy_renewal `Trigger payload missing policyId`

## Belirti

Workflows sayfasından **Policy Renewal** workflow'una "Run" basınca:
```
fetch_policy → failed
"Trigger payload missing policyId"
```

## Kök Neden

`policyRenewal.workflow.ts` per-policy çalışacak şekilde tasarlanmış (cron fanout için). Cron job tüm due policy'leri tarayıp her biri için ayrı workflow run açıyor — `triggerPayload: { policyId: p.id }`.

Ama frontend "Run" butonu boş `triggerPayload: {}` gönderiyor → `fetch_policy` step'i fail ediyor.

## Fix

`fetch_policy` step'ine **auto-pick** mantığı eklendi: manuel run'da en erken `next_review_date`'li policy auto-pick edilir.

```ts
if (!policyId) {
  const candidates = await sequelize.query(
    `SELECT id FROM policy_manager
       WHERE organization_id = :orgId
         AND next_review_date IS NOT NULL
       ORDER BY next_review_date ASC
       LIMIT 1`,
    { replacements: { orgId: ctx.organizationId }, type: QueryTypes.SELECT },
  );
  if (candidates.length === 0) {
    return { type: "skip", reason: "No policies with next_review_date set" };
  }
  policyId = candidates[0].id;
}
```

## Yeni Davranış

| Senaryo | Sonuç |
|---|---|
| Cron fanout (otomatik) | policyId payload'da gelir → o policy için çalışır |
| Manuel Run + policy var | En erken next_review_date'li policy auto-pick |
| Manuel Run + hiç policy | `skip` "No policies with next_review_date set" |
| Manuel Run + policy var ama 30 gün dışında | fetch_policy ✅ → check_eligibility skip |

## Önleme

- Frontend Run butonu workflow tipine göre payload selector dialog gösterebilir (Phase 11+)
- Veya tüm workflow'lar manuel run için "graceful default" desteklesin

## Etkilenen Dosyalar

- `Servers/services/workflows/definitions/policyRenewal.workflow.ts`

## Kaynaklar

- 2026-04-29 user testing session
- Run UUID: `05931443-e376-4755-a562-771243005d15`

## İlgili Sayfalar

- [synthesis-bug-fix-patterns](../syntheses/synthesis-bug-fix-patterns.md)
- [bug-framework-gap-control-name-column](bug-framework-gap-control-name-column.md)
