# Architecture Brief: Cross-Tenant Isolation Initiative

**Initiative:** Cross-tenant security review and isolation test matrix  
**Phase:** 2 — Technical & Design Assessment  
**Target output path:** `Servers/tests/integration/tenant-isolation/` + supporting policy/CI/docs artifacts  
**Prepared by:** Technical Lead  

---

## 1. Executive Summary

We will keep VerifyWise's shared-schema, row-level multi-tenancy model and harden it with a reusable Jest + Supertest isolation matrix. The matrix seeds two organizations per test, attempts cross-tenant reads and writes through the real HTTP surface, and asserts that every organization-scoped entity rejects or ignores foreign-organization access. A schema-drift audit will compare tables carrying `organization_id` against a policy registry and fail CI when a new scoped entity is not covered.

---

## 2. Assumptions

- The project continues to use **shared-schema tenancy** via a non-nullable `organization_id` column; schema-per-tenant or RLS are out of scope for this phase.
- Authentication remains JWT-based and `authenticateJWT` (`Servers/middleware/auth.middleware.ts`) is the single source of `req.organizationId` for HTTP requests.
- Integration tests run with `NODE_ENV=test`, use `createTestApp({ bypassAuth: true })` from `Servers/tests/integration/setup.ts`, and rely on `runMigrations()` + raw `sequelize.query()` for seeding and cleanup.
- Existing factories in `Servers/tests/factories/` are **data builders only**; new or extended factories will persist records via `sequelize.query()` or Sequelize models, consistent with `Servers/tests/integration/helpers.ts`.
- SuperAdmin (`role_id = 5`, `req.isSuperAdmin === true`) is the only role permitted to bypass organization scoping, and only on documented routes.
- Background jobs use BullMQ; workers receive `organizationId` inside `job.data` and are mocked in integration tests.
- The CI runner provides a PostgreSQL service matching the existing `test:integration` configuration.

---

## 3. Affected System Layers & Files

