# Task Board: Cross-tenant security review and isolation test matrix

## 1. Initiative Metadata

| Field | Value |
|-------|-------|
| **Initiative** | Cross-tenant security review and isolation test matrix |
| **Classification** | Large |
| **Goal** | Harden VerifyWise's shared-schema row-level tenancy with a reusable Jest + Supertest isolation matrix, schema-drift CI gate, and documented isolation policy. |
| **Target phase** | Phase 3 — Task Decomposition & Assignment |
| **Output owner** | Technical Lead |

---

## 2. Dependency Graph

```text
Wave 1 — Foundation
  ISO-001 (runbook) ─┐
  ISO-002 (audit)    ├───> ISO-003 (registry)

Wave 2 — Infrastructure
  ISO-003 (registry) ───> ISO-004 (helpers/factories)
  ISO-004 ──────────────> ISO-005 (harness)

Wave 3 — Entity Tests
  ISO-005 (harness) ────> ISO-006..ISO-011 (per-entity tests)

Wave 4 — Remediation
  ISO-006..ISO-011 ─────> ISO-012 (P0 leak triage/fix)

Wave 5 — Enablement
  ISO-012 ──────────────> ISO-013 (CI workflow)
  ISO-001 ──────────────> ISO-014 (PR template)
  ISO-013, ISO-014 ─────> ISO-015 (pairing & gate enablement)
```

---

## 3. Task Table

