# Tenant Isolation Security Runbook

> **Scope:** VerifyWise Node/TypeScript backend (`Servers/`), plus the frontend isolation tests in `Clients/` (§6.4).  
> **Policy owner:** Technical Lead / Security reviewer  
> **Last updated:** 2026-10-31

## 1. Purpose

This runbook defines the rules for shared-schema, row-level tenant isolation in VerifyWise. All engineers who touch tenant-scoped data must follow these rules. The goal is to prevent cross-tenant data leakage by default and to make any intentional exception explicit, audited, and rare.

## 2. Isolation Policy

### 2.1 Deny by default

Every table that carries an `organization_id` column is tenant-scoped. Every query against such a table must include `organization_id = :organizationId` in its `WHERE` clause, unless an explicit, documented exception applies.

### 2.2 Scoped entity list (first pass)

The cross-tenant isolation test matrix covers these entities first:

| Entity               | Primary table         | Base API route                         | Notes                                                                                                     |
| -------------------- | --------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Projects             | `projects`            | `/api/projects`                        | Core tenant resource.                                                                                     |
| Files                | `files`               | `/api/files`                           | Metadata and content endpoints.                                                                           |
| Users                | `users`               | `/api/users`                           | `organization_id` is nullable for SuperAdmin/seed users; all tenant operations still scope by caller org. |
| Risks                | `risks`               | `/api/projectRisks`                    | Linked to projects via `projects_risks`.                                                                  |
| Tasks                | `tasks`               | `/api/tasks`                           | Assignee linkage must not leak across orgs.                                                               |
| Vendors              | `vendors`             | `/api/vendors`                         | Linked to projects via `vendors_projects`.                                                                |
| Assessments          | `assessments`         | `/api/assessments`                     | `organization_id` is nullable; project linkage enforces tenancy.                                          |
| Controls (EU AI Act) | `controls_eu`         | `/api/eu-ai-act/*`, `/api/readiness/*` | No standalone CRUD route; tenancy enforced through framework/project lifecycle.                           |
| Project frameworks   | `projects_frameworks` | `/api/frameworks/*`                    | Junction between global `frameworks` and tenant projects.                                                 |

### 2.3 Shared tables (no `organization_id`)

These tables are intentionally global and must **not** be added to the tenant-isolation registry:

| Table                     | Reason                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations`           | Tenant root.                                                                                                                                                                                                  |
| `roles`                   | Global role definitions.                                                                                                                                                                                      |
| `frameworks`              | Global framework catalog; tenant linkage is `projects_frameworks`.                                                                                                                                            |
| `*_struct_*`              | Framework structure tables (shared reference data).                                                                                                                                                           |
| `subscription_*`, `tiers` | Billing metadata.                                                                                                                                                                                             |
| `vrdb_*`                  | The vendor risk database: public records copied from official lists or answered by the databases it reads through, and the state of each key it asked them by (`vrdb_sources`, `vrdb_records`, `vrdb_sync_runs`, `vrdb_lookups`: a CPE vendor token or a CIK, which name a company, never an organization). No tenant data; written only by the sync job and the run-time lookup, and shared by every organization on purpose: an answer one run stored serves the next run of any organization. |

If you add a new shared table, document it in the `sharedTables` allow-list in `Servers/scripts/auditTenantIsolationCoverage.ts` with a justification comment.

The tenant side of the vendor risk database is not shared: `vendor_vrdb_matches`, the records the vendors of an organization matched, carries `organization_id` and is in the isolation registry. `vendor-vrdb-matches.isolation.test.ts` checks that a vendor of organization B never gets a row of organization A from the shared copy, that deleting a vendor removes its rows, and that every query of the table in `Servers/utils/vrdb.utils.ts` filters on `organization_id`.

#### Shared state outside the database

Redis keys that hold tenant data carry the organization (`buildOrgCacheKey`, `org_<id>`). One family of keys is shared by all organizations on purpose:

| Redis keys    | Reason                                                                                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vr:web:v1:*` | The web research cache (`Servers/services/webResearch/webCache.ts`): public pages, `robots.txt` files and search answers, fetched with no credentials and one bot identity. A key is the hash of an address or a query and a value holds nothing about an organization. Never put tenant data in it. |
| `vrdb:spacer:*` | The request windows of the NVD and the SEC (`Servers/services/vendorResearch/records/sharedSpacer.ts`), which every worker shares because the limits are per client: the start times of the latest requests, in milliseconds, and a counter. Nothing about an organization or a vendor. |

