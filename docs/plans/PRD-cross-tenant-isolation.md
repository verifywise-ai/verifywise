# Product Requirements Document: Cross-tenant security review and isolation test matrix

## 1. Problem Statement

VerifyWise stores all tenant data in a single PostgreSQL schema (`verifywise`) and isolates tenants at the row level via an `organization_id` column. A single missing `WHERE organization_id = :organizationId` clause, a service call that omits the tenant context, or a raw SQL query built without scoping can expose one customer's projects, files, risks, users, or tasks to another. Because there is no automated, reusable test matrix that proves isolation for every organization-scoped entity, regressions are only caught by manual review or, worse, in production. The business impact ranges from data-breach liability and compliance failures (EU AI Act, ISO 27001, SOC 2) to loss of customer trust.

## 2. Goals & Success Metrics

| Goal | Success Metric |
|------|----------------|
| Define a clear isolation policy | Policy document is approved, stored in `docs/technical/security/tenant-isolation.md`, and linked from `Servers/CLAUDE.md` |
| Prove isolation for core entities | Integration test matrix covers projects, files, users, risks, and tasks with ≥ 95% isolation assertion pass rate on first run |
| Make isolation testing reusable | Any new entity can be added to the matrix with a single factory and a single test-case declaration |
| Gate new scoped entities in CI | `backend-checks.yml` runs the matrix and fails if a new `organization_id` table has no corresponding isolation test entry |
| Fix existing gaps | All P0 cross-tenant findings are triaged within one sprint and resolved or risk-accepted before the policy is enforced |
| Embed policy in team workflow | PR template includes an isolation checklist item; at least 3 PRs adding new scoped entities are signed off by the orchestrator |

**Target outcome:** No organization-scoped entity can be read or modified by a principal from another organization unless explicitly allowed by a documented super-admin exception.

## 3. Scope

In scope for this initiative:

- Specifying which tables/entities must carry `organization_id` and be covered by the isolation matrix.
- Identifying roles that may bypass organization scoping and under what conditions.
- Defining how `organizationId` must propagate through HTTP requests, service calls, background jobs, and raw SQL.
- Creating a reusable Jest + Supertest isolation test matrix under `Servers/tests/integration/tenant-isolation/`.
- Adding test factories for projects, files, users, risks, and tasks (reusing or extending existing factories in `Servers/tests/factories/`).
- Updating `backend-checks.yml` to treat the matrix as a required CI gate.
- Updating `.github/pull_request_template.md` with an isolation checklist.
- Writing the one-page security runbook at `docs/technical/security/tenant-isolation.md`.
- Pairing with developers to apply the policy to their current and next tasks.

## 4. Out of Scope

Explicitly out of scope:

- Replacing the shared-schema isolation model with schema-per-tenant or database-per-tenant.
- Rewriting the authentication system or JWT handling.
- Adding row-level security (RLS) policies in PostgreSQL in this phase (may be a future hardening layer).
- Auditing non-tenant data such as global framework definitions, public seeds, or system configuration tables.
- Changing the frontend; this initiative is backend/test/CI/policy only.
- Penetration testing by an external firm; this is an engineering-owned automated test matrix.

## 5. User Stories

### Story 1 — Security reviewer
> As a security reviewer, I want an automated matrix that fails CI when a new organization-scoped entity lacks a cross-tenant isolation test, so that isolation regressions cannot be merged silently.

**Acceptance criteria:**
- A registry file lists every covered entity and its isolation test entry point.
- CI compares the registry against the database schema and fails if a table with `organization_id` is missing from the registry.
- The failure message names the missing entity and the file that should be added.

### Story 2 — Backend developer adding a scoped entity
> As a backend developer, I want a reusable test helper that seeds two organizations and attempts cross-tenant reads/writes for my new entity, so that I can prove isolation without writing boilerplate.

**Acceptance criteria:**
- A shared helper creates org A, org B, a user in each, and a resource in org A.
- One function call asserts that org B receives `404`/`403` for GET/PUT/DELETE/PATCH on that resource.
- One function call asserts that bulk-create ignores a supplied `organization_id` and stamps the caller's org.

### Story 3 — Platform engineer running service-to-service calls
> As a platform engineer, I want middleware and service contracts to enforce `organizationId` propagation, so that background jobs and internal API calls do not accidentally execute outside a tenant context.

**Acceptance criteria:**
- AsyncLocalStorage tenant context is populated on every authenticated HTTP request.
- Services that run outside an HTTP request must accept an explicit `organizationId` parameter; a lint rule rejects calls that omit it.
- A missing tenant context causes the operation to fail closed (deny by default) rather than defaulting to a global scope.

## 6. Isolation Policy

### 6.1 Entity scoping

Every table that contains tenant-owned business data must have a non-nullable `organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE` column and must be covered by the isolation matrix.

**Minimum required coverage for this initiative:**

| Entity | Table(s) | Notes |
|--------|----------|-------|
| Projects | `projects` | Core tenant boundary; project membership is also scoped |
| Files | `files` / `file_manager_*` | File metadata and storage tenancy must match |
| Users | `users` | Users belong to exactly one organization; cross-org invites create a new user record |
| Risks | `risks` | Risk registers are per-project and therefore per-organization |
| Tasks | `tasks` | Task assignments must not leak across orgs |

Additional entities discovered during audit must be added to the registry and matrix before their PR is merged.

### 6.2 Role exceptions

Only the **SuperAdmin** role (`role_id = 5`, `req.isSuperAdmin === true`) may bypass organization scoping, and only for explicit platform-administration operations documented in the runbook. No other role — including org admins, managers, or reviewers — may access resources outside their own organization.