| Task ID | Description | Assigned Agent Role | Dependencies | Estimated Effort | Acceptance Criteria (pass/fail) | Output Artifacts / Files Changed |
|---------|-------------|---------------------|--------------|------------------|--------------------------------|----------------------------------|
| **ISO-001** | Write the tenant-isolation policy runbook and link it from `Servers/CLAUDE.md`. | Technical Lead / Security reviewer | — | M (4–6 h) | 1. `docs/technical/security/tenant-isolation.md` exists and contains: scoped-entity list, SuperAdmin exception rules, propagation rules for HTTP/AsyncLocalStorage/jobs/raw SQL, correct/incorrect query examples, troubleshooting steps. 2. `Servers/CLAUDE.md` contains a new "Security" or "Tenant isolation" section linking to the runbook. 3. A second reviewer approves the runbook via PR review comment. | `docs/technical/security/tenant-isolation.md` (new), `Servers/CLAUDE.md` (edit) |
| **ISO-002** | Implement the schema-drift audit script that compares tables carrying `organization_id` against the registry and a justified shared-tables allow-list. | Senior Backend Developer | — | M (6–8 h) | 1. `Servers/scripts/auditTenantIsolationCoverage.ts` exists, runs with `npx ts-node`, connects to the migrated test DB, queries `information_schema.columns`, and exits `0` when all scoped tables are covered. 2. When an uncovered table exists, the script exits non-zero and prints JSON naming the table(s) and linking to the runbook. 3. When a registry table is missing from the schema, it exits non-zero. 4. `sharedTables` allow-list entries each carry a justification comment reviewed in PR. | `Servers/scripts/auditTenantIsolationCoverage.ts` (new) |
| **ISO-003** | Create the tenant-isolation registry declaring each covered entity, its table(s), factory, base route, operations, and payloads. | Senior Backend Developer | ISO-002 | S (3–4 h) | 1. `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` exists and exports a typed `IsolationEntity[]` array. 2. It includes entries for `projects`, `files`, `users`, `risks`, `tasks`. 3. The audit script can `require`/`import` the registry and flatten its `tables` array without modification. 4. Registry passes TypeScript compilation. | `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` (new) |
| **ISO-004** | Extend integration test helpers and factories to support multi-org seeding, cleanup, and scoped-entity persistence. | Senior Backend Developer | ISO-003 | M (6–8 h) | 1. `Servers/tests/integration/helpers.ts` exposes `createTestOrganization()`, `createTestUser()`, and a `seedTwoOrgsAndUsers(roleId)` helper returning two org IDs, two user IDs, and unique fake emails. 2. `cleanupDatabase()` TRUNCATE list is extended to include all tables touched by the matrix (`files`, `risks`, `tasks`, plus join tables) in dependency order. 3. Factories in `Servers/tests/factories/` include persistence helpers for projects, files, users, risks, and tasks (e.g., `createTestProject(orgId)`). 4. Existing tests still pass after helper/factory changes. | `Servers/tests/integration/helpers.ts` (edit), `Servers/tests/factories/*.ts` (edit/add) |
| **ISO-005** | Create the reusable tenant-isolation harness with cross-tenant denial and org-stamping assertions. | Senior Backend Developer | ISO-004 | M (6–8 h) | 1. `Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts` exports: `seedTwoOrgsAndUsers`, `createResource`, `assertCrossTenantDenial`, `assertListOnlyOwnOrg`, `assertCreateStampsCallerOrg`. 2. `assertCrossTenantDenial` asserts GET returns `404` and PUT/PATCH/DELETE return `404` or `403`. 3. `assertCreateStampsCallerOrg` POSTs a payload containing a foreign `organization_id` and asserts the response/DB row carries the caller's org. 4. Harness reuses `createTestApp({ bypassAuth: true })` and deadlock-retry cleanup. | `Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts` (new) |
| **ISO-006** | Add cross-tenant isolation tests for the `projects` entity. | Backend Developer | ISO-005 | S (3–4 h) | 1. `Servers/tests/integration/tenant-isolation/projects.isolation.test.ts` exists and passes. 2. Tests cover: list only own-org projects, GET other-org project returns `404`, PUT/PATCH/DELETE other-org project returns `404`/`403`, create ignores supplied foreign `organization_id` and stamps caller's org. 3. Each test seeds org A/B via the harness and cleans up via `cleanupDatabase()`. | `Servers/tests/integration/tenant-isolation/projects.isolation.test.ts` (new) |
| **ISO-007** | Add cross-tenant isolation tests for the `files` entity. | Backend Developer | ISO-005 | S (3–4 h) | 1. `Servers/tests/integration/tenant-isolation/files.isolation.test.ts` exists and passes. 2. Same operation coverage as ISO-006 for file metadata endpoints. 3. If file storage tenancy differs from metadata tenancy, both are asserted. | `Servers/tests/integration/tenant-isolation/files.isolation.test.ts` (new) |
| **ISO-008** | Add cross-tenant isolation tests for the `users` entity. | Backend Developer | ISO-005 | S (3–4 h) | 1. `Servers/tests/integration/tenant-isolation/users.isolation.test.ts` exists and passes. 2. Tests cover: list only own-org users, GET other-org user returns `404`, PUT/PATCH/DELETE other-org user returns `404`/`403`, create ignores foreign `organization_id` and stamps caller's org. 3. Cross-org invite behavior is documented in the test comments. | `Servers/tests/integration/tenant-isolation/users.isolation.test.ts` (new) |
| **ISO-009** | Add cross-tenant isolation tests for the `risks` entity. | Backend Developer | ISO-005 | S (3–4 h) | 1. `Servers/tests/integration/tenant-isolation/risks.isolation.test.ts` exists and passes. 2. Tests cover: list only own-org risks, GET/PUT/PATCH/DELETE other-org risk returns `404`/`403`, create stamps caller's org. 3. Tests verify risk-to-project tenancy alignment. | `Servers/tests/integration/tenant-isolation/risks.isolation.test.ts` (new) |
| **ISO-010** | Add cross-tenant isolation tests for the `tasks` entity. | Backend Developer | ISO-005 | S (3–4 h) | 1. `Servers/tests/integration/tenant-isolation/tasks.isolation.test.ts` exists and passes. 2. Tests cover: list only own-org tasks, GET/PUT/PATCH/DELETE other-org task returns `404`/`403`, create stamps caller's org. 3. Task assignment cross-tenant leakage is asserted. | `Servers/tests/integration/tenant-isolation/tasks.isolation.test.ts` (new) |
| **ISO-011** | Add super-admin isolation tests validating bypass only on designated routes and audit expectations. | Senior Backend Developer | ISO-005 | M (4–6 h) | 1. `Servers/tests/integration/tenant-isolation/super-admin.isolation.test.ts` exists and passes. 2. Tests prove super-admin can read cross-org resources only on explicitly allowed routes. 3. Tests prove super-admin cannot read cross-org resources outside `/api/super-admin` (or equivalent allow-list). 4. Tests assert an audit entry is created for each bypass with `actor_user_id`, `target_organization_id`, and `action`. | `Servers/tests/integration/tenant-isolation/super-admin.isolation.test.ts` (new) |
| **ISO-012** | Run the isolation matrix locally, triage failures, and fix all P0 cross-tenant leaks. | Feature Teams + Technical Lead | ISO-006..ISO-011 | L (12–20 h) | 1. Local run of the full tenant-isolation matrix produces a triage sheet listing P0/P1/P2 findings. 2. Every P0 finding is either fixed in code or risk-accepted with a linked ticket approved by the Technical Lead. 3. After fixes, the matrix passes locally and the audit script exits `0`. 4. Non-P0 findings are converted into backlog tickets with owners. | `Servers/controllers/**/*.ts`, `Servers/services/**/*.ts`, `Servers/utils/**/*.ts` (selective edits); triage sheet (comment in tracking issue) |
| **ISO-013** | Update `.github/workflows/backend-checks.yml` with a tenant-isolation job that runs the matrix and the schema-drift audit. | DevOps Engineer | ISO-012 | M (4–6 h) | 1. `.github/workflows/backend-checks.yml` contains a `tenant-isolation` job running under the `Servers` working directory. 2. Job includes a PostgreSQL service, installs dependencies, runs `npm run test:integration -- --testPathPattern=tenant-isolation`, then runs `npx ts-node scripts/auditTenantIsolationCoverage.ts`. 3. Job is conditional on `Servers/**` changes. 4. A test PR that adds an uncovered `organization_id` table fails the workflow. | `.github/workflows/backend-checks.yml` (edit) |
| **ISO-014** | Update the GitHub pull-request template with a tenant-isolation checklist item. | Technical Lead | ISO-001 | XS (1–2 h) | 1. `.github/pull_request_template.md` contains a checkbox: "If this PR adds or modifies an organization-scoped table, the tenant isolation registry and test matrix are updated." 2. The checkbox links to `docs/technical/security/tenant-isolation.md`. 3. Template renders correctly in a new PR. | `.github/pull_request_template.md` (edit) |
| **ISO-015** | Pair with active feature teams, announce the gate, and enable the CI workflow. | Orchestrator / Technical Lead | ISO-013, ISO-014 | M (6–8 h) | 1. At least three active feature teams have attended a pairing session reviewing their in-flight scoped entities against the policy. 2. The CI gate is enabled on the default branch and at least one subsequent PR adding a scoped entity is signed off by the orchestrator. 3. Runbook and PR template changes are announced in the team channel. | Meeting notes / sign-off comments on relevant PRs |

