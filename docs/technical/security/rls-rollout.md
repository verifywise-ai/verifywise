# PostgreSQL Row-Level Security Rollout

Status: **Phase 1 complete (2026-07-20)** — policies installed, not yet enforced for the app role.

Companion runbook: `docs/technical/security/tenant-isolation.md` (application-level isolation).

## Why

Tenant isolation today is enforced purely in application code (~3,000 raw SQL
queries that must each remember `WHERE organization_id = :orgId`). RLS is the
database-level backstop: even a query that forgets the predicate cannot cross
tenant boundaries once enforcement is active.

## Phase 1 — Policies installed (done)

Migration `Servers/database/migrations/20260720100200-rls-policies-registry-tables.js`:

- `ENABLE ROW LEVEL SECURITY` + a `tenant_isolation` policy on every table in
  the tenant-isolation registry (33 tables).
- Policy: `organization_id = current_setting('app.current_org', true)::int`
  for both `USING` (reads) and `WITH CHECK` (writes).
- **No behavior change**: the app connects as the table owner and PostgreSQL
  does not apply RLS to the owner unless `FORCE ROW LEVEL SECURITY` is used.

## Phase 2 — Activation (next)

1. **Dedicated app role** (non-owner):

   ```sql
   CREATE ROLE verifywise_app LOGIN PASSWORD '<strong>';
   GRANT CONNECT ON DATABASE verifywise TO verifywise_app;
   GRANT USAGE ON SCHEMA verifywise TO verifywise_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA verifywise TO verifywise_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA verifywise
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO verifywise_app;
   ```

   Keep the owner role for migrations and super-admin/maintenance jobs.
   Point the runtime DB env vars at `verifywise_app`.

2. **Per-request GUC**: after `authenticateJWT`, scope the DB connection:

   ```ts
   // inside a transaction wrapper for request handling
   await sequelize.query(`SET LOCAL app.current_org = :orgId`, {
     replacements: { orgId: req.organizationId }, transaction,
   });
   ```

   `SET LOCAL` is mandatory (not `SET`) so the value never leaks between
   requests sharing a pooled connection. Routes without an org context
   (public share links, AI Trust Centre) need either a dedicated
   `SECURITY DEFINER` function or a separate bypass role — design these
   before enabling.

3. **Background jobs**: the automation worker already iterates orgs — set
   `app.current_org` per org iteration.

4. **Verify**: run the tenant-isolation integration matrix with the app
   role, then force-fail one query's WHERE clause and confirm the DB still
   returns zero cross-tenant rows.

## Phase 3 — Deferred tables

~150 tables are listed in `deferredScopedTables`
(`Servers/scripts/auditTenantIsolationCoverage.ts`). Burn them down in waves:
add `organization_id` where missing, extend the registry, and add each table
to the RLS policy migration pattern above.

## Gotchas

- Unset GUC = `NULL` = no rows match (fail-closed). This is intended, but
  means every code path touching registry tables must set the GUC first.
- `slack_webhooks.organization_id` is nullable and never written today —
  backfill before adding it to the policy set.
- Super-admin cross-org reads must go through the owner/bypass role, not the
  app role.
- Do not use plain `SET` on pooled connections: the org id would leak into
  the next request that reuses the connection.
