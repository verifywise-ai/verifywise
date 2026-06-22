---
title: Bug Fix Pattern'ları — Tekrar Eden Sorunlar
tags: [synthesis, bug-patterns, post-mortem, lessons-learned]
source: 2026-04-29 chat sessions
date: 2026-04-30
status: active
---

# Bug Fix Pattern'ları

## Tekrar Eden 4 Sorun Sınıfı

### 1. Process Lifecycle Issues (duplicate / leaked process)
- **Örnek:** [bug-duplicate-tsc-watch-502](../sorunlar/bug-duplicate-tsc-watch-502.md)
- **Kök Neden:** Restart sırasında eski process'leri tam öldürmemek
- **Pattern:** `kill %1` yerine `pkill -f "<full-pattern>"`
- **Önleme:** Defensive startup script, process tree audit

### 2. Migration Ordering Conflicts
- **Örnek:** [bug-migration-20260408-entity-type-check-constraint](../sorunlar/bug-migration-20260408-entity-type-check-constraint.md)
- **Kök Neden:** Yeni migration eski timestamp'le eklenmiş, sonraki migration zaten state'i değiştirmiş
- **Pattern:** Manuel `INSERT INTO SequelizeMeta` ile skip, sonra restart
- **Önleme:** CI step — migration timestamp linearity check

### 3. Schema Mismatch — SQL'deki Kolon Adı vs Gerçek
- **Örnek:** [bug-framework-gap-control-name-column](../sorunlar/bug-framework-gap-control-name-column.md)
- **Kök Neden:** Workflow definition olmayan kolon kullanıyor (`control_name` → yok, `score` → `overall_score`)
- **Pattern:** `\d <table>` ile gerçek schema kontrol + SQL düzelt
- **Önleme:** Integration test her workflow step'inin SQL'ini canlı schema'ya karşı çalıştır

### 4. Missing Trigger Payload (Manuel Run)
- **Örnek:** [bug-policy-renewal-missing-policyid](../sorunlar/bug-policy-renewal-missing-policyid.md)
- **Kök Neden:** Workflow per-entity tasarlandı, manuel UI Run'ı boş payload gönderiyor
- **Pattern:** Step'e auto-pick fallback ekle (`if (!policyId) pick most-due`)
- **Önleme:** Frontend Run butonu workflow tipine göre payload selector dialog (Phase 11+)

## Yeni Sınıf: Wired-up Yetimleri

### CRITICAL: [bug-memory-service-not-wired](../sorunlar/bug-memory-service-not-wired.md)
- **Kök Neden:** `memoryService.ts` yazıldı ama `aiSdkAgent.ts`'e import edilmedi
- **Etki:** Agent memory tabloları boş, multi-turn conversation kontekst kaybediyor, GDPR right-to-erasure handle edilmiyor
- **Önleme:** Phase merge öncesi "import graph" lint — yetim service dosyaları flag'le

## Genel Önlemler

| Önlem | Faydası |
|---|---|
| Integration test her workflow step için | Schema mismatch'i erken yakalar |
| CI: migration timestamp linearity check | Ordering conflict önler |
| `pkill -f` defensive | Duplicate process önler |
| Frontend payload selector dialog | Manuel Run'lar graceful başlar |
| Import graph lint | Yetim service dosya yok |
| Cross-tenant assertion test (2 org seed) | organization_id filter unutmayı yakalar |

## Kaynaklar

- 5 bug sayfası (`sorunlar/`)
- 2026-04-29 user testing session

## İlgili Sayfalar

- [bug-duplicate-tsc-watch-502](../sorunlar/bug-duplicate-tsc-watch-502.md)
- [bug-framework-gap-control-name-column](../sorunlar/bug-framework-gap-control-name-column.md)
- [bug-policy-renewal-missing-policyid](../sorunlar/bug-policy-renewal-missing-policyid.md)
- [bug-memory-service-not-wired](../sorunlar/bug-memory-service-not-wired.md)
- [bug-migration-20260408-entity-type-check-constraint](../sorunlar/bug-migration-20260408-entity-type-check-constraint.md)
