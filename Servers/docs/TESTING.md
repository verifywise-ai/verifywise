# Backend testing plan (Servers/)

This document is the single entry point for the VerifyWise Node.js backend test
strategy. Every command below was verified against `Servers/package.json`
scripts and `Servers/jest.config.js` on branch `chore/debora-one-fix-to-all`.

## 1. Framework and boundaries

- **Runner:** jest 30 + ts-jest (`jest.config.js`), `testEnvironment: "node"`.
  One jest config serves all suites; boundaries are enforced with
  `--testPathIgnorePatterns` / `--testMatch`, not separate configs.
- **`npm run test:unit`** — everything **except** `tests/integration/` and
  `/helpers/`. No Postgres, no Redis required: `tests/integration/setup.ts`
  mocks `database/redis`, BullMQ, and the notification services, so the Express
  app boots against a stubbed data layer. The schema-compile gate and the AI
  Gateway proxy pack (see §5, §6) live here.
- **`npm run test:integration`** — `--testMatch="**/tests/integration/**/*.test.ts"`
  with `tests/integration/globalSetup.js`, `--runInBand`. Postgres-backed:
  globalSetup creates the test database if missing, runs `npm run build`
  (tsc) and `npx sequelize db:migrate`, and `tests/testDatabaseGuard.js`
  **refuses to run against the development database** (it compares `DB_NAME`
  against the `DB_NAME` in `Servers/.env`).
- **`npm run test:smoke`** — the `deadline-summary` integration test only; a
  fast post-deploy canary. `npm run test:ratelimit` — the rate-limiting pack.
- **`npm run smoke:api-contract`** — a live-server smoke gate
  (`scripts/apiContractSmoke.ts`) for the top-10 endpoints against a running
  backend (`API_BASE_URL`, E2E admin credentials). Complements, does not
  replace, the jest contract pack in §5.

### What belongs where

| Suite                     | Location                                                   | Needs Postgres | Runs in            |
| ------------------------- | ---------------------------------------------------------- | -------------- | ------------------ |
| Unit / contract (DB-free) | `tests/contract/`, `*/__tests__/`, `middleware/__tests__/` | no             | `test:unit`        |
| Integration (DB-backed)   | `tests/integration/**`                                     | yes            | `test:integration` |
| Tenant isolation          | `tests/integration/tenant-isolation/`                      | yes            | `test:integration` |
| Performance               | `tests/perf/**` (owned by another team)                    | yes            | dedicated CI job   |

## 2. Running the Postgres-backed suites locally

1. **Database.** The compose stack's database service is `postgresdb`
   (`docker-compose.yml`, `postgres:16.8`). Any local Postgres 14+ works.

   ```powershell
   docker compose up -d postgresdb
   ```

2. **Test env.** Create `Servers/.env.test` (gitignored) — never point it at the
   dev database, the guard will (rightly) refuse to truncate it:

   ```
   NODE_ENV=test
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=verifywise_test
   DB_USER=postgres
   DB_PASSWORD=***
   ```

3. **Run:**

   ```powershell
   cd Servers
   npm run test:integration          # full pack (build + migrate via globalSetup)
   ```

   To iterate on a single pack without the full globalSetup build, build and
   migrate once, then target files:

   ```powershell
   npm run build
   $env:NODE_ENV='test'; npx sequelize db:migrate
   node node_modules/jest/bin/jest.js --config jest.config.js `
     --globalSetup="<rootDir>/tests/integration/globalSetup.js" `
     --testPathPatterns="tests/integration/caching" --runInBand --forceExit
   ```

4. **Harness conventions** (`tests/integration/setup.ts`, `helpers.ts`):
   - `createTestApp({ bypassAuth, mockUser })` builds the real app on
     `127.0.0.1:0` (never wildcard); `testRequest(app)` is a supertest agent.
     Auth bypass only works with `NODE_ENV=test` and short-circuits **before**
     the RLS middleware — flag-on RLS tests must log in with a real JWT.
   - `cleanupDatabase()` truncates every tenant table and re-seeds roles 1–4;
     call it in `afterEach`. Hooks need `jest.setTimeout(60_000)` — seeding
     plus truncation routinely exceeds the 5 s default.

