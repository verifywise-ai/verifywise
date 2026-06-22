---
title: Servers/CLAUDE.md — Backend Development Guide
tags: [backend, multi-tenancy, sequelize, migrations, search-path, dev-bootstrap]
source: raw/codebase-claude-md/servers-claude.md
date: 2026-04-30
status: active
---

# Servers/CLAUDE.md — Backend Development Guide

## Amaç

Backend'e özel kurallar. Multi-tenancy şema yönetimi, migration kuralları, layer flow (Route → Controller → Utils → Model), dev-only auto-bootstrap.

## Ne yapıldı

Backend katmanları için tek noktada referans. İçerik:

### Multi-Tenancy
- **Shared-schema** isolation, `organization_id` kolonu tüm tenant tablolarında
- Tüm tablolar `verifywise` schema'da (`search_path` ile)
- `public` schema sadece extension'lar (uuid-ossp, pgcrypto) + EvalServer FK için `public.organizations` ve `public.users`
- `req.organizationId` auth middleware'den alınır

### Migration Kuralları
- **Application SQL:** unqualified table name (`SELECT * FROM projects`)
- **Migration DDL:** explicit `verifywise.` prefix
- 3 consolidated migration baseline: shared-schema-setup, public-schema-tables, tenant-tables, framework-struct seed
- Yeni migration: `date +%Y%m%d%H%M%S` ile timestamp + `npx sequelize migration:create`

### Dev-Only Auto-Bootstrap
- `NODE_ENV=development` + `DEV_AUTO_BOOTSTRAP=true` ile fresh DB'de admin user otomatik oluşturulur
- Production'da hard-bail (`NODE_ENV === "production"` → unconditional return)
- İdempotent (`organizations` tablosu boş ise çalışır)

### Backend Layer Flow
1. Route (`routes/{entity}.route.ts`) — endpoints, `authenticateJWT`
2. Controller (`controllers/{entity}.ctrl.ts`) — req validation, `logProcessing/logSuccess/logFailure`, `STATUS_CODE[xxx]`
3. Utils (`utils/{entity}.utils.ts`) — raw SQL via `sequelize.query()` + `:replacements` + `organization_id`
4. Model (`domain.layer/models/{entity}/`) — Sequelize-typescript decorators

## Değişen dosyalar

- `Servers/CLAUDE.md`

## Kararlar

- [decision-shared-schema-vs-schema-per-tenant](../../decisions/decision-shared-schema-vs-schema-per-tenant.md)
- [decision-raw-sql-vs-orm](../../decisions/decision-raw-sql-vs-orm.md)

## Kaynaklar

- raw/codebase-claude-md/servers-claude.md (orijinal: `Servers/CLAUDE.md`, 8441 bayt)

## İlgili Sayfalar

- [2026-04-30-root-claude-md](2026-04-30-root-claude-md.md)
- [concept-multi-tenancy-organization-id](../../concepts/concept-multi-tenancy-organization-id.md)
- [bug-migration-20260408-entity-type-check-constraint](../../sorunlar/bug-migration-20260408-entity-type-check-constraint.md)
