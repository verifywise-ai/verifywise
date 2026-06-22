---
title: Multi-Tenancy Mimari Sentezi
tags: [synthesis, multi-tenancy, organization-id, search-path, raw-sql, tenant-isolation]
source: raw/codebase-claude-md/servers-claude.md
date: 2026-04-30
status: active
---

# Multi-Tenancy Mimari Sentezi

## Strateji

**Shared schema + organization_id** — tek `verifywise` PostgreSQL schema'da tüm tenant'lar.

## Neden Bu Tercih?

| Alternatif | Reddedilme nedeni |
|---|---|
| Schema-per-tenant | Migration fanout, connection pool şişer |
| Database-per-tenant | Backup karmaşası, cross-tenant super-admin imkansız |
| Row-level security (RLS) | PostgreSQL özel feature, debugging zor, performans riski |

## Mimari Bileşenler

### 1. Database
- Tüm tenant tabloları: `verifywise.<table>`
- Her satırda `organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE`
- `public` schema sadece extension'lar (uuid-ossp, pgcrypto) + EvalServer FK için `public.organizations` ve `public.users`

### 2. Sequelize Configuration
- `afterConnect` hook: `SET search_path = verifywise`
- Application kodu unqualified table name kullanır (`SELECT * FROM risks`)
- Migration'lar explicit prefix: `CREATE TABLE verifywise.risks`

### 3. Auth Middleware
- JWT payload: `{id, email, organizationId, tenantId, roleName, expire}`
- `req.organizationId` her authenticated istek'te mevcut
- Super-admin: `isSuperAdmin` flag + `activeOrganizationId` switching

### 4. Query Pattern (Mandatory)
```ts
sequelize.query(
  "SELECT * FROM risks WHERE organization_id = :orgId AND id = :id",
  { replacements: { orgId, id }, type: QueryTypes.SELECT }
);
```

**`organization_id = :orgId` koşulu HER TENANT QUERY'sinde MANDATORY.**

### 5. Test Pattern (Cross-Tenant Assertion)
```ts
// 2 org seed
const orgA = await seedOrg();
const orgB = await seedOrg();

// orgA'da risk oluştur
const riskA = await createRisk(orgA.id, { ... });

// orgB context'iyle risk listesi → riskA görünmemeli
const risksB = await fetchRisks(orgB.id);
expect(risksB.find(r => r.id === riskA.id)).toBeUndefined();
```

## Risk: organization_id Filter Unutmak

### Tespit yöntemleri
1. **Code review** — her PR'da raw SQL'de `organization_id` aranır
2. **Cross-tenant integration test** (yukarıdaki pattern)
3. **Lint rule** (öneri): `sequelize.query()` arg'ında `organization_id` regex match etmiyorsa flag

### Hangi Senaryoda Sızıntı Olabilir?
- Yeni endpoint eklenirken filter unutulur
- Super-admin path'te `req.organizationId` set edilmez
- Cross-tenant aggregation (analytics) kazara satır görünürlüğü

## EvalServer Edge Case

EvalServer (Python FastAPI) ayrı service, paralel başlar. `public.organizations` ve `public.users` ona FK olarak gerek. Bu yüzden iki schema arasında küçük overlap var.

## Migration Convention

```js
// 'use strict';
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.my_new_table (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.my_new_table;');
  }
};
```

## Reference Dokümanı

`docs/technical/architecture/multi-tenancy.md` (codebase'de) — derinlemesine açıklama.

## Kaynaklar

- [root-claude-md](../sources/codebase-claude-md/2026-04-30-root-claude-md.md)
- [servers-claude-md](../sources/codebase-claude-md/2026-04-30-servers-claude-md.md)
- [backend-database-patterns](../sources/docs/2026-04-30-backend-database-patterns.md)

## İlgili Sayfalar

- [concept-multi-tenancy-organization-id](../concepts/concept-multi-tenancy-organization-id.md)
- [decision-shared-schema-vs-schema-per-tenant](../decisions/decision-shared-schema-vs-schema-per-tenant.md)
- [decision-raw-sql-vs-orm](../decisions/decision-raw-sql-vs-orm.md)
