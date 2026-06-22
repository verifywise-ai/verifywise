---
title: Multi-Tenancy via organization_id
tags: [concept, multi-tenancy, organization-id, shared-schema, tenant-isolation]
source: raw/codebase-claude-md/servers-claude.md
date: 2026-04-30
status: active
---

# Multi-Tenancy via organization_id

## Tanım

VerifyWise'ın multi-tenant SaaS izolasyon stratejisi: **shared schema + organization_id** kolonu. Tüm tenant tabloları tek bir PostgreSQL schema'da (`verifywise`) tutulur ve her satır `organization_id` ile izole edilir.

## Pattern

```sql
-- Tüm tenant tablolarında zorunlu kolon
ALTER TABLE risks ADD COLUMN organization_id INTEGER NOT NULL
  REFERENCES verifywise.organizations(id) ON DELETE CASCADE;

-- Her query'de zorunlu filter
SELECT * FROM risks
 WHERE organization_id = :orgId AND id = :id;
```

## Kaynak

- `req.organizationId` — auth middleware'den (JWT payload'tan) alınır
- Sequelize `afterConnect` hook'unda `search_path = verifywise` set edilir
- Application code unqualified table name kullanır

## İstisna: public schema

`public` schema sadece:
- PostgreSQL extension'ları (uuid-ossp, pgcrypto)
- `public.organizations` ve `public.users` (EvalServer FK için — EvalServer paralel başlar)

## Risk

❌ `organization_id` filter'ı unutmak → cross-tenant data leak

## Mitigation

- **Code review pattern** — her `sequelize.query()` `organization_id = :orgId` içermeli
- **Test pattern** — 2 org seed + cross-tenant assertion
- **Lint rule** — raw SQL'de `organization_id` aramaması olmayan query'leri flag'le (öneri)

## Multi-Tenancy Detayları

`docs/technical/architecture/multi-tenancy.md` referans dokümanı (codebase'de).

## Kaynaklar

- raw/codebase-claude-md/servers-claude.md
- raw/codebase-claude-md/root-claude.md
- raw/docs/backend-database-patterns.md

## İlgili Sayfalar

- [decision-shared-schema-vs-schema-per-tenant](../decisions/decision-shared-schema-vs-schema-per-tenant.md)
- [synthesis-multi-tenancy-mimari](../syntheses/synthesis-multi-tenancy-mimari.md)
