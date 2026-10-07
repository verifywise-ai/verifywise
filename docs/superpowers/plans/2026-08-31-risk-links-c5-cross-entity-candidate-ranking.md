# C5: Cross-entity candidate ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user links a project risk to a vendor or model risk, show the candidates that share a project with it first, badged with that project's name.

**Architecture:** One read-only endpoint answers "which vendor/model risks share a project with this risk", using a single SQL statement with a `subject_projects` CTE and a two-branch `UNION ALL`. The client keeps its existing candidate fetches and joins the answer in memory by id, using it to reorder the picker and render a chip. Nothing is written to the database and no migration is needed.

**Tech Stack:** Node 22 / Express 4 / Sequelize raw SQL / PostgreSQL; React 19 / MUI 7 / TanStack Query; Jest (backend) / Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-08-31-risk-links-c5-cross-entity-candidates-design.md`

## Global Constraints

Every task's requirements implicitly include all of these.

1. **`entityType` values are exactly `"vendor_risk"` and `"model_risk"`.** These are C4's shipped literals — `ParentEntityType` in `Servers/services/riskLinks/hierarchy.ts:22` and `RiskLinkEntityType` in `Clients/src/domain/interfaces/i.riskLink.ts:7`. Derive from those unions; never introduce a new string.
2. **No writes.** No migration, no `risk_links` row, no `suggested` status, no `LinkSignalProvider`, no recompute participation. C5 is read-only.
3. **Sort, never filter.** Candidates that share no project stay in the list and stay selectable.
4. **Application SQL is unqualified.** `search_path` is already `verifywise`; only migrations qualify the schema, and this plan has no migration.
5. **Every nullable column is filtered with `=`, deliberately.** `model_risks.organization_id`, `model_risks.is_deleted`, `projects_risks.organization_id`, `vendors_projects.organization_id`, `model_inventories_projects_frameworks.organization_id` are all nullable and all filtered by equality. This is fail-closed and matches the codebase (`postMarketMonitoring.utils.ts:849`). **Never "fix" one with `OR ... IS NULL`.**
6. **The two candidate sets are filtered independently and can diverge.** The endpoint filters `is_deleted = false`; the picker fetches `getAllVendorRisks({filter:"active"})` and `/modelRisks`. Join by id and ignore anything unmatched on either side. Never assume equal lengths, never index by position.
7. **`swagger.yaml` must gain the new operation.** `npm run check:api-drift` currently balances at 707 Express endpoints = 707 Swagger operations and fails otherwise.
8. **Typecheck trap:** `Servers/tsconfig.json` sets `noUnusedLocals: true` and `noUnusedParameters: true`, so an import or variable added ahead of its first use is a build error, not a warning. `Servers/utils/__tests__/*.test.ts` **is** inside the tsc program. A type error there fails `npm run build`, which aborts `globalSetup` and prevents every integration test from running. `Servers/tests/integration/**` is also in the program.
9. **npm flag trap:** `npm run test` is an alias for `npm run test:unit`, so `npm run test -- --testPathPatterns=X` hands the flag to **npm**, runs all 243 suites, and still exits 0. Always use `npm run test:unit -- --testPathPatterns=X`.

---

## File Structure

**Backend**

| File | Responsibility |
|---|---|
| `Servers/utils/riskLink.utils.ts` | `SharedProjectCandidate` type, the SQL, and the row→entry grouping. Modify. |
| `Servers/controllers/riskLinks.ctrl.ts` | `getSharedProjects` request handler. Modify. |
| `Servers/routes/riskLinks.route.ts` | One `router.get` line. Modify. |
| `Servers/swagger.yaml` | One operation block. Modify. |
| `Servers/tests/factories/test-entities.factory.ts` | `linkModelToProject` helper. Modify. |
| `Servers/tests/factories/index.ts` | Re-export the new helper. Modify. |
| `Servers/tests/integration/riskLinks.sharedProjects.test.ts` | Integration coverage. Create. |
| `Servers/utils/__tests__/riskLink.utils.test.ts` | Grouping + SQL-shape unit coverage. Modify. |

**Frontend**

| File | Responsibility |
|---|---|
| `Clients/src/domain/interfaces/i.riskLink.ts` | `SharedProjectCandidate` type. Modify. |
| `Clients/src/application/repository/riskLink.repository.ts` | `getSharedProjects` fetch. Modify. |
| `Clients/src/application/hooks/useRiskLinks.ts` | `useSharedProjects` hook. Modify. |
| `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx` | Partition + chip. Modify. |
| `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx` | Ranking + chip tests, **and a mock repair**. Modify. |
| `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx` | **Mock repair only.** Modify. |

---

## Task 1: The shared-project query

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts` (append after `getRiskLinkByIdQuery`)
- Modify: `Servers/tests/factories/test-entities.factory.ts` (append after `linkVendorToProject`, ~line 260)
- Modify: `Servers/tests/factories/index.ts` (add to the explicit re-export list)
- Test: `Servers/tests/integration/riskLinks.sharedProjects.test.ts` (create)
- Test: `Servers/utils/__tests__/riskLink.utils.test.ts` (append inside the existing `describe("riskLink.utils")`)

**Interfaces:**
- Consumes: nothing from earlier tasks. Existing factories `createTestProject(orgId, ownerId, opts)`, `createTestRisk(orgId, opts)`, `createTestVendor(orgId, opts)`, `createTestVendorRisk(orgId, {vendor_id})`, `createTestModelInventory(orgId, opts)`, `createTestModelRisk(orgId, {model_id})`, `linkRiskToProject(orgId, riskId, projectId)`, `linkVendorToProject(orgId, vendorId, projectId)` all return `Promise<number>` (ids) or `Promise<void>` (links). Harness `seedTwoTenantContexts()` returns `{ owner, attacker }`, each `{ orgId, userId, roleName, app }`.
- Produces:
  - `export interface SharedProjectCandidate { entityType: Exclude<ParentEntityType, "risk">; id: number; projects: string[] }`
  - `export async function getSharedProjectCandidatesQuery(organizationId: number, riskId: number): Promise<SharedProjectCandidate[]>`
  - `export async function linkModelToProject(orgId: number, modelInventoryId: number, projectId: number, frameworkId: number): Promise<void>`

- [ ] **Step 1: Add the model→project test factory**

`model_inventories_projects_frameworks` has a `UNIQUE (model_inventory_id, project_id, framework_id)` constraint and an FK on `framework_id → frameworks(id)`. Framework ids 1–4 are seeded by `seedFrameworks()` in `Servers/tests/integration/helpers.ts`, so `1` and `2` are safe to use.

Append to `Servers/tests/factories/test-entities.factory.ts`, directly after `linkVendorToProject`:

```ts
export async function linkModelToProject(
  orgId: number,
  modelInventoryId: number,
  projectId: number,
  frameworkId: number,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO model_inventories_projects_frameworks
       (organization_id, model_inventory_id, project_id, framework_id)
     VALUES (:orgId, :modelInventoryId, :projectId, :frameworkId)
     ON CONFLICT (model_inventory_id, project_id, framework_id) DO NOTHING`,
    { replacements: { orgId, modelInventoryId, projectId, frameworkId } },
  );
}
```

`Servers/tests/factories/index.ts` re-exports by **explicit name**, not
`export *`, so the helper is invisible to `import ... from "../factories"`
until it is listed there too. Add `linkModelToProject` to that list, next to
`linkVendorToProject`.

- [ ] **Step 2: Write the failing integration test**

Create `Servers/tests/integration/riskLinks.sharedProjects.test.ts`:

```ts
jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestProject,
  createTestRisk,
  createTestVendor,
  createTestVendorRisk,
  createTestModelInventory,
  createTestModelRisk,
  linkRiskToProject,
  linkVendorToProject,
  linkModelToProject,
} from "../factories";
import { getSharedProjectCandidatesQuery } from "../../utils/riskLink.utils";
import { sequelize } from "../../database/db";

afterEach(async () => {
  await cleanupDatabase();
});

describe("getSharedProjectCandidatesQuery", () => {
  it("returns a vendor risk whose vendor is attached to the subject's project", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, project);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    const result = await getSharedProjectCandidatesQuery(owner.orgId, subject);

    expect(result).toEqual([
      { entityType: "vendor_risk", id: vendorRisk, projects: ["Fraud Detection"] },
    ]);
  });

  it("omits a vendor risk whose vendor shares no project with the subject", async () => {
    const { owner } = await seedTwoTenantContexts();
    const subjectProject = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const otherProject = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Unrelated",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, subjectProject);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, otherProject);
    await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });

  it("returns a model attached under two frameworks exactly once", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    const model = await createTestModelInventory(owner.orgId, {});
    await linkModelToProject(owner.orgId, model, project, 1);
    await linkModelToProject(owner.orgId, model, project, 2);
    const modelRisk = await createTestModelRisk(owner.orgId, { model_id: model });

    const result = await getSharedProjectCandidatesQuery(owner.orgId, subject);

    expect(result).toEqual([
      { entityType: "model_risk", id: modelRisk, projects: ["Fraud Detection"] },
    ]);
  });

  it("collects both titles when the subject sits in two shared projects", async () => {
    const { owner } = await seedTwoTenantContexts();
    const kyc = await createTestProject(owner.orgId, owner.userId, { project_title: "KYC" });
    const fraud = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, kyc);
    await linkRiskToProject(owner.orgId, subject, fraud);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, kyc);
    await linkVendorToProject(owner.orgId, vendor, fraud);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    const result = await getSharedProjectCandidatesQuery(owner.orgId, subject);

    // ORDER BY project_title puts "Fraud Detection" before "KYC".
    expect(result).toEqual([
      { entityType: "vendor_risk", id: vendorRisk, projects: ["Fraud Detection", "KYC"] },
    ]);
  });

  it("never returns another org's vendor risk, even from a same-named project", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerProject = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, ownerProject);

    const attackerProject = await createTestProject(attacker.orgId, attacker.userId, {
      project_title: "Fraud Detection",
    });
    const attackerVendor = await createTestVendor(attacker.orgId, {});
    await linkVendorToProject(attacker.orgId, attackerVendor, attackerProject);
    await createTestVendorRisk(attacker.orgId, { vendor_id: attackerVendor });

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });

  it("omits a model risk with no model, without erroring", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    await createTestModelRisk(owner.orgId, {});

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });

  it("returns an empty list for a risk that belongs to no project", async () => {
    const { owner } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId, {});

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });

  it("omits a soft-deleted vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, project);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });
    await sequelize.query(
      `UPDATE vendorrisks SET is_deleted = true
        WHERE id = :vendorRisk AND organization_id = :orgId`,
      { replacements: { vendorRisk, orgId: owner.orgId } },
    );

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the integration test to verify it fails**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.sharedProjects
```

Expected: FAIL. Because `Servers/tests/integration/**` is inside the tsc program (Global Constraint 8), the missing `getSharedProjectCandidatesQuery` and `linkModelToProject` exports surface as a **build/type error before any test body runs**, not as a runtime `undefined`. That is the expected failure.

- [ ] **Step 4: Implement the query**

Append to `Servers/utils/riskLink.utils.ts`, after `getRiskLinkByIdQuery`:

```ts
/**
 * One vendor or model risk that shares at least one project with a given
 * project risk. C5 is a ranking hint for the link picker: nothing here is
 * written, scored, or thresholded — a candidate either shares a project or
 * does not.
 */
