---
title: BUG — Migration 20260408 entity_type CHECK constraint violation
tags: [bug, migration, sequelize, entity-type, check-constraint, ordering]
source: 2026-04-29 chat session
date: 2026-04-29
status: active
---

# BUG: Migration `20260408171819` CHECK constraint violation

## Belirti

Backend `npm run watch` başlatınca migration başarısız:
```
== 20260408171819-add-ai-action-to-approval-workflows-entity-type: migrating ===
ERROR: check constraint "approval_workflows_entity_type_check" of relation "approval_workflows" is violated by some row
```

## Kök Neden

Migration sırası bozulmuş:
- `20260408171819` migration `entity_type IN ('use_case', 'project', 'file', 'ai_action')` olarak constraint'i daraltıyor
- AMA daha sonra çıkan `20260413175412-extend-entity-types-and-seed-workflows.js` constraint'i tamamen kaldırıyor ve `risk`, `policy`, `vendor`, `model_inventory`, `incident`, `dataset`, `evidence`, `ai_action` entity_type'larını izin veriyor

DB state: `20260408171819` SequelizeMeta'da YOK ama `20260413175412` ZATEN UYGULANMIŞ. Şimdi `20260408171819` retroaktif uygulanmaya çalışıyor → DB'de zaten `model_inventory`, `policy`, `vendor`, vb. entity_type'lı satırlar var → constraint violation.

## Fix

Migration'ı manuel olarak SequelizeMeta'ya işaretle:
```sql
INSERT INTO verifywise."SequelizeMeta" (name)
VALUES ('20260408171819-add-ai-action-to-approval-workflows-entity-type.js')
ON CONFLICT DO NOTHING;
```

Sonra backend restart → migration list'te skip edilir, sonraki migrations çalışır.

## Önleme

- Migration eklerken timestamp'i mevcut latest'ten sonra olmalı
- `git pull` sonrası migration ordering check (CI step)
- Dev'de `migrate:status` ile applied vs pending görüntü

## Etkilenen Dosyalar

- `Servers/database/migrations/20260408171819-add-ai-action-to-approval-workflows-entity-type.js`
- `Servers/database/migrations/20260413175412-extend-entity-types-and-seed-workflows.js` (sonraki, fix etmiş zaten)

## Kaynaklar

- 2026-04-29 user testing session

## İlgili Sayfalar

- [synthesis-bug-fix-patterns](../syntheses/synthesis-bug-fix-patterns.md)
- [decision-shared-schema-vs-schema-per-tenant](../decisions/decision-shared-schema-vs-schema-per-tenant.md)