### 2.4 Deferred scoped tables (first pass)

The first-pass isolation matrix intentionally does **not** cover every tenant-scoped table in the database. The tables listed in `deferredScopedTables` inside `Servers/scripts/auditTenantIsolationCoverage.ts` are acknowledged as tenant-scoped but are deferred to future waves.

- Do **not** add new organization-scoped tables to `deferredScopedTables` without a risk-accepted ticket.
- When a future wave adds isolation coverage for a deferred table, remove it from `deferredScopedTables` and add it to the tenant-isolation registry.
- The CI gate will fail if a newly added `organization_id` table is not covered by the registry, the `sharedTables` allow-list, or the `deferredScopedTables` list.

## 3. SuperAdmin Exception Rules

Only the `SuperAdmin` role (`role_id = 5`) may bypass organization scoping, and only under these conditions:

1. **Explicit route allow-list.** SuperAdmin bypass is permitted only on routes documented in the isolation registry and in this runbook. The current allow-list is:
   - Read-only operations under `/api/super-admin/*` (when implemented).
   - Read operations where the SuperAdmin supplies the target organization via the `X-Organization-Id` header and the endpoint explicitly supports cross-org reads.
2. **No write bypass outside allow-list.** SuperAdmin write, update, and delete operations must target the organization carried in `req.organizationId`.
3. **Audit expectation.** Every SuperAdmin bypass that reads another organization's data should be recorded in the audit ledger with `actor_user_id`, `target_organization_id`, and `action`.
4. **Per-controller enforcement.** Bypass checks live in controllers, matching the existing VerifyWise pattern. Do not introduce a central middleware bypass without a dedicated architecture review.

## 4. Context Propagation Rules

Tenant context flows through the system in four ways. Every path must carry `organizationId` or fail closed.

### 4.1 HTTP requests

`auth.middleware.ts` decodes the JWT and attaches:

```text
req.userId
req.organizationId
req.role
req.isSuperAdmin
req.tenantHash
```

Controllers must pass `req.organizationId` into utility functions. Do **not** read `organization_id` from request bodies for authorization or scoping decisions.

### 4.2 AsyncLocalStorage

`auth.middleware.ts` and `context.middleware.ts` run tenant context inside `asyncLocalStorage`. Code that reads context via `asyncLocalStorage.getStore()` must treat a missing `organizationId` as a fatal error.

```typescript
// CORRECT
const store = asyncLocalStorage.getStore();
if (!store?.organizationId) {
  throw new ForbiddenError("Tenant context missing");
}
const organizationId = store.organizationId;
```

### 4.3 Background jobs (BullMQ)

Any job that touches tenant-scoped data must include `organizationId` in `job.data`.

```typescript
// CORRECT
await myQueue.add("process-risk", {
  riskId: risk.id,
  organizationId: req.organizationId,
});
```

The worker must validate `organizationId` before querying scoped tables and fail closed if it is missing.

```typescript
// CORRECT
const { organizationId } = job.data;
if (!organizationId) {
  throw new Error(`organizationId missing in job ${job.id}`);
}
```

One reader of the vendor risk database crosses organizations on purpose, and only this one:

- **The script** `Servers/scripts/vendorResearchUnknownHosts.ts`, run by a maintainer, reads the traces of the completed runs of every organization and prints only host names and two counts for each (runs, organizations), never an organization, a vendor or an address.

