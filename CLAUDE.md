# VerifyWise - Development Guide

> **Last Updated:** 2026-03-17

This document contains core rules and patterns for all development in the VerifyWise codebase. For detailed feature documentation, see the [Reference Index](#detailed-references) at the bottom.

---

## Instructions for Claude

**Keep documentation up to date.**

When making changes to the codebase:
- **Core architecture changes** (new patterns, conventions, multi-tenancy, migration rules) → Update this CLAUDE.md
- **Feature-specific changes** (new routes, APIs, middleware, services) → Update the relevant reference doc (see [Detailed References](#detailed-references))
- **Both** when a change spans core + feature

Always update the "Last Updated" date when modifying this file.

---

## Related Repositories

| Repository | Location | Purpose |
|------------|----------|---------|
| **plugin-marketplace** | `../plugin-marketplace` (sibling directory) | All plugins (30+), framework plugins (SOC 2, GDPR, etc.), integration plugins. See `plugin-marketplace/CLAUDE.md`. |

> Plugin source code is NOT in this repository. Work in the plugin-marketplace repo.

---

## 1. Project Overview

VerifyWise is an AI governance platform supporting EU AI Act, ISO 42001, ISO 27001, NIST AI RMF, and plugin frameworks (SOC 2, GDPR, HIPAA, etc.).

### Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Material-UI 7, Redux Toolkit, React Query |
| **Backend** | Node.js 22, Express.js 4, TypeScript, Sequelize 6 |
| **Database** | PostgreSQL (shared schema, org_id isolation) |
| **Cache/Queue** | Redis + BullMQ |
| **Python Services** | FastAPI, Python 3.12 (EvalServer) |

### Project Structure

```
verifywise/
├── Clients/                    # React frontend
│   └── src/
│       ├── application/        # Business logic (hooks, redux, repository)
│       ├── presentation/       # UI (pages, components, themes)
│       ├── domain/             # Types, interfaces, enums
│       └── infrastructure/     # API client, external services
├── Servers/                    # Express backend
│   ├── controllers/            # Request handlers
│   ├── routes/                 # API endpoints
│   ├── services/               # Business logic services
│   ├── utils/                  # Database queries (repository pattern)
│   ├── domain.layer/           # Models, interfaces, frameworks
│   ├── middleware/             # Auth, rate limiting, multi-tenancy
│   ├── database/               # DB config, migrations
│   ├── templates/              # Email (MJML) & PDF (EJS) templates
│   └── jobs/                   # BullMQ workers
├── EvalServer/                 # Python LLM evaluation service
│   ├── src/
│   │   ├── app.py              # FastAPI entry point
│   │   ├── alembic.ini         # Alembic config
│   │   ├── routers/            # API routes
│   │   ├── database/           # DB config, Alembic migrations
│   │   ├── scripts/            # Data migration scripts
│   │   └── middlewares/        # Tenant middleware
│   ├── Dockerfile              # Production (alembic + uvicorn)
│   └── Dockerfile.dev          # Development (with --reload)
└── docs/                       # Documentation
```

---

## 2. Architecture

### Frontend Clean Architecture

```
presentation/     → UI components, pages (what user sees)
application/      → Business logic, hooks, redux, contexts
domain/           → Types, interfaces, enums (core entities)
infrastructure/   → API clients, external services
```

### Backend Layered Architecture

```
routes/           → HTTP endpoint definitions
controllers/      → Request handling, validation
services/         → Complex business logic
utils/            → Database queries (Sequelize)
domain.layer/     → Models, interfaces, exceptions
```

### Request Flow

```
Browser → React Component → Redux/React Query → Axios
    ↓
Express Router → Middleware Chain → Controller → Service → Utils → PostgreSQL
```

---

## 3. Multi-Tenancy

Shared-schema isolation with `organization_id` column on all tenant-scoped tables. All data lives in the `verifywise` schema (via `search_path`).

| Schema | Purpose |
|--------|---------|
| `verifywise` | All tables — users, organizations, projects, vendors, risks, files, model_inventories, frameworks, llm_evals_*, etc. |
| `public` | PostgreSQL extensions only (uuid-ossp, pgcrypto). Also `public.organizations` and `public.users` which EvalServer FKs reference (since EvalServer starts in parallel). |

**Access:** `req.organizationId` from auth middleware. Queries use unqualified table names (resolved by `search_path`): `SELECT * FROM projects WHERE organization_id = :orgId AND id = :id`.

**EvalServer:** Uses `search_path` for queries (unqualified `llm_evals_*` table names). FK references in DDL point to `public.organizations(id)` and `public.users(id)` — NOT `verifywise.*` — because EvalServer starts in parallel with the main server and can't depend on `verifywise` tables existing first.

**Legacy:** Previously used schema-per-tenant (`{tenantHash}` schemas). Two migration scripts handle the transition:
- `Servers/scripts/migrateToSharedSchema.ts` — Main server data migration (runs on startup)
- `EvalServer/src/scripts/migrate_to_shared_schema.py` — EvalServer data migration (runs on startup with advisory lock for multi-worker safety)

---

## 4. Database & Migrations

### Creating Migrations

**CRITICAL: Always generate timestamp with `date` command**

```bash
date +%Y%m%d%H%M%S
cd Servers
npx sequelize migration:create --name my-migration-name
```

### Schema Rules

All tables live in the `verifywise` PostgreSQL schema. The `public` schema only holds extensions.

- **Application SQL:** Use **unqualified** table names (e.g., `SELECT * FROM projects`). Resolved via `search_path = verifywise` set in Sequelize `afterConnect` hook.
- **NEVER** use `public.tablename` or `verifywise.tablename` in application code (controllers, utils, services).
- **Consolidated DDL migrations** (`20260226234300` through `20260226234302`): Use explicit `verifywise.` prefix for CREATE TABLE, CREATE TYPE, etc.
- **Framework struct tables** (shared, no org_id): `*_struct_*` tables in `20260226234301-public-schema-tables.js`
- **Tenant-scoped tables** (with org_id): in `20260226234302-tenant-tables.js`
- **Seed data:** `20260302111132-seed-framework-struct-data.js`

### Migration Pattern

```javascript
'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    // Use unqualified table names — search_path resolves to verifywise
    await queryInterface.addColumn('users', 'new_field', {
      type: Sequelize.STRING, allowNull: true
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'new_field');
  }
};
```

### Data Migration (Legacy Tenant Schemas)

`Servers/scripts/migrateToSharedSchema.ts` migrates data from old `{tenantHash}` schemas → `verifywise` schema with `organization_id`. Config in `Servers/scripts/migrationConfig.ts` defines table order, FK mappings, and skip lists. Dedicated handlers exist for NIST AI RMF and custom frameworks (struct/impl split).

Key behaviors:
- `copySharedTables()` runs FIRST — copies `roles`, `organizations`, `users`, `tiers`, `subscriptions`, `frameworks` from `public` → `verifywise` with automatic type casting and COALESCE for NOT NULL columns
- Then queries `verifywise.organizations` (via search_path) to discover orgs
- Skips all `llm_evals_*` tables (owned by EvalServer, different schema structure)
- NOT NULL safety check: skips tables where target has NOT NULL columns missing from source
- `SKIP_TABLES` in `migrationConfig.ts` lists tables to skip (all 13 `llm_evals_*` tables + others)

### EvalServer Migrations (Alembic)

EvalServer uses Alembic (not Sequelize) for migrations. All `llm_evals_*` tables are defined in a single consolidated migration.

```bash
cd EvalServer/src
alembic upgrade head                    # Run migrations
alembic downgrade -1                    # Rollback last
```

**Key files:**
- `EvalServer/src/alembic.ini` — Alembic config
- `EvalServer/src/database/migrations/env.py` — Migration environment (creates `verifywise` schema, sets `version_table_schema="verifywise"`)
- `EvalServer/src/database/migrations/versions/c20260303115117_create_shared_schema_tables.py` — All 14 tables (13 `llm_evals_*` + `evalserver_migration_status`)

**Alembic version tracking:** `verifywise.alembic_version` (NOT `public.alembic_version`). The `env.py` drops `public.alembic_version` on startup for backward compatibility with older EvalServer versions.

**EvalServer startup order (Docker & local):**
```bash
alembic upgrade head && uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
```
Alembic runs ONCE before uvicorn spawns workers. Data migration (`run_data_migration()`) runs per-worker in the startup event but is protected by `pg_advisory_lock(8675309)` so only one worker executes it.

**EvalServer data migration:** `EvalServer/src/scripts/migrate_to_shared_schema.py` migrates `llm_evals_*` data from old tenant schemas. Config in `EvalServer/src/scripts/migration_config.py`. Handles JSONB serialization (`json.dumps` for asyncpg), NOT NULL safety checks, and FK remapping with `IdMapping`.

### Running Migrations

```bash
# Main server (Sequelize)
cd Servers
npm run build                    # Build TypeScript first (migrations use dist/)
npx sequelize db:migrate         # Run migrations
npx sequelize db:migrate:undo    # Rollback last

# EvalServer (Alembic)
cd EvalServer/src
alembic upgrade head             # Run migrations
```

---

## 5. Backend Development (Summary)

**Full patterns with code examples:** See `docs/technical/guides/backend-patterns.md`

### Layer Flow

1. **Route** (`Servers/routes/{entity}.route.ts`) — Define endpoints, apply `authenticateJWT`
2. **Controller** (`Servers/controllers/{entity}.ctrl.ts`) — Handle request, validate, call utils, use `logProcessing`/`logSuccess`/`logFailure`, return `STATUS_CODE[xxx](...)`
3. **Utils** (`Servers/utils/{entity}.utils.ts`) — Raw SQL via `sequelize.query()` with unqualified table names and `:replacements` (including `organization_id` for tenant isolation)
4. **Model** (`Servers/domain.layer/models/{entity}/`) — Sequelize-typescript decorators

**Don't forget:** Register new routes in `Servers/index.ts`:
```typescript
import entityRoutes from "./routes/entity.route";
app.use("/api/entities", entityRoutes);
```

---

## 6. Frontend Development (Summary)

**Full patterns with code examples:** See `docs/technical/guides/frontend-patterns.md`

### Layer Flow

1. **Component** (`Clients/src/presentation/components/{Name}/index.tsx`) — Hooks first, handlers, early returns, render
2. **Page** (`Clients/src/presentation/pages/{Name}/index.tsx`) — Uses hooks, loading/error states, PageTitle
3. **Repository** (`Clients/src/application/repository/{entity}.repository.ts`) — CustomAxios calls to API
4. **Hook** (`Clients/src/application/hooks/use{Entity}.ts`) — React Query `useQuery`/`useMutation`
5. **Route** (`Clients/src/application/config/routes.tsx`) — Add `<Route>` inside dashboard

---

## 7. Authentication & Authorization

### JWT Token Payload

```typescript
interface TokenPayload {
  id: number;              // User ID
  email: string;
  organizationId: number;
  tenantId: string;        // Tenant hash
  roleName: string;        // "Admin" | "Reviewer" | "Editor" | "Auditor"
  expire: Date;
}
```

### Roles

| Role ID | Name | Permissions |
|---------|------|-------------|
| 1 | Admin | Full access |
| 2 | Reviewer | Read + approve/reject |
| 3 | Editor | Read + write |
| 4 | Auditor | Read only |

### Usage

```typescript
// Backend: protect routes
import authenticateJWT from "../middleware/auth.middleware";
router.use(authenticateJWT);

// Frontend: check role
const { authToken, role } = useSelector((state) => state.auth);
```

**Detailed middleware reference:** See `docs/claude/middleware.md`

---

## 8. Development Workflow

### Starting Development

```bash
cd Servers && npm install && npm run watch    # Backend (Terminal 1)
cd Clients && npm install && npm run dev      # Frontend (Terminal 2)
cd Servers && npm run worker                  # BullMQ Worker (Terminal 3, optional)
cd EvalServer/src && alembic upgrade head && uvicorn app:app --port 8000 --workers 4  # EvalServer (Terminal 4, optional)
```

### Build

```bash
cd Servers && npm run build    # Backend → /dist
cd Clients && npm run build    # Frontend → /dist
```

### Git Workflow

```bash
# Branch naming
feature/description    fix/description    docs/description

# Commit format: type(scope): description
# Types: feat, fix, docs, style, refactor, test, chore
feat(auth): add password reset functionality
fix(dashboard): resolve chart rendering issue
```

### PR Checklist

- [ ] Code deployed and tested locally
- [ ] Self-review completed
- [ ] Issue number included
- [ ] No hardcoded values
- [ ] UI elements use theme references
- [ ] Tests written/updated
- [ ] No console.log statements
- [ ] No sensitive data exposed

---

## 9. Testing

- **Minimum coverage:** 80%
- **Frontend:** `cd Clients && npm run test` (Vitest)
- **Backend:** `cd Servers && npm run test` (Jest)
- **Convention:** `describe('ComponentName', () => { it('should do X when Y', ...) })`

---

## 10. Environment Configuration

### Backend (.env)

Key variables: `PORT`, `DB_HOST/PORT/NAME/USER/PASSWORD`, `REDIS_HOST/PORT`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `MULTI_TENANCY_ENABLED`, `ENCRYPTION_KEY`, `EMAIL_PROVIDER`, `RESEND_API_KEY`

### Frontend (.env.local)

```env
VITE_APP_API_URL=http://localhost:3000/api
VITE_APP_PORT=5173
VITE_IS_MULTI_TENANT=false
```

### EvalServer (.env in EvalServer/)

Key variables: `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `LLM_EVALS_PORT`

**Note:** EvalServer `.env` is at `EvalServer/.env` (NOT `EvalServer/src/.env`). The `database/config.py` loads it via `Path(__file__).parent.parent.parent / ".env"`. EvalServer may use a different database/port than the main server (e.g., port `5433` vs `5432`).

### Required Services

| Service | Default Port | Required |
|---------|-------------|----------|
| PostgreSQL | 5432 | Yes |
| Redis | 6379 | Yes |
| Backend | 3000 | Yes |
| Frontend | 5173 | Yes |
| EvalServer | 8000 | For LLM Evals |

---

## Quick Reference

### Key Files

| Purpose | Path |
|---------|------|
| Backend entry | `Servers/index.ts` |
| Frontend entry | `Clients/src/main.tsx` |
| Route definitions (BE) | `Servers/routes/*.ts` |
| Route definitions (FE) | `Clients/src/application/config/routes.tsx` |
| Database models | `Servers/domain.layer/models/` |
| Shared schema migration (main) | `Servers/scripts/migrateToSharedSchema.ts` |
| Migration config (main) | `Servers/scripts/migrationConfig.ts` |
| EvalServer entry | `EvalServer/src/app.py` |
| EvalServer DB config | `EvalServer/src/database/config.py` |
| EvalServer Alembic env | `EvalServer/src/database/migrations/env.py` |
| EvalServer DDL migration | `EvalServer/src/database/migrations/versions/c20260303115117_*.py` |
| EvalServer data migration | `EvalServer/src/scripts/migrate_to_shared_schema.py` |
| EvalServer migration config | `EvalServer/src/scripts/migration_config.py` |
| Auth middleware | `Servers/middleware/auth.middleware.ts` |
| Axios config | `Clients/src/infrastructure/api/customAxios.ts` |
| Redux store | `Clients/src/application/redux/store.ts` |
| Custom exceptions | `Servers/domain.layer/exceptions/custom.exception.ts` |
| Log helper | `Servers/utils/logger/logHelper.ts` |

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Variables/Functions | camelCase | `getUserData`, `isValid` |
| Components/Classes | PascalCase | `UserProfile`, `AuthService` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Files (Components) | PascalCase | `UserProfile.tsx` |
| Files (Utilities) | camelCase | `formatDate.ts` |
| Database Tables | snake_case | `user_profiles` |
| API Endpoints | kebab-case | `/api/user-profiles` |

### Common Commands

```bash
date +%Y%m%d%H%M%S                              # Get timestamp for migrations
cd Servers && npx sequelize migration:create --name name
cd Servers && npm run build && npx sequelize db:migrate
cd Servers && npm run watch                      # Start backend
cd Clients && npm run dev                        # Start frontend
cd EvalServer/src && alembic upgrade head && uvicorn app:app --port 8000 --workers 4  # EvalServer
```

---

## Detailed References

Read the relevant file BEFORE implementing changes in that area:

| When working on... | Read this file |
|---------------------|---------------|
| Backend controller/route/utils patterns | `docs/technical/guides/backend-patterns.md` |
| Frontend component/page/hook patterns | `docs/technical/guides/frontend-patterns.md` |
| Adding a new feature (full guide) | `docs/technical/guides/adding-new-feature.md` |
| Adding a new framework | `docs/technical/guides/adding-new-framework.md` |
| API conventions | `docs/technical/guides/api-conventions.md` |
| Code style | `docs/technical/guides/code-style.md` |
| Plugin system | `docs/technical/infrastructure/plugin-system.md` |
| API routes & endpoints | `docs/technical/api/endpoints.md` |
| Background jobs (BullMQ) | `docs/technical/infrastructure/automations.md` |
| Email templates (MJML) | `docs/technical/infrastructure/email-service.md` |
| PDF/DOCX reporting | `docs/technical/infrastructure/pdf-generation.md` |
| File upload system | `docs/technical/infrastructure/file-storage.md` |
| Change history tracking | `docs/claude/change-history.md` |
| Error handling & exceptions | `docs/claude/error-handling.md` |
| Logging system | `docs/claude/logging.md` |
| Middleware (rate limit, RBAC, JWT, Redis) | `docs/claude/middleware.md` |
| Assessments, subscriptions, tokens, etc. | `docs/claude/additional-apis.md` |
| Approval workflows | `docs/technical/domains/approvals.md` |
| AI Detection | `docs/technical/domains/ai-detection.md` |
| Post-market monitoring | `docs/technical/domains/post-market-monitoring.md` |
| Notifications | `docs/technical/domains/notifications.md` |
| Risk management | `docs/technical/domains/risk-management.md` |
| Vendors | `docs/technical/domains/vendors.md` |
| Policies | `docs/technical/domains/policies.md` |
| Datasets | `docs/technical/domains/datasets.md` |
| Use cases / projects | `docs/technical/domains/use-cases.md` |
| Tasks | `docs/technical/domains/tasks.md` |
| Incidents | `docs/technical/domains/incidents.md` |
| Evidence hub | `docs/technical/domains/evidence.md` |
| Models / model inventory | `docs/technical/domains/models.md` |
| Training registry | `docs/technical/domains/training.md` |
| Search | `docs/technical/domains/search.md` |
| Share links | `docs/technical/domains/share-links.md` |
| Dashboard | `docs/technical/domains/dashboard.md` |
| Compliance frameworks | `docs/technical/domains/compliance-frameworks.md` |
| MUI theming & design tokens | `docs/technical/guides/design-tokens.md` |
| Frontend styling | `docs/technical/frontend/styling.md` |
| Frontend components | `docs/technical/frontend/components.md` |
| Redux, Axios, frontend architecture | `docs/technical/frontend/overview.md` |
| AI Advisor | `docs/technical/infrastructure/ai-advisor.md` |
| Integrations (Slack, GitHub) | `docs/technical/infrastructure/integrations.md` |
| Docker & deployment | `docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md` |
| CI/CD workflows | `docs/deployment/README.md` |
| Database schema | `docs/technical/architecture/database-schema.md` |
| Authentication architecture | `docs/technical/architecture/authentication.md` |
| Multi-tenancy architecture | `docs/technical/architecture/multi-tenancy.md` |
| Testing guide | `docs/technical/guides/testing.md` |
| EvalServer (LLM evaluations) | `EvalServer/src/app.py` (entry), `EvalServer/src/database/` (DB + migrations) |

---

## Additional Resources

- [Code Rules](./CodeRules/README.md) - Detailed coding standards
- [Plugin System](./docs/PLUGIN_SYSTEM.md) - Plugin architecture
- [Technical Docs](./docs/technical/) - Architecture documentation
- [API Docs](./Servers/swagger.yaml) - OpenAPI specification
- [Agent Roles](./agents/) - AI-assisted development roles