export interface SharedProjectCandidate {
  entityType: Exclude<ParentEntityType, "risk">;
  id: number;
  projects: string[];
}

/**
 * Shared project is the only honest cross-entity signal: `vendorrisks` carries
 * none of the fields the tier-0 scorer compares, and the two `risk_category`
 * enums are disjoint vocabularies.
 *
 * `DISTINCT` is load-bearing on the model branch —
 * `model_inventories_projects_frameworks` is keyed per framework, so one model
 * in one project under three frameworks would otherwise appear three times.
 *
 * The org filters on the junction tables sit on nullable columns on purpose.
 * A NULL there makes the row invisible, which is the correct direction for a
 * tenant boundary and matches the rest of the codebase. The subject's own
 * ownership is anchored to `risks.organization_id`, which is NOT NULL, so it
 * does not depend on the nullable `projects_risks.organization_id`.
 */
export async function getSharedProjectCandidatesQuery(
  organizationId: number,
  riskId: number,
): Promise<SharedProjectCandidate[]> {
  const rows = await sequelize.query(
    `WITH subject_projects AS (
       SELECT pr.project_id
         FROM projects_risks pr
         JOIN risks subject
           ON subject.id = pr.risk_id
          AND subject.organization_id = :organizationId
          AND subject.is_deleted = false
        WHERE pr.risk_id = :riskId
          AND pr.organization_id = :organizationId
     )
     SELECT DISTINCT 'vendor_risk' AS entity_type, vr.id AS id, p.project_title AS project_title
       FROM vendorrisks vr
       JOIN vendors_projects vp
         ON vp.vendor_id = vr.vendor_id
        AND vp.organization_id = :organizationId
       JOIN subject_projects sp ON sp.project_id = vp.project_id
       JOIN projects p          ON p.id          = vp.project_id
      WHERE vr.organization_id = :organizationId
        AND vr.is_deleted = false

     UNION ALL

     SELECT DISTINCT 'model_risk', mr.id, p.project_title
       FROM model_risks mr
       JOIN model_inventories_projects_frameworks mp
         ON mp.model_inventory_id = mr.model_id
        AND mp.organization_id = :organizationId
       JOIN subject_projects sp ON sp.project_id = mp.project_id
       JOIN projects p          ON p.id          = mp.project_id
      WHERE mr.organization_id = :organizationId
        AND mr.is_deleted = false

     ORDER BY entity_type, id, project_title`,
    { replacements: { organizationId, riskId }, type: QueryTypes.SELECT },
  );

  // DISTINCT already guarantees one row per (entity, id, title), so the titles
  // can be pushed without a second de-duplication pass. The map preserves row
  // order, so the returned array follows ORDER BY entity_type, which sorts
  // "model_risk" BEFORE "vendor_risk". The vendor branch is written first in
  // the SQL, but that is not the output order — callers join by id and must
  // never assert a vendor-first array.
  const grouped = new Map<string, SharedProjectCandidate>();
  for (const row of rows as any[]) {
    const key = `${row.entity_type}:${row.id}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.projects.push(row.project_title);
    } else {
      grouped.set(key, {
        entityType: row.entity_type,
        id: row.id,
        projects: [row.project_title],
      });
    }
  }
  return [...grouped.values()];
}
```

`ParentEntityType` and `QueryTypes` are already imported at the top of this file — no import changes are needed.

- [ ] **Step 5: Run the integration test to verify it passes**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.sharedProjects
```

Expected: PASS, 8 passed.

- [ ] **Step 6: Write the failing unit test for grouping and SQL shape**

Append inside the existing `describe("riskLink.utils", ...)` block in `Servers/utils/__tests__/riskLink.utils.test.ts`. Add `getSharedProjectCandidatesQuery` to that file's existing import list from `"../riskLink.utils"`.

```ts
  it("groups repeated rows for one candidate into a single entry", async () => {
    mockQuery.mockResolvedValue([
      { entity_type: "vendor_risk", id: 12, project_title: "Fraud Detection" },
      { entity_type: "vendor_risk", id: 12, project_title: "KYC" },
      { entity_type: "model_risk", id: 7, project_title: "Fraud Detection" },
    ]);

    expect(await getSharedProjectCandidatesQuery(3, 99)).toEqual([
      { entityType: "vendor_risk", id: 12, projects: ["Fraud Detection", "KYC"] },
      { entityType: "model_risk", id: 7, projects: ["Fraud Detection"] },
    ]);
  });

  it("scopes both branches and the subject risk to the org", async () => {
    await getSharedProjectCandidatesQuery(3, 99);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("vr.organization_id = :organizationId");
    expect(sql).toContain("mr.organization_id = :organizationId");
    expect(sql).toContain("subject.organization_id = :organizationId");
    expect(options.replacements).toEqual({ organizationId: 3, riskId: 99 });
    expect(options.type).toBe(QueryTypes.SELECT);
  });

  it("keeps DISTINCT on the model branch so one model is not repeated per framework", async () => {
    await getSharedProjectCandidatesQuery(3, 99);
    expect(mockQuery.mock.calls[0][0]).toContain("SELECT DISTINCT 'model_risk'");
  });
```

- [ ] **Step 7: Run the unit test**

```bash
cd Servers && npm run test:unit -- --testPathPatterns=riskLink.utils
```

Expected: PASS. (Steps 4 and 6 are written in this order because the integration test already drove the implementation; these unit tests lock the SQL shape so a later refactor cannot quietly drop an org filter.)

- [ ] **Step 8: Verify the build still compiles**

```bash
cd Servers && npm run build
```

Expected: exit 0. This is not optional — `Servers/utils/__tests__/*.test.ts` is inside the tsc program, so a type error in Step 6 would fail here and would silently block every integration test.

- [ ] **Step 9: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/utils/__tests__/riskLink.utils.test.ts Servers/tests/factories/test-entities.factory.ts Servers/tests/factories/index.ts Servers/tests/integration/riskLinks.sharedProjects.test.ts
git commit -m "feat(risk-links): query cross-entity candidates that share a project"
```

---

## Task 2: The shared-projects endpoint

**Files:**
- Modify: `Servers/controllers/riskLinks.ctrl.ts` (append after `getRiskLinks`, which ends ~line 228)
- Modify: `Servers/routes/riskLinks.route.ts`
- Modify: `Servers/swagger.yaml` (after the `'/riskLinks/{id}'` block, ~line 10136)
- Test: `Servers/tests/integration/riskLinks.sharedProjects.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `getSharedProjectCandidatesQuery(organizationId: number, riskId: number): Promise<SharedProjectCandidate[]>` and `SharedProjectCandidate` from Task 1, both exported from `Servers/utils/riskLink.utils.ts`.
- Produces: `GET /api/riskLinks/:riskId/shared-projects` responding `200` with `{ message, data: SharedProjectCandidate[] }`, and `400` for a non-numeric `riskId`.

- [ ] **Step 1: Write the failing HTTP test**

Append to `Servers/tests/integration/riskLinks.sharedProjects.test.ts`, and add
`import request from "supertest";` to the top of that file **now** rather than
in Task 1. `Servers/tsconfig.json` sets `noUnusedLocals: true` and this file is
inside the tsc program, so an import added before its first use fails
`npm run build` — which in turn aborts `globalSetup` and stops every integration
test from running.

```ts
describe("GET /api/riskLinks/:riskId/shared-projects", () => {
  it("returns the shared candidate over HTTP", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, project);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    const response = await request(owner.app).get(
      `/api/riskLinks/${subject}/shared-projects`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { entityType: "vendor_risk", id: vendorRisk, projects: ["Fraud Detection"] },
    ]);
  });

  it("answers a risk with no shared projects with 200 and an empty list", async () => {
    const { owner } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId, {});

    const response = await request(owner.app).get(
      `/api/riskLinks/${subject}/shared-projects`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("answers a risk belonging to another org with an empty list, not a leak", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const attackerProject = await createTestProject(attacker.orgId, attacker.userId, {
      project_title: "Fraud Detection",
    });
    const attackerRisk = await createTestRisk(attacker.orgId, {});
    await linkRiskToProject(attacker.orgId, attackerRisk, attackerProject);
    const attackerVendor = await createTestVendor(attacker.orgId, {});
    await linkVendorToProject(attacker.orgId, attackerVendor, attackerProject);
    await createTestVendorRisk(attacker.orgId, { vendor_id: attackerVendor });

    const response = await request(owner.app).get(
      `/api/riskLinks/${attackerRisk}/shared-projects`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("rejects a non-numeric risk id with 400", async () => {
    const { owner } = await seedTwoTenantContexts();

    const response = await request(owner.app).get("/api/riskLinks/abc/shared-projects");

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.sharedProjects
```

Expected: FAIL — the four new tests get `404` (no such route) instead of `200`/`400`. The eight tests from Task 1 still pass.

- [ ] **Step 3: Add the controller handler**

Append to `Servers/controllers/riskLinks.ctrl.ts`, directly after the `getRiskLinks` function. Add `getSharedProjectCandidatesQuery` to the existing import block from `"../utils/riskLink.utils"`.

```ts
/**
 * Which vendor and model risks share a project with this risk. A ranking hint
 * for the link picker — it writes nothing and asserts nothing beyond the shared
 * project, so an empty list is a normal answer, not an error. A risk outside
 * the caller's org yields an empty list for the same reason `getRiskLinks`
 * yields an empty list rather than a 404.
 */
export async function getSharedProjects(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getSharedProjects",
    functionName: "getSharedProjects",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const riskId = parseInt(String(req.params.riskId), 10);
    if (isNaN(riskId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid risk ID"));
    }

    const candidates = await getSharedProjectCandidatesQuery(req.organizationId!, riskId);

    logSuccess({
      eventType: "Read",
      description: `fetched ${candidates.length} shared-project candidates for risk ${riskId}`,
      functionName: "getSharedProjects",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](candidates));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch shared-project candidates",
      functionName: "getSharedProjects",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

- [ ] **Step 4: Register the route**

In `Servers/routes/riskLinks.route.ts`, add `getSharedProjects` to the import list from `"../controllers/riskLinks.ctrl"`, and add this line directly after `router.get("/:riskId", authenticateJWT, getRiskLinks);`:

```ts
router.get("/:riskId/shared-projects", authenticateJWT, getSharedProjects);
```

Declaration order is safe either way: `/:riskId` matches exactly one path segment and cannot swallow a two-segment path.

- [ ] **Step 5: Run the integration tests to verify they pass**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.sharedProjects
```

Expected: PASS, 12 passed.

- [ ] **Step 6: Add the Swagger operation**

The drift checker turns Express `/:param` into `/{param}` (`scripts/generateSwagger.ts:330`) and reads `bearerAuth` from `security`, so the path key and the security block below must both be exact. Insert into `Servers/swagger.yaml` immediately after the `'/riskLinks/{id}'` block and before `/roles:`:

```yaml
  '/riskLinks/{riskId}/shared-projects':
    get:
      summary: 'Get Shared Projects'
      responses:
        '200':
          description: Success
        '500':
          description: 'Internal server error'
      tags:
        - RiskLinks
      operationId: getSharedProjects
      security:
        -
          bearerAuth: []
```

- [ ] **Step 7: Verify the API contract balances**

```bash
cd Servers && npm run check:api-drift
```

Expected: exit 0, 708 endpoints matching 708 Swagger operations. A `code-missing-in-swagger` issue means the path key does not match; an `auth-mismatch` means the `security` block is wrong.

- [ ] **Step 8: Commit**

```bash
git add Servers/controllers/riskLinks.ctrl.ts Servers/routes/riskLinks.route.ts Servers/swagger.yaml Servers/tests/integration/riskLinks.sharedProjects.test.ts
git commit -m "feat(risk-links): expose shared-project candidates over HTTP"
```

---

## Task 3: Rank the picker and badge the sharers

**Files:**
- Modify: `Clients/src/domain/interfaces/i.riskLink.ts`
- Modify: `Clients/src/application/repository/riskLink.repository.ts`
- Modify: `Clients/src/application/hooks/useRiskLinks.ts`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx`
- Test: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx`
- Test: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx` (**mock repair only**)

**Interfaces:**
- Consumes: `GET /api/riskLinks/:riskId/shared-projects` from Task 2, responding `{ message, data: Array<{ entityType: "vendor_risk" | "model_risk"; id: number; projects: string[] }> }`.
- Produces: nothing later tasks depend on.

> **Read this before Step 1.** `LinkRiskForm.test.tsx` and `LinkedRisksPanel.test.tsx` each call `vi.mock("../../../../application/hooks/useRiskLinks", () => ({ ... }))` with a factory that lists exports **explicitly**. A factory mock replaces the whole module, so the moment `LinkRiskForm` imports `useSharedProjects`, both suites break with `useSharedProjects is not a function` — including tests that have nothing to do with C5. Step 4 repairs `LinkRiskForm.test.tsx` and Step 6 repairs `LinkedRisksPanel.test.tsx`. Do not skip Step 6 because the panel tests look unrelated to ranking.

- [ ] **Step 1: Add the shared type**

Append to `Clients/src/domain/interfaces/i.riskLink.ts`, after the `ENTITY_TYPE_LABELS` block:

```ts
/**
 * A cross-entity parent candidate that shares at least one project with the
 * risk being linked. Ranking only — the picker still lists non-sharers.
 */
export interface SharedProjectCandidate {
  entityType: Exclude<RiskLinkEntityType, "risk">;
  id: number;
  projects: string[];
}
```

- [ ] **Step 2: Add the repository call**

Append to `Clients/src/application/repository/riskLink.repository.ts`, and add `SharedProjectCandidate` to its existing import from `"../../domain/interfaces/i.riskLink"`:

```ts
export async function getSharedProjects(riskId: number): Promise<SharedProjectCandidate[]> {
  try {
    const response = await apiServices.get<{
      message: string;
      data: SharedProjectCandidate[];
    }>(`/riskLinks/${riskId}/shared-projects`);
    return extractData<SharedProjectCandidate[]>(response);
  } catch (error: any) {
    throw toAPIError(error, "Failed to fetch shared projects");
  }
}
```

- [ ] **Step 3: Add the hook**

Append to `Clients/src/application/hooks/useRiskLinks.ts`. Add `getSharedProjects` to the existing import from `"../repository/riskLink.repository"` and `SharedProjectCandidate` to the one from `"../../domain/interfaces/i.riskLink"`:

```ts
/**
 * Ranking data for the link picker. `enabled` is the caller's, because the
 * picker only needs it while a cross-entity parent source is selected. Its key
 * is deliberately outside `linksKey`: creating a link does not change which
 * projects a candidate belongs to, so this must not be invalidated with the
 * link list.
 */
export function useSharedProjects(riskId: number, enabled: boolean) {
  return useQuery<SharedProjectCandidate[]>({
    queryKey: ["riskLinkSharedProjects", riskId],
    queryFn: () => getSharedProjects(riskId),
    enabled: enabled && Number.isFinite(riskId),
  });
}
```

- [ ] **Step 4: Write the failing component tests**

House style in this file, follow it exactly: `userEvent.click(...)` is called
directly (never `userEvent.setup()`), and every test waits for its candidate
fetch with `waitFor` before touching the form.

First extend the mocks. `LinkRiskForm.test.tsx` mocks `useRiskLinks` with a
factory that lists its exports explicitly, so `useSharedProjects` has to be
added there or the component cannot resolve it in Step 7. Replace the existing
`useRiskLinks` factory with:

```tsx
const mockUseSharedProjects = vi.fn();

vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useCreateRiskLink: () => ({ mutate: mockCreate, isPending: false }),
  useSharedProjects: (...args: unknown[]) => mockUseSharedProjects(...args),
}));
```

Add one line to the **global** `beforeEach` (the one at ~line 63 that calls
`vi.clearAllMocks()`), after the `mockGetAllProjectRisks` default:

```tsx
  mockUseSharedProjects.mockReturnValue({ data: [] });
```

This line is required, not tidiness. `vi.clearAllMocks()` clears recorded calls
but **leaves implementations in place**, so a `mockReturnValue` from one test
would otherwise leak into every test after it and silently reorder pickers in
suites that never mention C5.

Then add the two repository mocks the file does not have yet, beside the other
`vi.mock` calls, above `import LinkRiskForm from "../LinkRiskForm";`:

```tsx
const mockGetAllVendorRisks = vi.fn();
const mockGetAllEntities = vi.fn();

vi.mock("../../../../application/repository/vendorRisk.repository", () => ({
  getAllVendorRisks: (...args: unknown[]) => mockGetAllVendorRisks(...args),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: unknown[]) => mockGetAllEntities(...args),
}));
```

Then append the suite at the end of the file:

```tsx
describe("LinkRiskForm shared-project ranking", () => {
  beforeEach(() => {
    mockGetAllVendorRisks.mockResolvedValue({
      data: [
        { id: 1, risk_description: "Unshared vendor risk" },
        { id: 2, risk_description: "Shared vendor risk" },
      ],
    });
    mockGetAllEntities.mockResolvedValue({ data: [] });
  });

  /** Selects Inherits from -> Vendor risk and opens the candidate list. */
  const openVendorPicker = async () => {
    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    await userEvent.click(screen.getByRole("radio", { name: "Vendor risk" }));
    await waitFor(() => expect(mockGetAllVendorRisks).toHaveBeenCalled());
    await userEvent.click(screen.getByPlaceholderText("Search risks"));
  };

  it("sorts a shared candidate above an unshared one and keeps both selectable", async () => {
    mockUseSharedProjects.mockReturnValue({
      data: [{ entityType: "vendor_risk", id: 2, projects: ["Fraud Detection"] }],
    });
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);

    await openVendorPicker();

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Shared vendor risk");
    expect(options[1]).toHaveTextContent("Unshared vendor risk");
  });

  it("badges the shared candidate with its project name", async () => {
    mockUseSharedProjects.mockReturnValue({
      data: [{ entityType: "vendor_risk", id: 2, projects: ["Fraud Detection"] }],
    });
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);

    await openVendorPicker();

    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Same project: Fraud Detection");
    expect(options[1]).not.toHaveTextContent("Same project");
  });

  it("summarises two shared projects as the first title plus a count", async () => {
    mockUseSharedProjects.mockReturnValue({
      data: [{ entityType: "vendor_risk", id: 2, projects: ["Fraud Detection", "KYC"] }],
    });
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);

    await openVendorPicker();

    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Same project: Fraud Detection +1");
  });

  // The map is keyed by id alone, so it must be filtered by entityType first:
  // project risk 10 and model risk 10 are different rows that share a number.
  it("leaves the project-risk picker unranked and unbadged", async () => {
    mockUseSharedProjects.mockReturnValue({
      data: [{ entityType: "model_risk", id: 10, projects: ["Fraud Detection"] }],
    });
    wrap(<LinkRiskForm riskId={42} existingLinks={[]} onClose={vi.fn()} />);

    await waitFor(() => expect(mockGetAllProjectRisks).toHaveBeenCalled());
    await userEvent.click(screen.getByPlaceholderText("Search risks"));

    const options = await screen.findAllByRole("option");
    // The global beforeEach seeds Model drift (9) then Data quality (10); risk
    // 42 is the subject and is excluded. Order must be untouched.
    expect(options[0]).toHaveTextContent("Model drift");
    expect(options[1]).toHaveTextContent("Data quality");
    expect(options[1]).not.toHaveTextContent("Same project");
  });
});
```

- [ ] **Step 5: Run them to verify they fail**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx
```

Expected: FAIL on the assertions, not on module resolution. `LinkRiskForm` does
not consume the hook yet, so the picker is still in server order: the first
option is "Unshared vendor risk" where the test wants "Shared vendor risk", and
no "Same project" text is rendered anywhere. That is the correct red.

- [ ] **Step 6: Repair the panel suite's hook mock**

`LinkedRisksPanel.test.tsx` mocks the same module with its own explicit factory,
and it renders `LinkRiskForm` through the panel. The moment Step 7 adds the
import, that suite breaks with `useSharedProjects is not a function` — in tests
that have nothing to do with C5. Add one line to its existing factory; the suite
never asserts on ranking and only needs the export to exist:

```tsx
vi.mock("../../../../application/hooks/useRiskLinks", () => ({
  useRiskLinks: (riskId: number, status?: string) => mockUseRiskLinks(riskId, status),
  useUpdateRiskLinkStatus: () => ({ mutate: mockMutateStatus, isPending: false }),
  useRecomputeRiskLinks: () => ({ mutate: mockMutateRecompute, isPending: false }),
  useCreateRiskLink: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useSuggestRiskHierarchy: () => ({ mutate: mockMutateSuggest, isPending: false }),
  useSharedProjects: () => ({ data: [] }),
}));
```

- [ ] **Step 7: Implement the ranking and the chip**

In `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx`:

Add `Chip` to the `@mui/material` import list, and `useSharedProjects` to the import from `"../../../application/hooks/useRiskLinks"`.

After the `crossEntityCandidates` query (currently ending at line 122), add:

```tsx
const { data: sharedProjects = [] } = useSharedProjects(riskId, source !== "risk");

/**
 * Candidate id -> shared project titles, for the currently selected source
 * only. Filtering by `entityType` is what keeps a model risk id from ranking a
 * vendor risk that happens to share that id.
 */
const sharedByCandidate = useMemo(() => {
  const map = new Map<number, string[]>();
  for (const candidate of sharedProjects) {
    if (candidate.entityType === source) map.set(candidate.id, candidate.projects);
  }
  return map;
}, [sharedProjects, source]);
```

Replace the existing `options` memo with a stable partition:

```tsx
const options = useMemo(() => {
  const pool = source === "risk" ? candidates : crossEntityCandidates;
  const visible = pool.filter((candidate) => !excludedKeys.has(`${source}:${candidate.id}`));
  // A stable partition, not a sort: each group keeps the server's order, and
  // nothing is removed — a candidate sharing no project stays selectable.
  return [
    ...visible.filter((candidate) => sharedByCandidate.has(candidate.id)),
    ...visible.filter((candidate) => !sharedByCandidate.has(candidate.id)),
  ];
}, [candidates, crossEntityCandidates, source, excludedKeys, sharedByCandidate]);
```

Add a `renderOption` prop to `AutoCompleteField` (it forwards every MUI Autocomplete prop except `renderInput` and `sx`), directly after the `getOptionLabel` line:

```tsx
        renderOption={(props, option) => {
          const shared = sharedByCandidate.get(option.id);
          return (
            <li {...props} key={`${source}:${option.id}`}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ width: "100%", justifyContent: "space-between" }}
              >
                <span>{option.risk_name}</span>
                {shared && shared.length > 0 && (
                  <Chip
                    size="small"
                    label={
                      shared.length > 1
                        ? `Same project: ${shared[0]} +${shared.length - 1}`
                        : `Same project: ${shared[0]}`
                    }
                  />
                )}
              </Stack>
            </li>
          );
        }}
```

The chip lives in `renderOption` rather than `getOptionLabel` on purpose: the label is also what the closed input displays, and the badge is only useful while choosing.

- [ ] **Step 8: Run the component tests**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel/
```

Expected: PASS — both `LinkRiskForm.test.tsx` and `LinkedRisksPanel.test.tsx` green, including every pre-existing test.

- [ ] **Step 9: Typecheck**

```bash
cd Clients && npm run typecheck
```

Expected: exit 0. This is a separate gate from `npm run build`, which uses esbuild and does not run `tsc`.

- [ ] **Step 10: Commit**

```bash
git add Clients/src/domain/interfaces/i.riskLink.ts Clients/src/application/repository/riskLink.repository.ts Clients/src/application/hooks/useRiskLinks.ts Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx
git commit -m "feat(risk-links): rank link candidates that share a project"
```

---

## Task 4: Full verification sweep

**Files:** none — this task changes nothing and exists to catch what a scoped test run hides.

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: nothing.

- [ ] **Step 1: Backend build**

```bash
cd Servers && npm run build
```

Expected: exit 0.

- [ ] **Step 2: Full backend unit suite**

```bash
cd Servers && npm run test:unit
```

Expected: 243 suites passed. Note the flag trap in Global Constraint 9 — this command takes no pattern, which is the point here.

- [ ] **Step 3: Full backend integration suite**

```bash
cd Servers && npm run test:integration
```

Expected: 39 suites passed (38 existing plus `riskLinks.sharedProjects`). If `deadline-summary.test.ts` is the only failure, check it against `develop` before blaming this branch: it is calendar-dependent and has failed on an unmodified tree.

- [ ] **Step 4: API contract**

```bash
cd Servers && npm run check:api-drift
```

Expected: exit 0, 708 = 708.

- [ ] **Step 5: Frontend typecheck and build**

```bash
cd Clients && npm run typecheck && npm run build
```

Expected: both exit 0.

- [ ] **Step 6: Full frontend suite**

```bash
cd Clients && npx vitest run
```

Expected: 540 suites passed. `npm run test` is `vitest watch` and never exits — do not use it.

- [ ] **Step 7: Hygiene**

```bash
git diff --check && git log --oneline develop..HEAD
```

Expected: `git diff --check` silent, and three C5 commits on top of the C1–C4 history.

Also confirm no debug output crept in:

```bash
cd /Users/ozger/Desktop/verifywise && git diff develop..HEAD -- Servers Clients | grep -n "console\.log" || echo "clean"
```

Expected: `clean`.