The status job `vrdb_relabel` (`Servers/services/vendorResearch/vrdb/relabel.ts`) carries a list id, not an organization: a change of status in a shared copy concerns the findings of every organization that cite the record. It is not a cross-organization reader either: `findFindingsToRelabelQuery` (`Servers/utils/vrdb.utils.ts`) lists the ids of the organizations, then reads the pending, labelled findings of one organization at a time that match a changed record, every statement on `vendor_vrdb_matches` and `vendor_risk_findings` filtered on `organization_id`, and writes each finding in its own organization: the `UPDATE` of `updateFindingCredibilityQuery` filters on `organization_id`, the finding's id, `status = 'pending'` and the basis it read, and sets only `credibility`, `credibility_basis` and `sources`. It notifies nobody and logs only the list and a count. The static check that every statement on `vendor_vrdb_matches` filters on `organization_id`, the status job's included, is in `Servers/tests/integration/tenant-isolation/vendor-vrdb-matches.isolation.test.ts`; the job's integration test (`Servers/tests/integration/vrdb.relabel.test.ts`) relabels the findings of two organizations in one job, each stored under its own `organization_id`, and leaves the findings a person decided and those that cite a record still on its list as they were.

The backfill of the credibility label, `Servers/scripts/vendorResearchBackfillCredibility.ts`, run by a maintainer, walks every organization but is not a cross-organization reader: it lists the ids of the organizations, then reads and writes the findings, runs and vendors of one organization at a time, each statement filtered on `organization_id` (`Servers/utils/vendorResearchBackfill.utils.ts`; the static check and the writes across organizations are in `Servers/tests/integration/tenant-isolation/vendor-risk-findings-backfill.isolation.test.ts`).

### 4.4 Raw SQL

All raw SQL that touches tenant-scoped tables must include `organization_id` in the `WHERE` clause.

```typescript
// CORRECT
const [rows] = await sequelize.query(
  `SELECT * FROM projects WHERE organization_id = :organizationId AND id = :id`,
  { replacements: { organizationId, id }, type: QueryTypes.SELECT },
);

// CORRECT insert — stamp caller org
await sequelize.query(
  `INSERT INTO projects (organization_id, project_title, owner)
   VALUES (:organizationId, :title, :ownerId)`,
  { replacements: { organizationId, title, ownerId } },
);

// INCORRECT — missing org filter
const [rows] = await sequelize.query(`SELECT * FROM projects WHERE id = :id`, {
  replacements: { id },
  type: QueryTypes.SELECT,
});

// INCORRECT — trusting body.organizationId
const orgId = req.body.organizationId;
```

## 5. Correct vs. Incorrect Examples

### Read one record

```typescript
// CORRECT
export const getProjectByIdQuery = async (
  organizationId: number,
  id: number,
) => {
  const [project] = await sequelize.query(
    `SELECT * FROM projects WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT },
  );
  return project;
};