Rules for super-admin access:
- The bypass must be intentional and logged.
- Controllers must check `req.isSuperAdmin` explicitly; middleware may short-circuit organization checks for super-admin only on designated routes.
- Super-admin actions must append an audit entry with `actor_user_id`, `target_organization_id`, and `action`.

### 6.3 Service-to-service propagation

- **HTTP requests:** `authenticateJWT` must set `req.organizationId` from the user's record. Downstream middleware/services must read from `req.organizationId`, never from client-supplied body/query params.
- **AsyncLocalStorage:** The request context must wrap all route handlers so that `getCurrentTenantContext()` returns the active `organizationId` and `userId` for any code path.
- **Background jobs:** BullMQ jobs must include `organizationId` in `job.data`. Worker handlers must pass it explicitly to services; jobs without `organizationId` must fail closed.
- **Raw SQL:** Any `sequelize.query()` against tenant-scoped tables must include `WHERE organization_id = :organizationId` with a bound parameter. Dynamic table names are prohibited.
- **Service calls without request context:** Functions must accept `organizationId` as a required parameter. Optional/undefined tenant context is not allowed.

## 7. Functional Requirements

1. **Policy registry** — Create `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` that exports every covered entity, its factory, and the HTTP operations to test.
2. **Reusable test harness** — Create `Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts` with helpers for seeding two orgs, creating a resource in org A, and asserting cross-tenant denial.
3. **Entity test files** — Add one test file per entity in `Servers/tests/integration/tenant-isolation/`:
   - `projects.isolation.test.ts`
   - `files.isolation.test.ts`
   - `users.isolation.test.ts`
   - `risks.isolation.test.ts`
   - `tasks.isolation.test.ts`
4. **Coverage assertions** — Each entity must test at minimum: list returns only own-org rows, GET single returns `404` for other org, PUT/PATCH returns `404`/`403`, DELETE returns `404`/`403`, and create/bulk-create stamps caller's org even when another `organization_id` is supplied.
5. **Super-admin exception test** — Add `super-admin.isolation.test.ts` proving that super-admin can access cross-org resources only on explicitly allowed routes and is audited.
6. **Schema drift gate** — Add a script `Servers/scripts/auditTenantIsolationCoverage.ts` that queries `information_schema.columns` for tables with `organization_id`, compares them to the registry, and exits non-zero when uncovered.
7. **CI integration** — Update `.github/workflows/backend-checks.yml` to run the coverage audit and the isolation test matrix in the `lint-and-build` job.
8. **PR template update** — Add a checkbox: "If this PR adds or modifies an organization-scoped table, the tenant isolation registry and test matrix are updated."
9. **Runbook** — Create `docs/technical/security/tenant-isolation.md` with the policy, troubleshooting steps, and examples of correct/incorrect queries.
10. **Developer pairing** — The orchestrator will schedule pairing sessions with each active feature team to review current tasks against the policy and add tests for any newly scoped entities.

## 8. Non-Functional Requirements

- **Performance:** The full isolation matrix must complete in under 120 seconds in CI on the standard GitHub Actions runner, including database setup and migrations.
- **Security:** Test data must use unique, fake emails and passwords; no production data may be used. Secrets must not appear in test logs.
- **Maintainability:** Test helpers must be reusable and follow the existing `CodeRules/07-testing/backend-testing.md` conventions. One entity → one test file → one logical commit.
- **Reliability:** Tests must clean up after each case and retry on transient PostgreSQL deadlocks (reuse the pattern in `Servers/tests/integration/helpers.ts`).
- **Observability:** CI failures must print the uncovered entity name and a link to the runbook.
- **Compatibility:** The matrix must run against the existing `NODE_ENV=test` database configuration and reuse `createTestApp` from `Servers/tests/integration/setup.ts`.

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The existing codebase has many raw SQL queries and service calls that already omit `organization_id`; enforcing the policy may surface a large number of failures. | High — first CI run could break `develop`. | Run a pre-audit before enabling the CI gate. Fix P0 leaks first, then enable the gate. Allow a short grace period with explicit risk-acceptance tickets for non-P0 findings. |
| Developers treat the matrix as a checklist and add shallow tests that do not cover write paths, bulk operations, or service-to-service calls. | Medium — false sense of security. | Require review by the orchestrator or security reviewer for any new registry entry. The harness enforces minimum operation coverage. |
| AsyncLocalStorage context is lost in async boundaries or worker threads, causing tenant context to silently become undefined. | High — service calls may run unscoped. | Fail closed: any function that needs a tenant context but finds none throws `ForbiddenError`. Add unit tests for context propagation and worker job data. |
| Super-admin bypasses become the default path for convenience, weakening isolation. | Medium — gradual erosion of policy. | Limit bypass to explicit route allow-lists and audit every super-admin access. Quarterly review of super-admin route usage. |
| The schema-drift audit produces false positives for legacy or intentionally shared tables. | Low — noise and review friction. | Maintain an explicit `sharedTables` allow-list in the audit script with a required justification comment for each entry. |

## 10. Open Questions

1. Which existing tables with `organization_id` should be included in the first pass beyond the five required entities? (e.g., vendors, assessments, controls, frameworks marked as organizational)
2. Do we want the schema-drift audit to run against the live database in CI, or against a static snapshot derived from migrations?
3. Should the SuperAdmin bypass route allow-list be enforced by middleware (e.g., `superAdminOnly`) or by per-controller checks?
4. Are there service-to-service calls initiated from Python services (AIGateway, EvalServer) that need equivalent tenant propagation rules?
5. Should failed cross-tenant access attempts be logged as security events for alerting, or is the existing request logging sufficient?
6. What is the target date for enabling the CI gate, and which sprint should be reserved for the pre-audit remediation window?