## 3. Factories (`tests/factories/`)

- `test-entities.factory.ts` — direct-SQL row creators: `createTestProject`,
  `createTestTask`, `createTestRisk`, `createTestVendor`, `createTestFile`,
  `createTestAssessment`, `createTestControlEU`, `linkRiskToProject`,
  `linkVendorToProject`, `assignTaskToUser`, MRM/incident/evidence helpers.
- `organization/user/project/risk/task/vendor.factory.ts` — lightweight
  `build*` shape builders for unit tests.
- `tests/integration/helpers.ts` — `createTestOrganization`,
  `createTestUser`, `seedTwoOrgsAndUsers`, `seedFrameworks`,
  `cleanupDatabase`, `runMigrations`.
- `tests/integration/tenant-isolation/tenantIsolation.fixtures.ts` +
  `tenantIsolation.harness.ts` — cross-tenant seeding and denial assertions
  (`assertReadDenied`, `assertUpdateDenied`, `assertDeleteDenied`,
  `assertListOnlyOwnOrg`, `assertCreatedRowStampedWithCallerOrg`). Every denial
  assertion carries an **owner positive control** so a missing route fails
  instead of masquerading as a 404 denial.

The packs added for the #41xx/#46xx wave needed no new factories — the
existing helpers covered every entity they seed.

## 4. Contract pack (#4502)

Files:

- `tests/contract/swagger.schema-compile.test.ts` (DB-free, `test:unit`) —
  loads `swagger.yaml`, asserts the ten high-traffic routes (dashboard,
  projects, tasks, projectRisks, files, users, notifications/summary) are
  documented, and compiles every declared response schema with ajv +
  ajv-formats (devDependencies; the same validator `scripts/apiContractSmoke.ts`
  uses — nothing new installed).
- `tests/integration/contract/openapi.contract.test.ts` (Postgres-backed) —
  seeds each route, calls it through the real app, validates the live response
  against the swagger 200 schema.

Drift policy: structural guarantees (route documented, 200, JSON body) are
hard assertions. Schema mismatches are **drift**, recorded and matched against
`KNOWN_DRIFT` in the test file; new drift fails, triaged drift is warned and
burnt down as follow-ups.

### Current drift inventory (observed 2026-10-20, follow-up tasks)

