# Servers — Backend Development Guide

> **Last Updated:** 2026-05-05

---

## Multi-Tenancy

Shared-schema isolation with `organization_id` column on all tenant-scoped tables. All data lives in the `verifywise` schema (via `search_path`).

| Schema       | Purpose                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifywise` | All tables — users, organizations, projects, vendors, risks, files, model*inventories, frameworks, llm_evals*\*, etc.                                                  |
| `public`     | PostgreSQL extensions only (uuid-ossp, pgcrypto). Also `public.organizations` and `public.users` which EvalServer FKs reference (since EvalServer starts in parallel). |

**Access:** `req.organizationId` from auth middleware. Queries use unqualified table names (resolved by `search_path`): `SELECT * FROM projects WHERE organization_id = :orgId AND id = :id`.

**Security runbook:** `docs/technical/security/tenant-isolation.md` defines the deny-by-default policy, SuperAdmin exception rules, context propagation rules, and the isolation test matrix. Read it before adding or modifying tenant-scoped endpoints.

**Legacy data migration (existing installs only):** `scripts/migrateToSharedSchema.ts` migrates data from old schema-per-tenant (`{tenantHash}`) format to the shared `verifywise` schema. This only runs for organizations that still have data in old tenant schemas. Fresh installs don't need it. Config in `scripts/migrationConfig.ts`.

---

## Database & Migrations

### Creating Migrations

**CRITICAL: Always generate timestamp with `date` command**

```bash
date +%Y%m%d%H%M%S
cd Servers && npx sequelize migration:create --name my-migration-name
```

### Schema Rules

All tables live in the `verifywise` PostgreSQL schema. The `public` schema only holds extensions.

- **Application SQL (controllers, utils, services):** Use **unqualified** table names (e.g., `SELECT * FROM projects`). Resolved via `search_path = verifywise` set in Sequelize `afterConnect` hook.
- **NEVER** use `public.tablename` or `verifywise.tablename` in application code.
- **Migration DDL:** Use explicit `verifywise.` prefix for CREATE TABLE, ALTER TABLE, etc. This is the opposite of application code — migrations need the explicit schema because `search_path` may not be set during migration execution.

### Consolidated Migrations

The schema is defined in 3 consolidated migrations (not many small incremental ones):

- `20260226234300-shared-schema-setup.js` — Extensions, types, enums
- `20260226234301-public-schema-tables.js` — Framework struct tables (shared, no org_id)
- `20260226234302-tenant-tables.js` — All tenant-scoped tables (with org_id)
- `20260302111132-seed-framework-struct-data.js` — Framework seed data

Post-consolidation migrations add new features incrementally (risk benchmarks, vulnerability detection, agent discovery, policy radar, etc.).

### Migration Pattern

New migrations should use `verifywise.` prefix in DDL and `queryInterface.sequelize.query()` for raw SQL:

```javascript
"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.my_new_table (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.my_new_table;");
  },
};
```

For simple column additions, `queryInterface.addColumn` with unqualified names also works (Sequelize resolves via `search_path`):

```javascript
await queryInterface.addColumn("users", "new_field", {
  type: Sequelize.STRING,
  allowNull: true,
});
```

### Running Migrations

```bash
npm run build                    # Build TypeScript first (migrations use dist/)
npx sequelize db:migrate         # Run migrations
npx sequelize db:migrate:undo    # Rollback last
```

### Before Creating a PR

**Always run `npm run build` and verify it succeeds before opening a PR.** Build failures are the most common reason PRs fail CI.

---

## Dev-Only Auto-Bootstrap

On a fresh database, the standard onboarding flow requires logging in as super-admin (seeded by migration from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`), creating an organization, and inviting an admin. To skip this for local development, set the following in `Servers/.env`:

```env
NODE_ENV=development
DEV_AUTO_BOOTSTRAP=true
DEV_ORG_NAME=Acme Dev
DEV_ADMIN_EMAIL=admin@local.dev
DEV_ADMIN_PASSWORD=Admin123!   # ≥8 chars, upper, lower, digit
DEV_ADMIN_NAME=Dev
DEV_ADMIN_SURNAME=Admin
```

On startup (after migrations, before `app.listen`), `Servers/utils/devAutoBootstrap.ts` will:

1. **Hard-bail in production** — `NODE_ENV === "production"` is an unconditional return, regardless of the flag. The feature is dev-only by construction. `NODE_ENV` and the flag are trimmed + lowercased, so `" True "` and `"Production"` are handled.
2. Skip if `DEV_AUTO_BOOTSTRAP !== "true"`.
3. **Pre-flight the `DEV_*` vars before touching the DB.** If any of `DEV_ORG_NAME`, `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, `DEV_ADMIN_NAME`, or `DEV_ADMIN_SURNAME` is missing, commented out, or empty, log a skip message and return — the server then falls back to the default super-admin-only flow. No throw, no `process.exit(1)`.
4. Skip if any `organizations` row already exists (idempotent — safe to leave on across restarts). If the `organizations` table doesn't exist (`42P01`), surface a friendly "run `npx sequelize db:migrate` first" error instead of a raw SQL error.
5. Validate email format, reject collisions with `SUPERADMIN_EMAIL`, and check password strength. These fail fast on startup with a clear error since the vars were explicitly set.
6. In a single transaction, call `createOrganizationQuery` (`utils/organization.utils.ts`) and `createNewUserWrapper` (`controllers/user.ctrl.ts`) with `roleId: 1` (Admin). The user is created active — no email invitation flow.

Log on success: `[dev-bootstrap] created org "<name>" (id=<id>) and admin <email>`.

This is for local developer convenience only — never enable on shared environments.

---

## Backend Development

### Layer Flow

1. **Route** (`routes/{entity}.route.ts`) — Define endpoints, apply `authenticateJWT`
2. **Controller** (`controllers/{entity}.ctrl.ts`) — Handle request, validate, call utils, use `logProcessing`/`logSuccess`/`logFailure`, return `STATUS_CODE[xxx](...)`
3. **Utils** (`utils/{entity}.utils.ts`) — Raw SQL via `sequelize.query()` with unqualified table names and `:replacements` (including `organization_id` for tenant isolation)
4. **Model** (`domain.layer/models/{entity}/`) — Sequelize-typescript decorators

**Don't forget:** Register new routes in `app.ts`:

```typescript
import entityRoutes from "./routes/entity.route";
app.use("/api/entities", entityRoutes);
```

---

## API Documentation Workflow

The Express route layer is the single source of truth for the API surface.
`Servers/swagger.yaml` and `docs/api-docs/src/config/endpoints.ts` are generated
from the route files and must never be edited by hand.

### Adding or changing an endpoint

1. Edit the route file (`Servers/routes/{entity}.route.ts`).
2. If the endpoint requires authentication, apply `authenticateJWT` (or mount the
   router with `router.use(authenticateJWT)`). The generator automatically emits
   `security: [bearerAuth: []]` for protected operations.
3. Regenerate the OpenAPI spec and frontend endpoint registry:

   ```bash
   cd Servers
   npm run generate:swagger
   npm run generate:endpoints
   ```

4. Verify there is no drift:

   ```bash
   npm run check:api-drift
   ```

5. Commit both the route changes and the regenerated `swagger.yaml` /
   `endpoints.ts` files.

### Swagger UI

Swagger UI is served at `/api/docs` in **non-production environments only**. In
production the `/api/docs` route is not mounted, reducing information disclosure
risk while keeping the generated spec available for the frontend build pipeline.

### CI enforcement

The `api-docs-drift` CI job regenerates the spec and registry, runs
`npm run check:api-drift`, and fails if the committed generated files are out of
sync with the route layer.

---

## Key Files

| Purpose                 | Path                                          |
| ----------------------- | --------------------------------------------- |
| Backend entry           | `index.ts`                                    |
| Route definitions       | `routes/*.ts`                                 |
| Database models         | `domain.layer/models/`                        |
| Shared schema migration | `scripts/migrateToSharedSchema.ts`            |
| Migration config        | `scripts/migrationConfig.ts`                  |
| Auth middleware         | `middleware/auth.middleware.ts`               |
| Custom exceptions       | `domain.layer/exceptions/custom.exception.ts` |
| Log helper              | `utils/logger/logHelper.ts`                   |

---

## References

Read the relevant file BEFORE implementing changes in that area:

| When working on...                        | Read this file                                    |
| ----------------------------------------- | ------------------------------------------------- |
| Controller/route/utils patterns           | `docs/technical/guides/backend-patterns.md`       |
| Adding a new feature (full guide)         | `docs/technical/guides/adding-new-feature.md`     |
| Adding a new framework                    | `docs/technical/guides/adding-new-framework.md`   |
| API conventions                           | `docs/technical/guides/api-conventions.md`        |
| Code style (short version)                | `docs/technical/guides/code-style.md`             |
| Detailed backend coding standards         | `CodeRules/04-backend/`                           |
| TypeScript standards & naming             | `CodeRules/02-typescript/`                        |
| API routes & endpoints                    | `docs/technical/api/endpoints.md`                 |
| Background jobs (BullMQ)                  | `docs/technical/infrastructure/automations.md`    |
| Email templates (MJML)                    | `docs/technical/infrastructure/email-service.md`  |
| PDF/DOCX reporting                        | `docs/technical/infrastructure/pdf-generation.md` |
| File upload system                        | `docs/technical/infrastructure/file-storage.md`   |
| Error handling & exceptions               | `docs/claude/error-handling.md`                   |
| Logging system                            | `docs/claude/logging.md`                          |
| Middleware (rate limit, RBAC, JWT, Redis) | `docs/claude/middleware.md`                       |
| Database schema                           | `docs/technical/architecture/database-schema.md`  |
| Multi-tenancy architecture                | `docs/technical/architecture/multi-tenancy.md`    |
| Tenant isolation security runbook         | `docs/technical/security/tenant-isolation.md`     |

> All `docs/` paths are relative to the repository root.
