# PostgreSQL Row-Level Security Rollout

Status: **Phase 2 implemented behind a flag (2026-07-21)** — policies installed (Phase 1); runtime role + `SET LOCAL` enforcement shipped but OFF by default (`RLS_ENFORCEMENT_ENABLED=false`).

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

## Phase 2 — Activation (implemented behind `RLS_ENFORCEMENT_ENABLED`)

Shipped 2026-07-21, **OFF by default**. Existing behavior is unchanged
until the flag and the app-role credentials are set.

1. **Dedicated app role** (non-owner) — implemented as migration
   `Servers/database/migrations/20260721090000-rls-app-role.js` (idempotent;
   creates the role `NOLOGIN` if missing, then `ALTER ROLE ... LOGIN
   PASSWORD` with the password bound from `DB_APP_PASSWORD`; grants
   `CONNECT` on the database, `USAGE` on schema `verifywise`,
   `SELECT/INSERT/UPDATE/DELETE` on all tables, `USAGE, SELECT` on all
   sequences, plus owner default privileges for future tables/sequences).
   The migration fails fast with a clear error if `DB_APP_PASSWORD` is
   unset. Reference SQL:

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

2. **Per-request GUC** — implemented in
   `Servers/middleware/rls.middleware.ts`:

   - `rlsEnforcement` is invoked by `authenticateJWT` at the downstream
     boundary, after `req.organizationId` is resolved (routes mount
     `authenticateJWT` individually, so there is no global post-auth hook).
     It opens a transaction, runs `SET LOCAL app.current_org = :orgId`
     (bound via replacements, never interpolated), attaches the transaction
     to `req.rlsTransaction` and the AsyncLocalStorage context, and commits
     on successful responses / rolls back on errors or aborted connections.
   - `enableRlsQueryScoping` (wired once in `Servers/database/db.ts`) routes
     every `sequelize.query` issued inside the request's AsyncLocalStorage
     context through that transaction.
   - **Fail closed**: a non-super-admin request without an org context gets
     a 500 instead of running unscoped.
   - **Exempt**: SuperAdmin / no-org contexts (public share links, AI Trust
     Centre) — per the runbook these must go through the owner/bypass role
     and are designed separately before enabling.

   Reference snippet:

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
   `app.current_org` per org iteration. **Not yet wired** — required before
   enabling (jobs run outside a request context, so the fail-closed GUC
   would return zero rows under the app role).

4. **Verify**: run the tenant-isolation integration matrix with the app
   role, then force-fail one query's WHERE clause and confirm the DB still
   returns zero cross-tenant rows.

### How to enable (once the checklist below is done)

1. Set `DB_APP_PASSWORD` in `Servers/.env` and run migrations **with the
   flag off** (owner role): the `20260721090000-rls-app-role.js` migration
   creates the `verifywise_app` role.
2. Set `DB_APP_USER=verifywise_app` and `RLS_ENFORCEMENT_ENABLED=true`.
   `database/config/config.js` then connects the runtime as
   `verifywise_app`; keep `DB_USER`/`DB_PASSWORD` as the owner credentials
   for migrations.
3. Restart the backend and run the tenant-isolation integration matrix
   (step 4 above).

### Pre-enable checklist (known gaps in the current scaffolding)

- **Auth-internal lookups**: `authenticateJWT`'s own queries
  (`getUserByIdQuery`, `doesUserBelongsToOrganizationQuery`, API-token
  lookup against `users`/`api_tokens`) run before the request RLS context
  exists. Under enforcement with the app role they would hit RLS'd tables
  with no GUC (fail closed → 0 rows). Before enabling, either run these
  through `SECURITY DEFINER` functions or establish the GUC earlier from
  the signature-verified token payload.
- **Super-admin / no-org flows** (public share links, AI Trust Centre):
  exempted by the middleware; they need the owner/bypass role or
  `SECURITY DEFINER` functions per the note above.
- **Background jobs** (Phase 2 item 3) must set `app.current_org` per org
  iteration.

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