| Route                                                                                         | Drift                                                                                              |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /dashboard`, `GET /tasks`, `GET /tasks/{id}`, `GET /files`, `GET /notifications/summary` | 200 response has **no schema** in swagger.yaml — nothing to validate against yet                   |
| `GET /tasks/{id}`, `GET /projectRisks/{id}`                                                   | responses declare `200, 401, 500` — **missing 404** (and 403); the API returns both                |
| `GET /projectRisks`, `GET /projectRisks/{id}`                                                 | swagger says `risk_category` is an array; the API serializes it as a comma-joined string (or null) |

`GET /projects`, `GET /projects/{id}`, `GET /users` validate clean.

## 5. AI Gateway proxy integration (#4505, node side)

File: `tests/contract/aiGateway.proxy.test.ts` (DB-free, `test:unit`).

Calls `/api/ai-gateway/*` through the real Express route with the Python
AIGateway **mocked at the HTTP level** (a throwaway Node HTTP server pointed to
by `AI_GATEWAY_URL`). `http-proxy-middleware` is replaced by a functional
stand-in via `jest.mock` (the real v4 build is ESM and cannot load under the
CJS jest runtime; the jest `moduleNameMapper` pass-through mock would not
proxy at all). The stand-in drives the route's own config hooks (`router`,
`pathRewrite`, `on.proxyReq`, `on.error`) over real sockets, so header
forwarding and error fallback are exercised end to end; the options wiring
against the real library is separately covered by
`routes/__tests__/gatewayProxyTarget.test.ts`.

Pinned contract (grep-verified against `Clients/src`):

- `GET /ai-gateway/spend/exists` → `{ has_logs: boolean }`
- `GET /ai-gateway/spend?period=` → `{ summary, by_day }`
- `GET /ai-gateway/spend/by-endpoint` / `by-user` → `{ data: [...] }`
- `GET /ai-gateway/guardrails/stats` → `{ summary, byType }`
- `GET /ai-gateway/cache/stats` → `{ stats }`
- tenant headers forwarded from the JWT context (`x-organization-id`,
  `x-user-id`, `x-role`) plus `x-internal-key`; client-supplied tenant headers
  are stripped
- gateway down: GET degrades to `200 { data: [] }`; non-GET returns 502 JSON.

## 6. Caching validation pack (#4679-a/b)

Files in `tests/integration/caching/` (Postgres-backed):

- `cache-headers.contract.test.ts` — per route class: authenticated API
  responses must never be _explicitly_ cacheable (`public`, positive
  `max-age`, `s-maxage`). Absence of `Cache-Control` is the current safe
  default (RFC 9111 §3.2 keeps shared caches from storing authorized
  responses); routes that set their own header (`/api/notifications/stream`,
  `/api/advisor/*`) must use `no-cache`.
- `cache-aside.invalidation.test.ts` — write→read freshness: create/update/
  delete are visible to the very next GET (repeat reads included), repeated
  reads are byte-identical. This is the canary a future cache layer must keep
  green (invalidation on write).
- `tenant-cache.isolation.test.ts` — repeated attacker reads (miss, then
  would-be cache hits) never return another tenant's rows and never carry a
  shared-cache directive.

**Follow-up (declared end-state):** authenticated JSON responses should carry
`no-store`. The app does not emit it yet, so asserting it today would fail;
when the no-store middleware lands, tighten `cache-headers.contract.test.ts`
and record the burndown here.

**Public static assets:** the Express app mounts no static-asset routes (the
Clients build is served by nginx); a placeholder test pins that boundary so a
future `express.static` mount cannot land without cache-class tests.

## 7. RLS enforcement pack (#4680)

- `tests/integration/tenant-isolation/rls.enforcement.test.ts` — runs with
  `RLS_ENFORCEMENT_ENABLED=true` set **before** `database/db` is imported (the
  query-scoping wrapper is applied at module load; static imports are hoisted,
  so this file uses `require()` after setting the env var) and authenticates
  with real JWT logins (the harness auth bypass short-circuits before
  `rlsEnforcement`). Asserts: 0 leaked rows across projects/tasks/risks with
  owner positive controls, denied cross-tenant writes leave rows unchanged,
  and owner writes commit inside the per-request RLS transaction and read
  back fresh.
- `deferred-tables.burndown.test.ts` — parses
  `scripts/auditTenantIsolationCoverage.ts` (read-only for this pod) and
  asserts `deferredScopedTables` stays under the baseline ceiling (212 at
  capture). The list must only shrink; lower the constant when a wave lands.
- The declarative matrix (`tenantIsolation.matrix.test.ts`) already proves
  cross-tenant read/write denial for every registry entity with the flag off.

**CI wiring note (owned by the workflow pod):** the tenant-isolation pack
should run **twice** — once with `RLS_ENFORCEMENT_ENABLED` unset (app-level
scoping, the default) and once with `RLS_ENFORCEMENT_ENABLED=true` (the
flag-on file above proves the second mode; the env must be set for the whole
jest process, not per test). The fail-closed path (no org context → 500) is
unit-covered in `middleware/__tests__/rls.middleware.test.ts`; the SuperAdmin
exemption is out of scope per the RLS runbook.

## 8. Quick reference

```powershell
cd Servers
npm run test:unit                    # DB-free: unit + contract + proxy packs
npm run test:integration             # everything under tests/integration (Postgres)
npm run test:smoke                   # deadline-summary canary
npm run smoke:api-contract           # live-server top-10 gate (needs running backend)
npm run build                        # tsc — must stay green (CI runs it in globalSetup)
```