---

## 4. Wave Grouping

| Wave | Theme | Tasks | Goal / Exit Criteria |
|------|-------|-------|----------------------|
| **Wave 1 — Foundation** | Policy & audit skeleton | ISO-001, ISO-002, ISO-003 | The isolation policy is documented, the schema-drift audit script runs, and the registry is typed and importable by the audit script. |
| **Wave 2 — Infrastructure** | Test harness & helpers | ISO-004, ISO-005 | Multi-org seeding, cleanup, persistence helpers, and the reusable harness are in place and compile. |
| **Wave 3 — Entity Tests** | Per-entity isolation coverage | ISO-006, ISO-007, ISO-008, ISO-009, ISO-010, ISO-011 | Each required entity has a passing isolation test file; super-admin bypass behavior is covered. |
| **Wave 4 — Remediation** | Fix P0 leaks | ISO-012 | All P0 cross-tenant findings are fixed or risk-accepted; the full matrix passes locally. |
| **Wave 5 — Enablement** | CI gate & team workflow | ISO-013, ISO-014, ISO-015 | The matrix and audit run in CI, the PR template enforces the checklist, and feature teams are paired with. |

---

## 5. Blockers / Risks

| Risk | Impact | Owner | Mitigation (from Architecture Brief) |
|------|--------|-------|--------------------------------------|
| Many raw SQL queries and service calls omit `organization_id`; enforcing the policy may surface a large number of failures. | High — first CI run could break `develop`. | Technical Lead | Run a pre-audit before enabling the CI gate. Fix P0 leaks first, then enable the gate. Allow a short grace period with explicit risk-acceptance tickets for non-P0 findings. |
| AsyncLocalStorage context is lost across async boundaries or worker threads, causing tenant context to silently become undefined. | High — service calls may run unscoped. | Senior Backend Developer | Fail closed: any function that needs a tenant context but finds none throws `ForbiddenError`. Add unit tests for context propagation and worker job data. |
| SuperAdmin bypass becomes the default path for convenience, weakening isolation. | Medium — gradual erosion of policy. | Technical Lead / Security reviewer | Limit bypass to explicit route allow-lists and audit every super-admin access. Quarterly review of super-admin route usage. |
| Developers add shallow tests that do not cover write paths, bulk operations, or service-to-service calls. | Medium — false sense of security. | QA Engineer | Require review by the orchestrator or security reviewer for any new registry entry. The harness enforces minimum operation coverage. |
| Schema-drift audit produces false positives for legacy or intentionally shared tables. | Low — noise and review friction. | Senior Backend Developer | Maintain an explicit `sharedTables` allow-list in the audit script with a required justification comment for each entry. |
| CI runtime exceeds the 120-second target. | Medium — slower feedback loops. | DevOps Engineer | Run matrix only on `Servers/**` changes; use `--runInBand`; parallelize by entity if runtime exceeds target. |