| Layer | Files / Directories | Nature of change |
|-------|---------------------|------------------|
| **Test infrastructure** | `Servers/tests/integration/tenant-isolation/` (new directory) | Registry, harness, and per-entity isolation tests. |
| | `Servers/tests/integration/setup.ts` | May extend `TestAppOptions` or `DEFAULT_MOCK_USER` if needed for super-admin test cases. |
| | `Servers/tests/integration/helpers.ts` | Extend cleanup `TRUNCATE` list; add reusable two-org seed helper; reuse deadlock-retry pattern. |
| | `Servers/tests/factories/index.ts` + entity factories | Add/extend factories for `files` and any other scoped entity that lacks a persistence helper. |
| **Auth / tenant context** | `Servers/middleware/auth.middleware.ts` | No rewrite; verify AsyncLocalStorage store is always populated before `next()`. |
| | `Servers/utils/tenant/tenantContext.ts` | Make `organizationId` retrieval fail-closed where consumed by services (design decision, not necessarily this file's signature). |
| | `Servers/utils/context/context.ts` | Review store shape; ensure `organizationId` propagation is deterministic. |
| **Controllers / services / raw SQL** | `Servers/controllers/`, `Servers/utils/`, `Servers/services/` | Fixes for P0 cross-tenant leaks discovered by the matrix; no interface changes unless gaps require them. |
| **CI / workflow** | `.github/workflows/backend-checks.yml` | Add isolation matrix job and schema-drift audit step. |
| | `.github/pull_request_template.md` | Add isolation checklist item. |
| **Scripts** | `Servers/scripts/auditTenantIsolationCoverage.ts` (new) | Query `information_schema.columns` and compare against registry. |
| **Documentation** | `docs/technical/security/tenant-isolation.md` (new) | One-page policy + runbook. |
| | `Servers/CLAUDE.md` | Link to the runbook. |

---

## 4. High-Level Approach

1. **Policy first.** Write `docs/technical/security/tenant-isolation.md` defining scoped entities, the SuperAdmin exception, propagation rules, and examples of correct/incorrect queries.
2. **Schema pre-audit.** Run `auditTenantIsolationCoverage.ts` locally against a migrated test database to discover every table with `organization_id` and triage P0 gaps before enabling the CI gate.
3. **Registry.** Create `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` declaring each entity, its table(s), factory/import path, route prefixes, and the operations to test (list, get, put, patch, delete, create, bulk-create).
4. **Harness.** Create `Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts` with helpers:
   - `seedTwoOrgsAndUsers()` → returns org A/B IDs, user A/B IDs, and authenticated app instances.
   - `createResourceInOrgA(appA, route, payload)` → returns the created resource ID.
   - `assertCrossTenantDenial(appB, method, route, id)` → asserts `404`/`403` for GET/PUT/PATCH/DELETE.
   - `assertCreateStampsCallerOrg(app, route, payloadWithForeignOrg)` → asserts response `organization_id === callerOrg`.
5. **Per-entity tests.** Add `*.isolation.test.ts` files for projects, files, users, risks, tasks, and super-admin. Each file imports the registry entry and harness; tests run with `createTestApp({ bypassAuth: true })`.
6. **Fix P0 leaks.** Pair with feature teams to fix critical cross-tenant read/write paths surfaced by the matrix; track non-P0 findings as risk-accepted tickets.
7. **Enable CI gate.** Add the audit script and the isolation matrix to `backend-checks.yml` once the matrix passes locally.
8. **Workflow embedding.** Update the PR template and `Servers/CLAUDE.md`; schedule pairing sessions with active feature teams.

---

## 5. Test Matrix Design

### 5.1 Registry

`Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` exports:

```ts
export interface IsolationEntity {
  name: string;                 // e.g. "projects"
  tables: string[];             // e.g. ["projects"]
  factory: string;              // import path to persistence factory/helper
  baseRoute: string;            // e.g. "/api/projects"
  operations: IsolationOperation[];
  bulkCreateRoute?: string;     // e.g. "/api/projects/bulk"
  createPayload: Record<string, unknown>;
  updatePayload: Record<string, unknown>;
}
```

The registry is the single source of truth both for Jest tests and for the schema-drift audit.

### 5.2 Harness

`Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts`:

- **`seedTwoOrgsAndUsers(roleId = 1)`**
  - Creates two organizations via `createTestOrganization()`.
  - Creates one user per organization via `createTestUser()` using unique fake emails.
  - Returns `{ orgA, orgB, userA, userB, appA, appB }` where `appA`/`appB` are `createTestApp({ bypassAuth: true, mockUser: { ... } })`.
- **`createResource(app, route, payload)`**
  - POSTs to the entity route and returns the created record ID from `res.body.data.id` (with fallback to `res.body.data[0].id` for bulk).
- **`assertCrossTenantDenial(appB, resourceId, { getRoute, updateRoute, deleteRoute })`**
  - GET → expects `404`.
  - PUT/PATCH → expects `404` or `403`.
  - DELETE → expects `404` or `403`.
- **`assertListOnlyOwnOrg(app, appOther, createOther)`**
  - Verifies list endpoint returns only the caller's rows.
- **`assertCreateStampsCallerOrg(app, route, payload, callerOrgId)`**
  - Sends a payload containing `organization_id: <otherOrg>` and asserts the response/DB row has `organization_id === callerOrgId`.

### 5.3 Test files

One file per required entity under `Servers/tests/integration/tenant-isolation/`:

- `projects.isolation.test.ts`
- `files.isolation.test.ts`
- `users.isolation.test.ts`
- `risks.isolation.test.ts`
- `tasks.isolation.test.ts`
- `super-admin.isolation.test.ts` (validates bypass only on designated routes and read-only enforcement outside `/api/super-admin`)

Each file follows the pattern in `Servers/tests/integration/governance-os.cross-tenant.test.ts`:

```ts
beforeAll(() => runMigrations());
beforeEach(async () => { /* seed via harness */ });
afterEach(async () => { await cleanupDatabase(); });
```

### 5.4 Factory reuse and extension

- Reuse `createTestOrganization()` and `createTestUser()` from `Servers/tests/integration/helpers.ts`.
- Reuse existing data-builder factories (`buildProject`, `buildRisk`, `buildTask`) for shape defaults, but add persistence helpers that insert rows and return IDs (e.g., `createTestProject(orgId)`, `createTestFile(orgId, projectId)`).
- Add a `files` factory or helper because the current factory index does not include one.

### 5.5 Cleanup strategy

- Each test calls `cleanupDatabase()` in `afterEach`, reusing the deadlock-retry loop from `helpers.ts`.
- Extend the `TRUNCATE` statement to include any new scoped tables touched by the matrix (e.g., `files`, `risks`, `tasks` and their join tables).
- Use unique fake emails per test to avoid collisions if a previous cleanup partially fails.

---

## 6. Schema Drift Audit Design

`Servers/scripts/auditTenantIsolationCoverage.ts` runs after migrations and:

1. Connects to the test database via the existing `sequelize` instance.
2. Queries `information_schema.columns`:
   ```sql
   SELECT table_name
   FROM information_schema.columns
   WHERE table_schema = 'verifywise'
     AND column_name = 'organization_id';
   ```
3. Loads the registry and flattens all `tables` arrays.
4. Computes the diff:
   - **Uncovered tables:** have `organization_id` but are not in the registry → **fail** with named table and a link to the runbook.
   - **Registry tables missing in schema:** registry references a non-existent table → **fail** (prevents stale registry entries).
5. Supports a `sharedTables` allow-list for intentionally shared/global tables (e.g., `organizations` itself, seed tables). Each entry requires a `justification` comment.
6. Exits `0` on success, `1` on failure, printing a machine-readable JSON block:
   ```json
   {
     "uncoveredTables": ["vendors"],
     "missingTables": [],
     "sharedTables": ["organizations"],
     "runbook": "docs/technical/security/tenant-isolation.md"
   }
   ```

---

## 7. CI Gate Design

Update `.github/workflows/backend-checks.yml` with a new job (or extend `lint-and-build`) under the `Servers` working directory:

```yaml
  tenant-isolation:
    name: Tenant Isolation Matrix
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: Servers
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: verifywise_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: "22"
      - run: npm ci
      - run: npm run test:integration -- --testPathPattern=tenant-isolation
      - run: npx ts-node scripts/auditTenantIsolationCoverage.ts
```

Notes:

- Use the existing `test:integration` script pattern (`--globalSetup`, `--runInBand`) so migrations run once.
- The audit script runs **after** the matrix so it validates the same migrated schema the tests used.
- CI failure messages must name the uncovered entity and link to `docs/technical/security/tenant-isolation.md`.
- Target runtime: under 120 seconds. If the full matrix exceeds this, parallelize by entity across jobs or optimize `cleanupDatabase()`.

---

## 8. Data Model / API Contract Changes

No data-model or public API contract changes are expected.

Potential factory/model tweaks:

- Add `files` persistence helper(s) and factory shape.
- Extend `Servers/tests/integration/helpers.ts` `cleanupDatabase()` `TRUNCATE` list.
- Optionally add `isSuperAdmin` handling to `createTestApp` defaults if needed for super-admin tests (current `DEFAULT_MOCK_USER` already supports `isSuperAdmin`).

---

## 9. Breaking Change Assessment

| Risk area | Impact | Mitigation |
|-----------|--------|------------|
| **CI runtime** | Medium — adding integration tests and an audit step increases `backend-checks.yml` duration. | Run the matrix only on `Servers/**` path changes; keep target under 120s; run `--runInBand` to avoid DB contention. |
| **Local test suite** | Low — `npm test` currently ignores integration tests; the matrix does not change that. | Developers opt-in via `npm run test:integration`. |
| **Cleanup cascade** | Low — extending `TRUNCATE` may surface missing foreign-key dependencies. | Run locally first; add dependent tables in dependency order. |
| **CI gate initially fails** | High — the first audit may reveal many uncovered tables. | Run a pre-audit before merging the gate; fix P0 leaks or explicitly risk-accept them with tickets. |
| **Developer workflow** | Low — new PR checklist item adds friction but is required by the policy. | Pair with teams before enforcement. |

---

## 10. Technical Risks & Mitigations

1. **Many raw SQL queries omit `organization_id`.**
   - *Mitigation:* The matrix tests HTTP endpoints, so it exercises controllers and the SQL they call. P0 failures are fixed before the gate is enabled; non-P0 findings are ticketed and risk-accepted.
2. **AsyncLocalStorage context is lost across async boundaries.**
   - *Mitigation:* Audit every service that reads `getCurrentTenantContext()` and make it throw `ForbiddenError` when `organizationId` is missing. Add unit tests for context propagation and BullMQ job data.
3. **SuperAdmin bypass becomes the path of least resistance.**
   - *Mitigation:* Restrict bypass to explicit route allow-lists; enforce read-only outside `/api/super-admin`; require audit entries; review usage quarterly.
4. **Tests assert `404` when the real behavior returns `403`.**
   - *Mitigation:* The harness accepts `404` or `403` for cross-tenant write attempts. Each entity test documents the expected status and logs discrepancies for review.
5. **Schema-drift audit false positives for shared tables.**
   - *Mitigation:* Maintain a justified `sharedTables` allow-list inside the audit script; require a code-owner review for any addition.

---

## 11. Preliminary Task Decomposition

| # | Task | Depends on | Suggested assignee |
|---|------|------------|--------------------|
| 1 | Write policy runbook at `docs/technical/security/tenant-isolation.md` and link from `Servers/CLAUDE.md`. | — | Technical Lead / Security reviewer |
| 2 | Implement `Servers/scripts/auditTenantIsolationCoverage.ts` and run local pre-audit. | — | Senior backend developer |
| 3 | Create `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts`. | #2 | Senior backend developer |
| 4 | Create `Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts` and extend helpers/factories. | #3 | Senior backend developer |
| 5 | Add per-entity isolation tests for projects, files, users, risks, tasks. | #4 | Backend developers (one per entity) |
| 6 | Add `super-admin.isolation.test.ts` and verify audit-entry expectations. | #4 | Senior backend developer |
| 7 | Triage and fix P0 cross-tenant leaks surfaced by the matrix. | #5, #6 | Feature teams + Technical Lead |
| 8 | Update `backend-checks.yml` with tenant-isolation job and audit step. | #7 | DevOps engineer |
| 9 | Update `.github/pull_request_template.md` isolation checklist. | #1 | Technical Lead |
| 10 | Pair with active feature teams and enable the CI gate. | #8, #9 | Orchestrator / Technical Lead |

---

## 12. Open Questions for Product Manager / Stakeholders

1. **Scope expansion:** Beyond the five required entities (projects, files, users, risks, tasks), which existing `organization_id` tables should be covered in the first pass? For example, should `vendors`, `assessments`, `controls`, or organizational frameworks be included now or in a follow-up sprint?
2. **Audit target:** Should the schema-drift audit run against the live migrated test database in CI, or against a static snapshot derived from Sequelize migrations? The live approach is more accurate but couples the audit to migration state.
3. **SuperAdmin enforcement:** Should the SuperAdmin bypass route allow-list be enforced centrally by middleware (e.g., `superAdminOnly`) or remain as explicit per-controller checks? A middleware approach is more auditable; per-controller checks are less invasive.
4. **BullMQ / worker scope:** Do we need equivalent tenant-propagation rules and tests for Python services (`AIGateway/`, `EvalServer/`) that may call the Node backend, or are they considered internal and out of scope?
5. **Security event logging:** Should failed cross-tenant access attempts be logged as dedicated security events for alerting, or is the existing request logging sufficient?
6. **Gate enablement date:** What is the target date to enable the CI gate, and which sprint should be reserved for the pre-audit remediation window?
