# Tenant Isolation Security Runbook

> **Scope:** VerifyWise Node/TypeScript backend (`Servers/`).  
> **Policy owner:** Technical Lead / Security reviewer  
> **Last updated:** 2026-06-22

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

| Table                     | Reason                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| `organizations`           | Tenant root.                                                       |
| `roles`                   | Global role definitions.                                           |
| `frameworks`              | Global framework catalog; tenant linkage is `projects_frameworks`. |
| `*_struct_*`              | Framework structure tables (shared reference data).                |
| `subscription_*`, `tiers` | Billing metadata.                                                  |

If you add a new shared table, document it in the `sharedTables` allow-list in `Servers/scripts/auditTenantIsolationCoverage.ts` with a justification comment.

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

### Isolation test matrix

All tenant-scoped entities must have an integration test file under:

```text
Servers/tests/integration/tenant-isolation/{entity}.isolation.test.ts
```

Each test file must verify:

1. **List** returns only records in the caller's organization.
2. **GET by id** for another organization's record returns `404` (or `403` where explicitly documented).
3. **PUT/PATCH/DELETE** for another organization's record returns `404` or `403`.
4. **Create** ignores a foreign `organization_id` in the request body and stamps the caller's organization.
5. **SuperAdmin bypass** is limited to explicitly allowed routes.

### Registry

Add new scoped entities to:

```text
Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts
```

The schema-drift audit script reads this registry. If you add a table with `organization_id` but do not register it, CI will fail.

### Running the matrix locally

```bash
cd Servers
npm run test:integration -- --testPathPattern=tenant-isolation
```

### Running the schema-drift audit locally

```bash
cd Servers
npx ts-node scripts/auditTenantIsolationCoverage.ts
```

## 7. Schema-Drift CI Gate

The CI gate (`tenant-isolation` job in `.github/workflows/backend-checks.yml`) does two things:

1. Runs the isolation test matrix.
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

## 9. Related Files

| Purpose                    | Path                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| Isolation test registry    | `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` |
| Isolation test harness     | `Servers/tests/integration/tenant-isolation/tenantIsolation.harness.ts`  |
| Schema-drift audit         | `Servers/scripts/auditTenantIsolationCoverage.ts`                        |
| Integration test setup     | `Servers/tests/integration/setup.ts`                                     |
| Integration test helpers   | `Servers/tests/integration/helpers.ts`                                   |
| Auth middleware            | `Servers/middleware/auth.middleware.ts`                                  |
| Context middleware         | `Servers/middleware/context.middleware.ts`                               |
| Multi-tenancy architecture | `docs/technical/architecture/multi-tenancy.md`                           |

## 10. Python and Other Services

This runbook currently governs the Node/TypeScript backend (`Servers/`). Equivalent tenant-propagation rules for `AIGateway/` and `EvalServer/` are out of scope for this initiative. If a future change makes those services tenant-aware, extend this runbook and add a matching isolation matrix.
