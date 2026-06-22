---
title: BUG — frameworkGap workflow `control_name` kolonu yok
tags: [bug, phase-6, workflow, framework-gap, sql, schema-mismatch]
source: 2026-04-29 chat session
date: 2026-04-29
status: active
---

# BUG: framework_gap_remediation `column "control_name" does not exist`

## Belirti

Workflow `framework_gap_remediation` çalışınca `fetch_weakest_controls` step'i başarısız:
```
column "control_name" does not exist
```

## Kök Neden

`Servers/services/workflows/definitions/frameworkGap.workflow.ts` `control_readiness_scores` tablosunda olmayan kolonlar sorguluyordu:

| SQL'deki kolon | Gerçek kolon |
|---|---|
| ❌ `control_name` | (mevcut değil) |
| ❌ `score` | ✅ `overall_score` |
| ❌ `level` | ✅ `readiness_level` |

## Fix

```sql
SELECT framework_type,
       control_id,
       overall_score::int AS score,
       readiness_level    AS level
  FROM control_readiness_scores
 WHERE organization_id = :orgId
   AND project_id IS NULL
 ORDER BY overall_score ASC
 LIMIT :limit
```

`control_name` kaldırıldı — kullanan başka step yok (`notify_admins` sadece `scan_frameworks` output'unu kullanıyor).

## Önleme

- Workflow definition test'i: integration test her step'in SQL'ini gerçek schema'ya karşı çalıştır
- DB schema → TS type generation (Sequelize CLI ile)

## Etkilenen Dosyalar

- `Servers/services/workflows/definitions/frameworkGap.workflow.ts`

## Kaynaklar

- 2026-04-29 user testing session
- Run UUID: `a3cba1ed-56f1-45b9-a48c-e7b8f0eb0a82`

## İlgili Sayfalar

- [synthesis-bug-fix-patterns](../syntheses/synthesis-bug-fix-patterns.md)
- [bug-policy-renewal-missing-policyid](bug-policy-renewal-missing-policyid.md)