---

## 6. Decisions

Resolved before Phase 4 implementation:

| # | Decision |
|---|----------|
| 1 | **Scope:** First pass covers the five required entities plus core GRC entities that carry `organization_id`: `vendors`, `assessments`, `controls_eu`, and `projects_frameworks`. (`controls` maps to `controls_eu`; `organizational_frameworks` maps to the `frameworks`↔`projects_frameworks` linkage.) |
| 2 | **Audit source:** The schema-drift audit runs against the live migrated CI database (`information_schema.columns`) after migrations complete. |
| 3 | **SuperAdmin bypass:** Enforced via per-controller checks, matching the existing VerifyWise pattern. ISO-011 tests verify bypass only on documented routes. |
| 4 | **Python services:** Out of scope for this initiative. Document as future work in the tenant-isolation runbook (ISO-001). |
| 5 | **Security alerts:** Failed cross-tenant attempts continue to use existing request logs; no dedicated security-event table or SIEM integration in this pass. |
| 6 | **CI gate enablement:** Enable the gate after Wave 4 remediation is complete and all P0 leaks are fixed or risk-accepted. No fixed calendar date; gate ISO-015 on Wave 4 exit criteria. |

## 7. Open Questions

All open questions resolved; see Section 6.

---

## 8. Commit / Push Guidance

This initiative is intentionally decomposed into atomic, single-file commits. The preferred mapping is:

| Commit | File(s) |
|--------|---------|
| `docs: tenant isolation runbook` | `docs/technical/security/tenant-isolation.md` + `Servers/CLAUDE.md` link |
| `feat(audit): schema-drift tenant isolation coverage script` | `Servers/scripts/auditTenantIsolationCoverage.ts` |
| `feat(tests): tenant isolation registry` | `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` |
| `test(helpers): multi-org seeding and cleanup for isolation matrix` | `Servers/tests/integration/helpers.ts`, `Servers/tests/factories/*.ts` |
| `test(harness): reusable tenant isolation harness` | `Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts` |
| `test(isolation): projects cross-tenant isolation` | `Servers/tests/integration/tenant-isolation/projects.isolation.test.ts` |
| `test(isolation): files cross-tenant isolation` | `Servers/tests/integration/tenant-isolation/files.isolation.test.ts` |
| `test(isolation): users cross-tenant isolation` | `Servers/tests/integration/tenant-isolation/users.isolation.test.ts` |
| `test(isolation): risks cross-tenant isolation` | `Servers/tests/integration/tenant-isolation/risks.isolation.test.ts` |
| `test(isolation): tasks cross-tenant isolation` | `Servers/tests/integration/tenant-isolation/tasks.isolation.test.ts` |
| `test(isolation): super-admin bypass isolation` | `Servers/tests/integration/tenant-isolation/super-admin.isolation.test.ts` |
| `fix(isolation): triage and remediate P0 cross-tenant leaks` | Controller/service fixes as needed |
| `ci: tenant isolation matrix and schema-drift gate` | `.github/workflows/backend-checks.yml` |
| `chore(github): tenant isolation PR checklist` | `.github/pull_request_template.md` |

---

*Board generated in Phase 3 — Task Decomposition & Assignment.*
