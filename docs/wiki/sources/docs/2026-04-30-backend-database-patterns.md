---
title: Backend Database Patterns — Sequelize + Raw SQL
tags: [backend, sequelize, raw-sql, multi-tenancy, search-path, replacements]
source: raw/docs/backend-database-patterns.md
date: 2026-04-30
status: active
---

# Backend Database Patterns

## Amaç

Sequelize 6 + raw SQL kullanım kuralları, multi-tenancy izolasyon, replacement pattern'leri.

## Ne yapıldı

### Pattern Hierarchy
1. **Application code** — unqualified table names (`SELECT * FROM projects`)
2. **Migration DDL** — explicit `verifywise.` prefix (`CREATE TABLE verifywise.x`)
3. **Raw SQL ile sequelize.query()** — preferred over ORM .findAll() for tenant queries

### Replacements (always)
```ts
sequelize.query(
  "SELECT * FROM risks WHERE organization_id = :orgId AND id = :id",
  { replacements: { orgId, id }, type: QueryTypes.SELECT }
);
```

### Multi-Tenancy Rule
- Her tenant query'sinde `organization_id = :orgId` koşulu
- Test pattern: 2 org seed + cross-tenant assertion

## Kararlar

- [decision-raw-sql-vs-orm](../../decisions/decision-raw-sql-vs-orm.md)
- [decision-shared-schema-vs-schema-per-tenant](../../decisions/decision-shared-schema-vs-schema-per-tenant.md)

## Kaynaklar

- raw/docs/backend-database-patterns.md (orijinal: 15747 bayt)

## İlgili Sayfalar

- [concept-multi-tenancy-organization-id](../../concepts/concept-multi-tenancy-organization-id.md)
- [synthesis-multi-tenancy-mimari](../../syntheses/synthesis-multi-tenancy-mimari.md)
