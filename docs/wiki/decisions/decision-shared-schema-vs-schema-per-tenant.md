---
title: Shared Schema vs Schema-per-Tenant
tags: [decision, multi-tenancy, sequelize, postgresql, organization-id]
source: raw/codebase-claude-md/servers-claude.md
date: 2026-04-30
status: active
---

# Decision: Shared Schema (organization_id) vs Schema-per-Tenant

## Bağlam

VerifyWise multi-tenant SaaS — her organizasyonun verisi izole olmalı. PostgreSQL schema seçenekleri:

1. **Schema-per-tenant** — her org için ayrı schema (`org_123.risks`, `org_456.risks`)
2. **Shared schema** — tek schema, tüm tablolarda `organization_id` kolonu

## Karar

**Shared schema + organization_id** seçildi.

## Gerekçe

- Migration kolaylığı — tek schema'ya migrate ediyorsun, fanout yok
- Cross-tenant query'ler (super-admin için) basit
- Connection pooling daha verimli (her org için ayrı connection olmuyor)
- Backup/restore basit
- Tüm tablolar `verifywise` schema'da (search_path ile resolve)

## Riskler ve Mitigation

| Risk | Mitigation |
|---|---|
| `organization_id` filter unutmak → cross-tenant data leak | Code review + `WHERE organization_id = :orgId` mandatory pattern |
| Test'lerde yanlış org seed | 2 org seed pattern + cross-tenant assertion test |
| Super-admin görünürlük yetkisi | `isSuperAdmin` flag + `activeOrganizationId` switching |

## Migration Pattern

```js
// Migration: explicit verifywise. prefix
await queryInterface.sequelize.query(`
  CREATE TABLE IF NOT EXISTS verifywise.my_table (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
    ...
  );
`);

// Application code: unqualified (search_path resolves to verifywise)
SELECT * FROM my_table WHERE organization_id = :orgId
```

## Kaynaklar

- raw/codebase-claude-md/servers-claude.md
- raw/docs/backend-database-patterns.md

## İlgili Sayfalar

- [concept-multi-tenancy-organization-id](../concepts/concept-multi-tenancy-organization-id.md)
- [synthesis-multi-tenancy-mimari](../syntheses/synthesis-multi-tenancy-mimari.md)