// INCORRECT
export const getProjectByIdQuery = async (id: number) => {
  const [project] = await sequelize.query(
    `SELECT * FROM projects WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return project;
};
```

### Create

```typescript
// CORRECT — ignore foreign organization_id in body, stamp caller org
export const createProjectQuery = async (
  organizationId: number,
  payload: CreateProjectPayload
) => {
  const [project] = await sequelize.query(
    `INSERT INTO projects (organization_id, project_title, owner)
     VALUES (:organizationId, :title, :ownerId) RETURNING *`,
    {
      replacements: {
        organizationId,
        title: payload.project_title,
        ownerId: payload.owner,
      },
      type: QueryTypes.INSERT,
    }
  );
  return project;
};

// INCORRECT
export const createProjectQuery = async (payload: CreateProjectPayload) => {
  const orgId = payload.organization_id ?? req.organizationId;
  ...
};
```

### Update / Delete

```typescript
// CORRECT
await sequelize.query(
  `UPDATE projects SET project_title = :title WHERE organization_id = :organizationId AND id = :id`,
  { replacements: { title, organizationId, id } },
);

await sequelize.query(
  `DELETE FROM projects WHERE organization_id = :organizationId AND id = :id`,
  { replacements: { organizationId, id } },
);

// INCORRECT
await sequelize.query(
  `UPDATE projects SET project_title = :title WHERE id = :id`,
  { replacements: { title, id } },
);
```

### Joins

```typescript
// CORRECT — scope the driving tenant table and tenant-linked junctions
const query = `
  SELECT r.*, p.project_title
  FROM risks r
  JOIN projects_risks pr ON r.id = pr.risk_id
  JOIN projects p ON pr.project_id = p.id
  WHERE r.organization_id = :organizationId AND r.id = :id
`;

// INCORRECT — no org filter on risks or junction
const query = `
  SELECT r.*, p.project_title
  FROM risks r
  JOIN projects_risks pr ON r.id = pr.risk_id
  JOIN projects p ON pr.project_id = p.id
  WHERE r.id = :id
`;
```

## 6. Testing Guidance

Isolation is tested at two layers:

| Layer    | What it proves                                                                                                                                                 | Where                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Backend  | A user in one organization cannot list, read, update, delete or create-into another organization's data, against a real database.                               | `Servers/tests/integration/tenant-isolation/`  |
| Frontend | When the API refuses a cross-organization request, the UI shows the error and never renders the other organization's data.                                      | `Clients/src/test/mocks/crossOrgGuard.ts` and its tests |

### 6.1 What every backend isolation test checks

Each test seeds two fresh organizations with one user each. The **owner** seeds a row; the **attacker**, from the other organization, tries the operation against it.

| Op     | Attacker must get                                                      | Owner positive control                  | Extra check                                                  |
| ------ | ---------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| list   | A list with **no** rows (status `200` by default)                      | Same list, `200`, at least one row      | —                                                            |
| read   | A denial status (`404` by default)                                     | Same `GET`, `200`                       | —                                                            |
| update | A denial status (`403` or `404` by default), using the route's real verb | Same request, `2xx`                   | Row unchanged (SQL snapshot before vs after)                 |
| delete | A denial status (`403` or `404` by default)                            | Same request, `2xx`                     | Row unchanged, which also catches a soft delete               |
| create | —                                                                      | `POST` carrying the other org's `organization_id` succeeds | The new row is stamped with the owner's organization |

**Why the owner control exists.** Express answers a route or verb that doesn't exist with its own `404`, which looks identical to a tenancy `404`. Before #4501 the harness sent both `PUT` and `PATCH` and accepted `404`, so tasks `PATCH` and projects `PUT`, neither of which has a route, passed as "denied" without testing anything. Every denial is now paired with the owner doing the same thing successfully. A missing route therefore fails with `Positive control failed: …` instead of passing.

SuperAdmin bypass (§3) is **not yet covered** by the isolation tests.

### 6.2 The generated matrix

Conventional CRUD entities are tested by one generated suite rather than a file each:

| File                             | Role                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `tenantIsolation.registry.ts`    | Every tenant-scoped entity. Entries built with `crudEntity(...)` carry a `matrix` spec.   |
| `tenantIsolation.fixtures.ts`    | Per entity: how to seed an owned row, and the update/create payloads.                     |
| `tenantIsolation.matrix.ts`      | `crudEntity(...)` and the spec types.                                                     |
| `tenantIsolation.matrix.test.ts` | Generates the five tests above for every entry with a `matrix` spec.                      |
| `tenantIsolation.harness.ts`     | Seeding and the assertions (`assertReadDenied`, `assertUpdateDenied`, …).                 |
| `tenantIsolation.coverage.test.ts` | Fails if a registry entry has neither a `matrix` spec nor a hand-written test file.    |

Projects, tasks, risks and files are covered by the matrix. The other entries have hand-written `*.isolation.test.ts` files.

The registry is also imported by the schema-drift audit script (§7), so it and the fixtures must **never import the harness at runtime**: the harness loads the whole test app. Import its types with `import type`.

### 6.3 Adding an entity

The vendor example below is a sketch of the shape. Vendors still use a hand-written test file, so check the controller's validation for the real payload fields before moving them.

**1. Add a fixture** to `tenantIsolation.fixtures.ts`:

```typescript
export const vendorFixture: EntityFixture = {
  seed: (ctx) => createTestVendor(ctx.orgId),
  // Must be valid: the owner's positive control sends it too.
  updatePayload: () => ({ vendor_name: "Updated by isolation matrix" }),
  // Carry the other org's id; the server must ignore it.
  createPayload: (owner, foreignOrgId) => ({
    vendor_name: "Cross-tenant vendor",
    organization_id: foreignOrgId,
  }),
};
```

**2. Add one registry entry:**

```typescript
crudEntity("vendors", "/api/vendors", ["vendors", "vendors_projects"], vendorFixture),
```

That produces all five tests. `crudEntity` assumes `GET base`, `GET | PATCH | DELETE base/:id` and `POST base`. Describe any difference as an override, never as special-case test code:

| Override                            | Use when                                                   | In use today                                                       |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `updateVerb: "PUT"`                 | The update route is `PUT` only (default `PATCH`)            | tasks, risks                                                       |
| `routes: { update, delete, create }` | An operation lives on a different route                   | files: update, delete and create on `/api/file-manager`             |
| `denial: { read, write }`           | The controller answers a foreign id with another status    | risks `read: [204, 404]`; files `read: [403, 404]`                  |
| `attackerListStatuses`              | An empty list isn't `200`                                   | risks `[200, 204]`                                                  |
| `extractItems` / `extractCreatedId` | The list or create response has an unusual shape            | projects `data.project.id`                                          |
| `primaryTable`                      | The seeded id isn't in `tables[0]`                          | —                                                                   |
| `skip: { op: "reason" }`            | An operation genuinely can't be exercised. The reason is required and shows as a skipped test | — |

Fixtures can also return payloads asynchronously (risk create needs a real project), and can supply `createRequest` for creates a JSON body can't reach, such as the files multipart upload.

**Never widen `denial` or add a `skip` to make a failing test pass.** A failing owner control means the route, verb or payload is wrong. A failing attacker check is a cross-tenant leak: treat it as P0 and fix the backend.

**When a hand-written test file is still right.** Use one when the entity has no conventional CRUD surface: settings singletons, append-only ledgers, multi-step pipelines. Name it `{name, with _ replaced by -}.isolation.test.ts`, or set `testFile` on the registry entry when another file covers it (the two MRM settings entries point at `mrm-alerts.isolation.test.ts`). Build it from the harness assertions so it gets the same owner controls.

### 6.4 Frontend: the cross-organization guard

`Clients/src/test/mocks/crossOrgGuard.ts` is an opt-in MSW guard that answers a request for another organization's record with `403 { message: "Forbidden", data: "Access denied" }`, the way a tenant-scoped backend would.

```typescript
beforeEach(() => signInAs(OWN_ORG_ID));
afterEach(() => signOut());

it("shows the error and never renders Org B's project", async () => {
  server.use(...crossOrgGuard());
  renderWithProviders(<><AlertHost /><ProjectView /></>, {
    route: `/project-view?projectId=${mockForeignProject.id}`,
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
  expect(document.body).not.toHaveTextContent(mockForeignProject.project_title);
});
```

- **Caller identity.** `signInAs(orgId)` puts an unsigned fake JWT in the Redux store, and the guard decodes the `Authorization` header that customAxios sends, using the app's own `extractUserToken`. `crossOrgGuard({ callerOrgId })` is the fallback. If the guard can't identify the caller it throws (a `500`) rather than letting everything through.
- **What falls through** to the normal handlers: the caller's own records, unknown ids, and literal segments such as `/file-manager/search`.
- **Foreign data.** `data/foreignOrg.ts` holds one Org B record per entity (ids 9001–9004, with distinctive text). By-id handlers serve them, like a backend without scoping, but lists never include them. A test run without the guard therefore shows exactly what would leak.
- **Toasts.** `renderWithProviders` doesn't mount App's toast host. Render `<AlertHost />` from `Clients/src/test/AlertHost.tsx` next to the component.

**Adding an entity:**
1. Add its by-id paths and records to `CROSS_ORG_ENTITIES`.
2. Add a foreign record to `data/foreignOrg.ts`.
3. Make the entity's by-id handlers look records up with `byId(...)`.
4. Add a row to the `CASES` tables in `test/mocks/__tests__/crossOrgGuard.test.ts` and `application/repository/tests/crossOrg.network.test.ts`. Both have completeness checks that fail until you do.

**Pitfalls:**

- **Logout details.** A 403 whose detail is `"User does not belong to this organization"` or `"Not allowed to access"` makes customAxios log the user out instead of showing a toast. The guard refuses both.
- **403 vs 404.** The real backend answers a foreign id with `404` (§6.1), and customAxios deliberately shows **no** toast for `404`. Test both: `crossOrgGuard({ status: 404 })`.
- **Assert on text the UI actually renders.** The project view renders `project_title`, which the mock projects didn't have, so a leak would have rendered blank and a "never renders" assertion would have passed anyway. Always include a control test **without** the guard that shows the foreign text rendering.
- **Signed-in pages make extra requests.** The approval-request badges (`/api/approval-requests/pending-approvals` and `/my-requests`) fire once a user is signed in. Unhandled requests fail as network errors, and customAxios shows a generic "An error occurred" toast that can be mistaken for the one under test. Stub them.

### 6.5 Running locally

The integration suite truncates every table it touches. Point `Servers/.env.test` at a dedicated test database; the global setup refuses to run against the database named in `Servers/.env`.

```bash
cd Servers
npm run test:integration -- --testPathPatterns=tenant-isolation            # everything
npm run test:integration -- --testPathPatterns='tenantIsolation\.(matrix|coverage)'  # generated suite + guard
npx ts-node scripts/auditTenantIsolationCoverage.ts                         # schema-drift audit
```

```bash
cd Clients
npx vitest run src/test/mocks/__tests__/crossOrgGuard.test.ts \
  src/application/repository/tests/crossOrg.network.test.ts \
  src/presentation/pages/ProjectView/__tests__/ProjectView.crossOrg.network.test.tsx
```

If your test database shares a Postgres server with your development database, leave `DB_APP_PASSWORD` **unset** locally. The `verifywise_app` role is server-wide, and `20260721090000-rls-app-role.js` resets its password whenever the variable is set. Unset, the migration skips while `RLS_ENFORCEMENT_ENABLED` is off.

## 7. Schema-Drift CI Gate

The CI gate (`tenant-isolation-tests` job in `.github/workflows/backend-checks.yml`) does two things:

1. Runs everything under `tests/integration/tenant-isolation/`: the generated matrix, the coverage guard and the hand-written isolation tests.
2. Runs `npx ts-node scripts/auditTenantIsolationCoverage.ts`, which:
   - Connects to the migrated test database.
   - Queries `information_schema.columns` for every table that has an `organization_id` column.
   - Compares the set of scoped tables against the isolation registry and a justified `sharedTables` allow-list.
   - Exits non-zero if an uncovered scoped table exists or if a registry table is missing from the schema.

Do not merge a PR that adds a scoped table without also updating the registry.

## 8. Troubleshooting

### Test fails with data from another test

- Ensure `afterEach` calls `cleanupDatabase()`.
- Ensure unique emails/names across orgs if tests run concurrently.
- Use the deadlock-aware `cleanupDatabase()` helper.

### Audit script reports an uncovered table

1. If the table is tenant-scoped, add it to the registry and write an isolation test.
2. If the table is intentionally shared, add it to `sharedTables` with a justification comment and get PR approval from the Technical Lead.

### SuperAdmin test returns 403 on read

- Verify the route is in the documented allow-list.
- Verify the test sends `X-Organization-Id` when required.
- Verify `req.isSuperAdmin` is set in `mockUser` when using `bypassAuth`.

### `organizationId is undefined` in util

- Verify the controller passed `req.organizationId` into the utility.
- Verify `asyncLocalStorage` store is not lost across an `await` boundary.
- In tests, verify `mockUser.organizationId` is set.

### `Positive control failed: owner <VERB> <route> returned 404`

Not a leak. The owner could not do the operation either, so the test can't tell whether the attacker was denied. Check, in order:

1. Does the route have that verb? Set `updateVerb`, or override `routes`.
2. Is the fixture's payload valid for the owner?
3. Does the seeded row satisfy what the endpoint needs?

### An attacker assertion fails (e.g. `expected [403, 404] to contain 200`)

A cross-tenant leak. Treat it as P0: fix the query or controller to scope by `req.organizationId`. Do not widen `denial`.

### The owner's list comes back empty

The list query filters or joins in a way the seeded row doesn't satisfy. For example, the `/api/files` list inner-joins `projects`, so a file without a `project_id` never appears (the file fixture attaches uploads to a project). Fix the fixture, not the assertion.

### Coverage guard: `Registry entry "…" has no matrix spec and no … .isolation.test.ts`

Add the entity with `crudEntity(...)` and a fixture, write that test file, or set `testFile` on the entry to the file that covers it.

### Frontend test shows "An error occurred. Please try again later"

That is customAxios's toast for a network error or a `5xx`, not a cross-org denial. The usual cause is a request with no handler: MSW runs with `onUnhandledRequest: "error"`. Find it by logging `server.events` (`request:unhandled`) and stub it. The approval-request badges are the common one (§6.4).

### Frontend test gets a `500` mentioning `no decodable bearer token`

The guard couldn't identify the caller. Call `signInAs(orgId)` before the request, keep `signOut()` in `afterEach` rather than mid-test, or pass `callerOrgId`.

## 9. Related Files

| Purpose                    | Path                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| Isolation test registry    | `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` |
| Isolation test harness     | `Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts`  |
| Matrix builder and types   | `Servers/tests/integration/tenant-isolation/tenantIsolation.matrix.ts`   |
| Per-entity fixtures        | `Servers/tests/integration/tenant-isolation/tenantIsolation.fixtures.ts` |
| Generated matrix suite     | `Servers/tests/integration/tenant-isolation/tenantIsolation.matrix.test.ts` |
| Registry coverage guard    | `Servers/tests/integration/tenant-isolation/tenantIsolation.coverage.test.ts` |
| Schema-drift audit         | `Servers/scripts/auditTenantIsolationCoverage.ts`                        |
| Frontend cross-org guard   | `Clients/src/test/mocks/crossOrgGuard.ts`                                |
| Frontend foreign fixtures  | `Clients/src/test/mocks/data/foreignOrg.ts`                              |
| Test toast host            | `Clients/src/test/AlertHost.tsx`                                         |
| Frontend isolation tests   | `Clients/src/test/mocks/__tests__/crossOrgGuard.test.ts`, `Clients/src/application/repository/tests/crossOrg.network.test.ts`, `Clients/src/presentation/pages/ProjectView/__tests__/ProjectView.crossOrg.network.test.tsx` |
| customAxios (toasts, logout-on-403) | `Clients/src/infrastructure/api/customAxios.ts`                 |
| Integration test setup     | `Servers/tests/integration/setup.ts`                                     |
| Integration test helpers   | `Servers/tests/integration/helpers.ts`                                   |
| Auth middleware            | `Servers/middleware/auth.middleware.ts`                                  |
| Context middleware         | `Servers/middleware/context.middleware.ts`                               |
| Multi-tenancy architecture | `docs/technical/architecture/multi-tenancy.md`                           |

## 10. Python and Other Services

This runbook currently governs the Node/TypeScript backend (`Servers/`). Equivalent tenant-propagation rules for `AIGateway/` and `EvalServer/` are out of scope for this initiative. If a future change makes those services tenant-aware, extend this runbook and add a matching isolation matrix.
