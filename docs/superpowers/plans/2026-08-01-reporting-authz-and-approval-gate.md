# Reporting Authorization and Workflow Approval Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make organization-scope reports Admin-only and project-scope reports membership-gated at the point they are produced, and make the workflow approval gate able to complete an approve/reject cycle.

**Architecture:** A shared pure rule plus one async wrapper enforce report scope from four controller entry points (route guards cannot see scope, which lives in the request body; a service-layer choke point would need a scheduler escape hatch that reopens the hole). Workflow gates get a first-class path through the existing approval gateway where resuming the run *is* the execution, because `submitForApproval` auto-rejects anything without a tool executor and `approveActionImpl` bails before reaching the resume.

**Tech Stack:** Node 22, Express 4, TypeScript, Sequelize 6 raw SQL, PostgreSQL (shared schema, `organization_id` isolation), Jest.

**Spec:** `docs/superpowers/specs/2026-08-01-reporting-authz-and-approval-gate-design.md`

## Global Constraints

- Application SQL uses **unqualified** table names (`search_path = verifywise`). Never `verifywise.x` or `public.x` outside migrations.
- Every tenant-scoped query filters on `organization_id`.
- Roles: `Admin` (1), `Reviewer` (2), `Editor` (3), `Auditor` (4), plus `SuperAdmin`. Admin and SuperAdmin bypass membership rules.
- Authorization failures return **403**. `400` on these endpoints already means malformed input.
- Integration tests need `NODE_ENV=test`, `DB_APP_PASSWORD=test-app-role-password-for-ci`, `ENCRYPTION_KEY='default-key-change-this-in-production-32chars!!'`.
- Every test must **fail before** its implementation. Verify by stashing the implementation file and re-running. The existing unit suite mocks `sequelize.query`, so a test that never touches the database proves nothing here.
- New integration suites go in `Servers/tests/integration/` and must be added to the `Run reporting and workflow regression suites` step's `--testPathPatterns` in `.github/workflows/backend-checks.yml`, or CI will not run them.
- Run `cd Servers && npx prettier --write <files>` before every commit. CI runs `prettier --check` on changed files.

---

### Task 1: Report scope authorization module

**Files:**
- Create: `Servers/services/reporting/reportAuthorization.ts`
- Create: `Servers/services/reporting/__tests__/reportAuthorization.test.ts`
- Create: `Servers/tests/integration/report-scope-membership.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `reportScopeErrors(input: ReportScopeCheck): string[]`
  - `assertReportScopeAllowed(input: { role: string | null; userId: number; organizationId: number; scope: string | undefined; projectId: number | null | undefined }): Promise<string[]>`
  - `interface ReportScopeCheck { role: string | null; scope: string | undefined; projectId: number | null | undefined; isMember: boolean }`

- [ ] **Step 1: Write the failing unit test**

Create `Servers/services/reporting/__tests__/reportAuthorization.test.ts`:

```ts
import { reportScopeErrors } from "../reportAuthorization";

describe("reportScopeErrors", () => {
  it("lets Admin do anything", () => {
    expect(
      reportScopeErrors({ role: "Admin", scope: "organization", projectId: null, isMember: false }),
    ).toEqual([]);
    expect(
      reportScopeErrors({ role: "Admin", scope: "project", projectId: 7, isMember: false }),
    ).toEqual([]);
  });

  it("lets SuperAdmin do anything", () => {
    expect(
      reportScopeErrors({
        role: "SuperAdmin",
        scope: "organization",
        projectId: null,
        isMember: false,
      }),
    ).toEqual([]);
  });

  it("refuses organization scope for a non-Admin", () => {
    // An organization-scope report is the union of every project in the
    // tenant, so it is the one shape the membership rule cannot narrow.
    const errors = reportScopeErrors({
      role: "Editor",
      scope: "organization",
      projectId: null,
      isMember: true,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Admin/);
  });

  it("refuses project scope with no projectId", () => {
    expect(
      reportScopeErrors({ role: "Editor", scope: "project", projectId: null, isMember: false }),
    ).toEqual(["project scope requires projectId"]);
  });

  it("refuses a project the caller does not belong to", () => {
    const errors = reportScopeErrors({
      role: "Auditor",
      scope: "project",
      projectId: 7,
      isMember: false,
    });
    expect(errors).toEqual(["you are not a member of this project"]);
  });

  it("allows a project the caller belongs to", () => {
    expect(
      reportScopeErrors({ role: "Editor", scope: "project", projectId: 7, isMember: true }),
    ).toEqual([]);
  });

  it("treats an absent scope as organization scope", () => {
    // reportTemplate.ctrl defaults an omitted scope to "organization", so the
    // rule must not fall through to "permitted" when scope is undefined.
    const errors = reportScopeErrors({
      role: "Editor",
      scope: undefined,
      projectId: null,
      isMember: false,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Admin/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="reportAuthorization" -v`
Expected: FAIL — `Cannot find module '../reportAuthorization'`

- [ ] **Step 3: Write the module**

Create `Servers/services/reporting/reportAuthorization.ts`:

```ts
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";

/**
 * Who may produce a report, and over what.
 *
 * The read side already applies a membership rule (reportRun.utils'
 * viewerVisibilitySql). Nothing applied one to generation or delivery, so an
 * Editor could schedule a project report they cannot open and have it emailed
 * to themselves as an attachment, and an organization-scope run — the union of
 * every project in the tenant — was producible by any role.
 *
 * Kept as a pure rule plus a thin async wrapper so the rule is table-testable
 * without a database.
 */
export interface ReportScopeCheck {
  /** Role name from the JWT: Admin, Reviewer, Editor, Auditor, SuperAdmin. */
  role: string | null;
  scope: string | undefined;
  projectId: number | null | undefined;
  isMember: boolean;
}

const UNRESTRICTED_ROLES = ["Admin", "SuperAdmin"];

/** Returns [] when permitted, else one or more human-readable reasons. */
export function reportScopeErrors(input: ReportScopeCheck): string[] {
  if (input.role && UNRESTRICTED_ROLES.includes(input.role)) return [];

  // An omitted scope is organization scope: reportTemplate.ctrl defaults it
  // that way, so falling through here would leave the widest case ungated.
  if (input.scope !== "project") {
    return ["organization-scope reports require the Admin role"];
  }

  if (!input.projectId) return ["project scope requires projectId"];
  if (!input.isMember) return ["you are not a member of this project"];
  return [];
}

/**
 * Resolve membership, then apply the rule.
 *
 * A project that does not exist in the caller's organization produces no row
 * and therefore the same "not a member" message — the endpoint never confirms
 * whether another tenant's project id exists.
 */
export async function assertReportScopeAllowed(input: {
  role: string | null;
  userId: number;
  organizationId: number;
  scope: string | undefined;
  projectId: number | null | undefined;
}): Promise<string[]> {
  const needsMembership =
    input.scope === "project" &&
    !!input.projectId &&
    !(input.role && UNRESTRICTED_ROLES.includes(input.role));

  let isMember = false;
  if (needsMembership) {
    // Same predicate as project.utils.ts getAllProjectsQuery: owner or member.
    const rows = (await sequelize.query(
      `SELECT 1 AS ok FROM projects p
         LEFT JOIN projects_members pm
           ON pm.project_id = p.id AND pm.organization_id = :organizationId
        WHERE p.id = :projectId
          AND p.organization_id = :organizationId
          AND (p.owner = :userId OR pm.user_id = :userId)
        LIMIT 1`,
      {
        replacements: {
          projectId: input.projectId,
          organizationId: input.organizationId,
          userId: input.userId,
        },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ ok: number }>;
    isMember = rows.length > 0;
  }

  return reportScopeErrors({
    role: input.role,
    scope: input.scope,
    projectId: input.projectId,
    isMember,
  });
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="reportAuthorization" -v`
Expected: PASS — 7 tests

- [ ] **Step 5: Write the integration test for the membership lookup**

The unit test above stubs `isMember`. This one proves the SQL actually resolves owner, member, non-member and cross-org correctly. Create `Servers/tests/integration/report-scope-membership.test.ts`:

```ts
// Integration suites share one Postgres instance and truncate between tests;
// the default 5s hook timeout is not enough once several suites run in the same
// --runInBand pass. Same value as the isolation matrix.
jest.setTimeout(60000);

/**
 * The membership half of assertReportScopeAllowed, against the real schema.
 * The unit tests stub isMember, so only this file proves the predicate.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { assertReportScopeAllowed } from "../../services/reporting/reportAuthorization";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

async function seedProject(orgId: number, ownerId: number, name: string): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO projects
       (project_title, owner, start_date, ai_risk_classification, type_of_high_risk_role,
        goal, last_updated, last_updated_by, organization_id)
     VALUES (:name, :ownerId, NOW(), 'High risk', 'Deployer', 'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    { replacements: { name, ownerId, orgId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows[0].id;
}

async function addMember(orgId: number, projectId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId }, type: QueryTypes.INSERT },
  );
}

describe("assertReportScopeAllowed membership resolution", () => {
  let orgId: number;
  let otherOrgId: number;
  let ownerId: number;
  let memberId: number;
  let outsiderId: number;
  let projectId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    const stamp = Date.now();
    orgId = await createTestOrganization("Scope org");
    otherOrgId = await createTestOrganization("Other org");
    ownerId = await createTestUser(orgId, 3, `owner-${stamp}@test.com`, "Password123!");
    memberId = await createTestUser(orgId, 3, `member-${stamp}@test.com`, "Password123!");
    outsiderId = await createTestUser(orgId, 4, `outsider-${stamp}@test.com`, "Password123!");
    projectId = await seedProject(orgId, ownerId, "Members only");
    await addMember(orgId, projectId, memberId);
  });

  afterAll(async () => {
    await cleanupDatabase();
    // Release the pool: each test file has its own sequelize instance, and an
    // open one makes the next file's cleanupDatabase() TRUNCATE time out.
    await sequelize.close();
  });

  it("allows the project owner", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Editor",
      userId: ownerId,
      organizationId: orgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual([]);
  });

  it("allows an explicit project member", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Editor",
      userId: memberId,
      organizationId: orgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual([]);
  });

  it("refuses a non-member in the same organization", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Auditor",
      userId: outsiderId,
      organizationId: orgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual(["you are not a member of this project"]);
  });

  it("refuses a project belonging to another organization without confirming it exists", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Editor",
      userId: ownerId,
      organizationId: otherOrgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual(["you are not a member of this project"]);
  });

  it("does not query membership for an Admin", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Admin",
      userId: outsiderId,
      organizationId: orgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the integration test**

Run:
```bash
cd Servers && NODE_ENV=test DB_APP_PASSWORD=test-app-role-password-for-ci \
  ENCRYPTION_KEY='default-key-change-this-in-production-32chars!!' \
  npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" \
  --testMatch="**/tests/integration/report-scope-membership.test.ts" --runInBand
```
Expected: PASS — 5 tests

- [ ] **Step 7: Add the suite to CI and commit**

In `.github/workflows/backend-checks.yml`, extend the `--testPathPatterns` alternation in the `Run reporting and workflow regression suites` step to include `report-scope-membership`.

```bash
cd Servers && npx prettier --write services/reporting/reportAuthorization.ts services/reporting/__tests__/reportAuthorization.test.ts tests/integration/report-scope-membership.test.ts
cd /Users/ozger/Desktop/verifywise
git add Servers/services/reporting/reportAuthorization.ts Servers/services/reporting/__tests__/reportAuthorization.test.ts Servers/tests/integration/report-scope-membership.test.ts .github/workflows/backend-checks.yml
git commit -m "feat(reporting): add the report scope authorization rule"
```

---

### Task 2: Enforce scope authorization in the four controllers

**Files:**
- Modify: `Servers/controllers/scheduledReport.ctrl.ts` (`createScheduledReport`, `updateScheduledReport`, `runScheduledReportNow`)
- Modify: `Servers/controllers/reportTemplate.ctrl.ts` (`runTemplateNow`)
- Modify: `Servers/controllers/__tests__/scheduledReport.ctrl.test.ts`
- Create: `Servers/tests/integration/report-scope-authorization.test.ts`

**Interfaces:**
- Consumes: `assertReportScopeAllowed` from Task 1.
- Produces: 403 responses on all four endpoints when scope is not permitted.

- [ ] **Step 1: Write the failing integration test**

Create `Servers/tests/integration/report-scope-authorization.test.ts`:

```ts
jest.setTimeout(60000);

/**
 * Producing a report must obey the same membership rule as reading one.
 *
 * The read side (canViewRunQuery) has always applied it. Generation and
 * delivery had no equivalent, so an Editor could schedule a project report they
 * cannot open and have it emailed to themselves as an attachment, and an
 * organization-scope run — the union of every project in the tenant — was
 * producible by any role.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const TEMPLATES = "/api/reporting/templates";
const SCHEDULES = "/api/reporting/scheduled-reports";

const VALID_TEMPLATE = {
  name: "Scope probe",
  category: "governance",
  defaultScope: "organization",
  sectionsConfig: { sections: [{ reportSectionKey: "overview" }] },
};

function appFor(userId: number, role: string, orgId: number) {
  return createTestApp({ bypassAuth: true, mockUser: { userId, role, organizationId: orgId } });
}

async function seedProject(orgId: number, ownerId: number, name: string): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO projects
       (project_title, owner, start_date, ai_risk_classification, type_of_high_risk_role,
        goal, last_updated, last_updated_by, organization_id)
     VALUES (:name, :ownerId, NOW(), 'High risk', 'Deployer', 'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    { replacements: { name, ownerId, orgId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows[0].id;
}

describe("report scope authorization", () => {
  let orgId: number;
  let adminId: number;
  let editorId: number;
  let ownedProjectId: number;
  let foreignProjectId: number;
  let templateId: number;
  let versionId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    const stamp = Date.now();
    orgId = await createTestOrganization("Scope authz org");
    adminId = await createTestUser(orgId, 1, `admin-${stamp}@test.com`, "Password123!");
    editorId = await createTestUser(orgId, 3, `editor-${stamp}@test.com`, "Password123!");
    ownedProjectId = await seedProject(orgId, editorId, "Editor's project");
    foreignProjectId = await seedProject(orgId, adminId, "Admin's project");

    const res = await testRequest(appFor(adminId, "Admin", orgId))
      .post(TEMPLATES)
      .send(VALID_TEMPLATE);
    expect(res.status).toBe(201);
    const body = res.body?.data ?? res.body;
    templateId = body.id;
    versionId = body.latestVersion?.id ?? body.version_id ?? body.latest_version_id;
  });

  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  function schedulePayload(overrides: Record<string, unknown>) {
    return {
      templateId,
      templateVersionId: versionId,
      name: "Probe schedule",
      sectionsConfig: { sections: [{ reportSectionKey: "overview" }] },
      deliveryConfig: { saveToStorage: true },
      scheduleConfig: { frequency: "daily", hour: 9, minute: 0 },
      ...overrides,
    };
  }

  it("refuses an Editor creating an organization-scope schedule", async () => {
    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "organization" }));
    expect(res.status).toBe(403);
  });

  it("refuses an Editor creating a schedule for a project they do not belong to", async () => {
    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: foreignProjectId }));
    expect(res.status).toBe(403);
  });

  it("allows an Editor a schedule for their own project", async () => {
    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: ownedProjectId }));
    expect(res.status).toBe(201);
  });

  it("allows an Admin an organization-scope schedule", async () => {
    const res = await testRequest(appFor(adminId, "Admin", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "organization" }));
    expect(res.status).toBe(201);
  });

  it("refuses an Editor widening their own schedule to organization scope by PATCH", async () => {
    const created = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: ownedProjectId }));
    expect(created.status).toBe(201);
    const id = (created.body?.data ?? created.body).id;

    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .patch(`${SCHEDULES}/${id}`)
      .send({ scope: "organization", projectId: null });
    expect(res.status).toBe(403);
  });

  it("refuses an Editor running a template with no scope in the body", async () => {
    // reportTemplate.ctrl defaults an omitted scope to "organization", so this
    // is the widest report in the product reachable with the least input.
    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .post(`${TEMPLATES}/${templateId}/run`)
      .send({ templateVersionId: versionId });
    expect(res.status).toBe(403);
  });

  it("refuses an Editor run-now on someone else's project schedule", async () => {
    const created = await testRequest(appFor(adminId, "Admin", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: foreignProjectId }));
    expect(created.status).toBe(201);
    const id = (created.body?.data ?? created.body).id;

    const res = await testRequest(appFor(editorId, "Editor", orgId)).post(
      `${SCHEDULES}/${id}/run-now`,
    );
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
cd Servers && NODE_ENV=test DB_APP_PASSWORD=test-app-role-password-for-ci \
  ENCRYPTION_KEY='default-key-change-this-in-production-32chars!!' \
  npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" \
  --testMatch="**/tests/integration/report-scope-authorization.test.ts" --runInBand
```
Expected: FAIL — the four refusal tests get 201/202 instead of 403.

- [ ] **Step 3: Wire the check into `scheduledReport.ctrl.ts`**

Add to the imports:

```ts
import { assertReportScopeAllowed } from "../services/reporting/reportAuthorization";
```

In `createScheduledReport`, immediately after the existing `validateScheduledReportInput` block returns no errors and before `validateTemplateVersionOwnership`:

```ts
    // Authorization, not validation: organization scope is the union of every
    // project in the tenant, and a project-scoped report must not be
    // producible by someone who could not open it (canViewRunQuery denies
    // exactly that on the read side).
    const scopeErrors = await assertReportScopeAllowed({
      role: req.role ?? null,
      userId: req.userId!,
      organizationId: req.organizationId!,
      scope: req.body.scope,
      projectId: req.body.projectId,
    });
    if (scopeErrors.length) {
      return res.status(403).json(STATUS_CODE[403]({ errors: scopeErrors }));
    }
```

In `updateScheduledReport`, inside the existing `if (existing) { ... }` block that computes `effectiveScope` and `effectiveProjectId`, after the `scopeErrors` invariant check already there:

```ts
      const authzErrors = await assertReportScopeAllowed({
        role: req.role ?? null,
        userId: req.userId!,
        organizationId: req.organizationId!,
        scope: effectiveScope,
        projectId: effectiveProjectId,
      });
      if (authzErrors.length) {
        return res.status(403).json(STATUS_CODE[403]({ errors: authzErrors }));
      }
```

In `runScheduledReportNow`, after the `if (!sched) return 404` line:

```ts
    const scopeErrors = await assertReportScopeAllowed({
      role: req.role ?? null,
      userId: req.userId!,
      organizationId: req.organizationId!,
      scope: sched.scope,
      projectId: sched.project_id,
    });
    if (scopeErrors.length) {
      return res.status(403).json(STATUS_CODE[403]({ errors: scopeErrors }));
    }
```

- [ ] **Step 4: Wire the check into `reportTemplate.ctrl.ts`**

Add to the imports:

```ts
import { assertReportScopeAllowed } from "../services/reporting/reportAuthorization";
```

In `runTemplateNow`, immediately after `isProjectScope` and `projectId` are resolved and before the `sched` object literal is built:

```ts
    // An omitted scope resolves to "organization" here, so this endpoint is the
    // widest report in the product reachable with the least input.
    const scopeErrors = await assertReportScopeAllowed({
      role: req.role ?? null,
      userId: req.userId!,
      organizationId: req.organizationId!,
      scope: isProjectScope ? "project" : "organization",
      projectId,
    });
    if (scopeErrors.length) {
      return res.status(403).json(STATUS_CODE[403]({ errors: scopeErrors }));
    }
```

- [ ] **Step 5: Update the controller unit test mocks**

`Servers/controllers/__tests__/scheduledReport.ctrl.test.ts` mocks its dependencies explicitly, so the new import must be mocked or every existing test hits the database. Add at the top with the other `jest.mock` calls:

```ts
jest.mock("../../services/reporting/reportAuthorization", () => ({
  assertReportScopeAllowed: jest.fn(async () => []),
}));
```

Then add one test proving the wiring, at the end of the `updateScheduledReport` describe block:

```ts
  it("403s when the scope authorization rule refuses, without updating the row", async () => {
    const utils = require("../../utils/scheduledReport.utils");
    const authz = require("../../services/reporting/reportAuthorization");
    utils.updateScheduledReportQuery.mockClear();
    utils.getScheduledReportQuery.mockResolvedValueOnce({
      id: 7,
      scope: "project",
      project_id: 5,
    });
    authz.assertReportScopeAllowed.mockResolvedValueOnce([
      "organization-scope reports require the Admin role",
    ]);

    const res = mockRes();
    await updateScheduledReport(
      {
        params: { id: "7" },
        body: { scope: "organization", projectId: null },
        organizationId: 42,
        userId: 9,
        role: "Editor",
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(utils.updateScheduledReportQuery).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run both suites to verify they pass**

Run:
```bash
cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="scheduledReport.ctrl|reportTemplate.ctrl" -v
```
Expected: PASS

Run:
```bash
cd Servers && NODE_ENV=test DB_APP_PASSWORD=test-app-role-password-for-ci \
  ENCRYPTION_KEY='default-key-change-this-in-production-32chars!!' \
  npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" \
  --testMatch="**/tests/integration/report-scope-authorization.test.ts" --runInBand
```
Expected: PASS — 7 tests

- [ ] **Step 7: Verify the test would have caught the bug**

```bash
cd /Users/ozger/Desktop/verifywise
git stash push Servers/controllers/scheduledReport.ctrl.ts Servers/controllers/reportTemplate.ctrl.ts
# re-run the integration command from Step 6 — expect the four refusal tests to FAIL
git stash pop
```

- [ ] **Step 8: Add to CI and commit**

Extend the `--testPathPatterns` alternation in `.github/workflows/backend-checks.yml` with `report-scope-authorization`.

```bash
cd Servers && npx prettier --write controllers/scheduledReport.ctrl.ts controllers/reportTemplate.ctrl.ts controllers/__tests__/scheduledReport.ctrl.test.ts tests/integration/report-scope-authorization.test.ts
cd /Users/ozger/Desktop/verifywise
git add Servers/controllers/ Servers/tests/integration/report-scope-authorization.test.ts .github/workflows/backend-checks.yml
git commit -m "fix(reporting): gate report generation on project membership"
```

---

### Task 3: Scheduler warns about pre-existing schedules that violate the rule

**Files:**
- Modify: `Servers/services/reporting/reportSchedulerJobs.ts`
- Create: `Servers/services/reporting/__tests__/reportSchedulerJobs.authz.test.ts`

**Interfaces:**
- Consumes: `assertReportScopeAllowed` from Task 1.
- Produces: nothing consumed by later tasks.

Per the agreed decision, a schedule created before this rule **keeps running**. The scheduler logs a warning so there is a cleanup list, and nothing silently stops delivering on deploy.

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/__tests__/reportSchedulerJobs.authz.test.ts`:

```ts
jest.mock("../../../utils/scheduledReport.utils", () => ({
  findDueScheduledReportsQuery: jest.fn(),
  markRunEnqueuedQuery: jest.fn(async () => true),
}));
jest.mock("../reportRunOrchestrator", () => ({ runScheduledReport: jest.fn(async () => ({})) }));
jest.mock("../scheduleCalculator", () => ({ computeNextRun: jest.fn(() => new Date()) }));
jest.mock("../reportAuthorization", () => ({ assertReportScopeAllowed: jest.fn(async () => []) }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { handleReportSchedulerTick } from "../reportSchedulerJobs";
import { findDueScheduledReportsQuery } from "../../../utils/scheduledReport.utils";
import { runScheduledReport } from "../reportRunOrchestrator";
import { assertReportScopeAllowed } from "../reportAuthorization";
import logger from "../../../utils/logger/fileLogger";

const DUE = {
  id: 11,
  organization_id: 1,
  owner_id: 9,
  scope: "organization",
  project_id: null,
  next_run_at: new Date().toISOString(),
  schedule_config: { frequency: "daily", hour: 9, minute: 0 },
};

beforeEach(() => jest.clearAllMocks());

describe("handleReportSchedulerTick scope warnings", () => {
  it("still runs a schedule that would no longer be permitted, and warns", async () => {
    // Decision: the rule gates creation and editing. A schedule that predates
    // it keeps delivering — nothing silently stops working on deploy — but it
    // is named in the log so someone can clean it up.
    (findDueScheduledReportsQuery as jest.Mock).mockResolvedValue([DUE]);
    (assertReportScopeAllowed as jest.Mock).mockResolvedValue([
      "organization-scope reports require the Admin role",
    ]);

    await handleReportSchedulerTick();

    expect(runScheduledReport).toHaveBeenCalledTimes(1);
    const warning = (logger.warn as jest.Mock).mock.calls.map((c) => String(c[0])).join(" ");
    expect(warning).toContain("11");
    expect(warning).toMatch(/Admin/);
  });

  it("does not warn for a schedule that is still permitted", async () => {
    (findDueScheduledReportsQuery as jest.Mock).mockResolvedValue([DUE]);
    (assertReportScopeAllowed as jest.Mock).mockResolvedValue([]);

    await handleReportSchedulerTick();

    expect(runScheduledReport).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="reportSchedulerJobs.authz" -v`
Expected: FAIL — `logger.warn` is never called.

- [ ] **Step 3: Add the warning to the tick**

In `Servers/services/reporting/reportSchedulerJobs.ts`, add the imports:

```ts
import logger from "../../utils/logger/fileLogger";
import { assertReportScopeAllowed } from "./reportAuthorization";
```

and inside the `for (const sched of due)` loop, after the `if (!claimed) continue;` line:

```ts
    // Report-only. The scope rule gates creation and editing; a schedule that
    // predates it keeps delivering so nothing silently stops working on
    // deploy. Naming it here is what turns "we tightened the rule" into an
    // actionable cleanup list.
    if (sched.owner_id) {
      const scopeErrors = await assertReportScopeAllowed({
        role: null,
        userId: sched.owner_id,
        organizationId: sched.organization_id,
        scope: sched.scope,
        projectId: sched.project_id,
      });
      if (scopeErrors.length) {
        logger.warn(
          `[report-scheduler] schedule ${sched.id} (org ${sched.organization_id}, owner ${sched.owner_id}) would no longer be permitted: ${scopeErrors.join("; ")}. Running it anyway.`,
        );
      }
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="reportSchedulerJobs" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd Servers && npx prettier --write services/reporting/reportSchedulerJobs.ts services/reporting/__tests__/reportSchedulerJobs.authz.test.ts
cd /Users/ozger/Desktop/verifywise
git add Servers/services/reporting/
git commit -m "feat(reporting): warn when a due schedule would no longer be permitted"
```

---

### Task 4: `submitWorkflowGate` — create a gate approval

**Files:**
- Modify: `Servers/advisor/approval/approvalGateway.ts`
- Create: `Servers/advisor/approval/__tests__/submitWorkflowGate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const WORKFLOW_GATE_TOOL = "workflow_gate"`
  - `export async function submitWorkflowGate(config: { organizationId: number; userId?: number; workflowId: string; workflowRunId: number; stepId: string; description: string }): Promise<string>` — returns the new approval id.

`submitForApproval` cannot be reused: it auto-rejects anything whose `toolName` has no registered executor, and a workflow gate has none — the workflow step performs its own write on resume.

- [ ] **Step 1: Write the failing test**

Create `Servers/advisor/approval/__tests__/submitWorkflowGate.test.ts`:

```ts
jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn(async () => []) } }));
jest.mock("../../../utils/notification.utils", () => ({ createNotificationQuery: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../../services/aiAuditTrail.service", () => ({ logStateHistory: jest.fn() }));
jest.mock("../../observability/traceManager", () => ({
  startTrace: jest.fn(() => null),
  startSpan: jest.fn(() => null),
  endSpan: jest.fn(),
  logError: jest.fn(),
  orgTag: jest.fn((id: number) => `org:${id}`),
}));
jest.mock("../../../services/workflows/engine", () => ({ resumeWorkflow: jest.fn() }));

import { submitWorkflowGate, WORKFLOW_GATE_TOOL } from "../approvalGateway";
import { sequelize } from "../../../database/db";

const mockQuery = sequelize.query as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([]);
});

describe("submitWorkflowGate", () => {
  it("inserts a pending_approval row tagged as a workflow gate", async () => {
    const approvalId = await submitWorkflowGate({
      organizationId: 42,
      userId: 9,
      workflowId: "incident_response",
      workflowRunId: 77,
      stepId: "create_remediation_tasks",
      description: "Approve creation of remediation tasks",
    });

    expect(typeof approvalId).toBe("string");
    expect(approvalId.length).toBeGreaterThan(0);

    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO ai_action_approvals"),
    );
    expect(insert).toBeDefined();
    const r = insert![1].replacements;
    expect(r.state).toBe("pending_approval");
    expect(r.toolName).toBe(WORKFLOW_GATE_TOOL);
    expect(r.organizationId).toBe(42);
    expect(r.requestedBy).toBe(9);
    // Self-describing in the approval queue before the run is looked up.
    expect(JSON.parse(r.inputParams)).toMatchObject({
      workflowId: "incident_response",
      workflowRunId: 77,
      stepId: "create_remediation_tasks",
    });
  });

  it("stores NULL requested_by for a trigger-started run with no user", async () => {
    // Most gated runs come from a trigger, not a person. requested_by is
    // nullable, so a system gate stores NULL rather than a synthetic user id.
    await submitWorkflowGate({
      organizationId: 42,
      workflowId: "audit_preparation",
      workflowRunId: 5,
      stepId: "generate_audit_prep_report",
      description: "Approve publishing",
    });

    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO ai_action_approvals"),
    );
    expect(insert![1].replacements.requestedBy).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="submitWorkflowGate" -v`
Expected: FAIL — `submitWorkflowGate is not a function`

- [ ] **Step 3: Implement it**

In `Servers/advisor/approval/approvalGateway.ts`, after the `ApprovalSubmitResult` interface, add:

```ts
/**
 * tool_name marking an approval as a workflow gate rather than an AI tool call.
 *
 * A gate has no executor: the write is performed by the workflow step itself
 * when the run resumes. approveActionImpl branches on this value so it resumes
 * instead of looking for an executor that will never exist.
 */
export const WORKFLOW_GATE_TOOL = "workflow_gate";
```

and, next to `submitForApproval`, add:

```ts
/**
 * Create a pending approval for a gated workflow step.
 *
 * Deliberately does NOT go through submitForApproval: that path runs the rule
 * engine and an executor pre-check, and auto-rejects anything whose tool has no
 * registered executor (approvalGateway isAutoRejectable). Both exist to decide
 * whether a *tool* should run; a workflow gate has no tool. The consequence is
 * that org-level auto-approve rules do not apply to gates — see the design doc.
 *
 * @returns the approval id, which the step returns as StepResult.approvalId so
 *          the engine can persist it to ai_workflow_runs.awaiting_approval_id.
 */
export async function submitWorkflowGate(config: {
  organizationId: number;
  userId?: number;
  workflowId: string;
  workflowRunId: number;
  stepId: string;
  description: string;
}): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const stateHistory: StateHistoryEntry[] = [
    { state: "idle", timestamp: now, actor: "system" },
    {
      state: "pending_approval",
      timestamp: now,
      actor: "system",
      reason: `workflow gate: ${config.workflowId}.${config.stepId}`,
    },
  ];

  const gateConfig: SubmitForApprovalConfig = {
    organizationId: config.organizationId,
    // requested_by is nullable: most gated runs are started by a trigger, not
    // a person, and inventing a synthetic user id would corrupt the audit trail.
    userId: config.userId as number,
    toolName: WORKFLOW_GATE_TOOL,
    actionType: "workflow_gate",
    riskLevel: "warning",
    description: config.description,
    inputParams: {
      workflowId: config.workflowId,
      workflowRunId: config.workflowRunId,
      stepId: config.stepId,
    },
  };

  await insertApprovalRecord(id, gateConfig, "pending_approval", stateHistory);
  logStateHistory(config.organizationId, id, stateHistory, WORKFLOW_GATE_TOOL).catch(() => {});
  await notifyPendingApproval(gateConfig);

  logStructured(
    "successful",
    `workflow gate ${config.workflowId}.${config.stepId} awaiting approval (run ${config.workflowRunId})`,
    "submitWorkflowGate",
    fileName,
  );
  return id;
}
```

`insertApprovalRecord` already writes `requestedBy: config.userId`, and `undefined` binds as NULL, so no change is needed there. `deriveActionType` is called on the tool name inside `insertApprovalRecord`; `actionType` on the config is unused by that function and is set for readability.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="submitWorkflowGate" -v`
Expected: PASS — 2 tests

If the second test fails with `requestedBy: undefined` rather than `null`, change the `insertApprovalRecord` replacement to `requestedBy: config.userId ?? null` and note it in the commit.

- [ ] **Step 5: Commit**

```bash
cd Servers && npx prettier --write advisor/approval/approvalGateway.ts advisor/approval/__tests__/submitWorkflowGate.test.ts
cd /Users/ozger/Desktop/verifywise
git add Servers/advisor/approval/
git commit -m "feat(workflows): add a first-class approval path for workflow gates"
```

---

### Task 5: Clear `resumedApprovalId` after the gating step

**Files:**
- Modify: `Servers/services/workflows/engine.ts` (`executeStepLoop`)
- Modify: `Servers/services/workflows/__tests__/resume.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ctx.resumedApprovalId` is `undefined` for every step after the one the run resumed at.

Done **before** the definitions are wired, because it is the trap that fires the moment gating works: `incident_response` has two gated write steps, and one approval would authorize both.

- [ ] **Step 1: Write the failing test**

Append to `Servers/services/workflows/__tests__/resume.test.ts` (adapt the existing mock setup in that file — it already mocks `sequelize.query` and registers fixture workflows):

```ts
describe("resumedApprovalId scoping", () => {
  it("is cleared once the gating step completes, so a later gate pauses again", async () => {
    // incident_response has two gated write steps. With resumedApprovalId left
    // set for the rest of the loop, approving the first would silently
    // authorize the second — one human decision permitting two gated writes.
    const seen: Array<string | null | undefined> = [];
    const twoGateWorkflow: WorkflowDefinition = {
      id: "two_gate_probe",
      name: "Two gate probe",
      triggerName: "two.gate.probe",
      agents: ["probe"],
      steps: [
        {
          id: "first_gate",
          description: "gated",
          agent: "probe",
          isWrite: true,
          handler: async (ctx) => {
            seen.push(ctx.resumedApprovalId);
            if (!ctx.resumedApprovalId) {
              return { type: "pause", reason: "first", approvalId: "appr-1" };
            }
            return { type: "ok", output: { first: true } };
          },
        },
        {
          id: "second_gate",
          description: "gated",
          agent: "probe",
          isWrite: true,
          handler: async (ctx) => {
            seen.push(ctx.resumedApprovalId);
            if (!ctx.resumedApprovalId) {
              return { type: "pause", reason: "second", approvalId: "appr-2" };
            }
            return { type: "ok", output: { second: true } };
          },
        },
      ],
    };
    register(twoGateWorkflow);

    // Simulate the state the engine persists when it pauses at step 0.
    mockLoadedRun({
      id: 1,
      organizationId: 1,
      workflowType: "two_gate_probe",
      state: "awaiting_approval",
      currentStep: 0,
      results: [],
    });

    const run = await resumeWorkflow(1, "appr-1", 1);

    // The first step saw the approval and proceeded; the second saw nothing
    // and paused for its own.
    expect(seen[0]).toBe("appr-1");
    expect(seen[1]).toBeUndefined();
    expect(run?.state).toBe("awaiting_approval");
  });
});
```

Adapt `register` (from `services/workflows/registry`) and `mockLoadedRun` to the helpers that file already uses; if it constructs its fixtures inline, follow that shape instead. The assertions are what matter.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="workflows/__tests__/resume" -v`
Expected: FAIL — `seen[1]` is `"appr-1"`, and the run completes instead of pausing.

- [ ] **Step 3: Clear it in `executeStepLoop`**

In `Servers/services/workflows/engine.ts`, inside `executeStepLoop`, immediately after `let i = startIndex;`:

```ts
  // resumeWorkflow re-enters AT the gating step with ctx.resumedApprovalId set
  // so that step performs its write instead of pausing again. It must not stay
  // set beyond that step: incident_response has two gated writes, and a single
  // approval would otherwise authorize both.
  const resumeIndex = ctx.resumedApprovalId ? startIndex : -1;
```

and at the very end of the `while` body — after every branch that assigns `i`, immediately before the loop repeats — add:

```ts
    if (resumeIndex >= 0 && step === workflow.steps[resumeIndex]) {
      ctx.resumedApprovalId = undefined;
    }
```

Place it as the last statement inside the `while` block so it runs regardless of which outcome branch executed. Branches that `return` early (fail, pause) do not need it — the run is no longer looping.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="workflows" -v`
Expected: PASS — the whole workflows suite, not just the new test.

- [ ] **Step 5: Commit**

```bash
cd Servers && npx prettier --write services/workflows/engine.ts services/workflows/__tests__/resume.test.ts
cd /Users/ozger/Desktop/verifywise
git add Servers/services/workflows/
git commit -m "fix(workflows): scope resumedApprovalId to the gating step"
```

---

### Task 6: Approve and reject a workflow gate

**Files:**
- Modify: `Servers/advisor/approval/approvalGateway.ts` (`approveActionImpl`, `rejectActionImpl`)
- Modify: `Servers/services/workflows/engine.ts` (export a cancel-on-rejection helper)
- Create: `Servers/advisor/approval/__tests__/workflowGateResolution.test.ts`

**Interfaces:**
- Consumes: `WORKFLOW_GATE_TOOL` from Task 4.
- Produces:
  - `export async function cancelRunForRejectedApproval(approvalId: string, organizationId: number, userId: number, reason?: string): Promise<void>` in `engine.ts`.

- [ ] **Step 1: Write the failing test**

Create `Servers/advisor/approval/__tests__/workflowGateResolution.test.ts` with the same mock block as Task 4's test, plus:

```ts
import { approveAction, rejectAction, WORKFLOW_GATE_TOOL } from "../approvalGateway";
import { sequelize } from "../../../database/db";
import { resumeWorkflow } from "../../../services/workflows/engine";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

const mockQuery = sequelize.query as jest.Mock;

function gateRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "appr-1",
    organization_id: 42,
    tool_name: WORKFLOW_GATE_TOOL,
    state: "pending_approval",
    state_history: [],
    input_params: { workflowId: "incident_response", workflowRunId: 77 },
    ...overrides,
  };
}

describe("workflow gate resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    writeToolExecutors.clear?.();
  });

  it("approving a gate resumes the run instead of looking for an executor", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT * FROM ai_action_approvals")) return [gateRecord()];
      if (String(sql).includes("FROM ai_workflow_runs")) return [{ id: 77 }];
      return [];
    });
    (resumeWorkflow as jest.Mock).mockResolvedValue({ id: 77, state: "completed" });

    const result = await approveAction(42, "appr-1", 9);

    expect(result.success).toBe(true);
    expect(resumeWorkflow).toHaveBeenCalledWith(77, "appr-1", 42);
    // The executor path must not run: a gate has none, and the old code
    // failed the approval with "No executor" before reaching the resume.
    const failed = mockQuery.mock.calls.find((c) =>
      String(JSON.stringify(c[1]?.replacements ?? {})).includes("No executor"),
    );
    expect(failed).toBeUndefined();
  });

  it("marks the approval failed when no run is linked, rather than reporting success", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT * FROM ai_action_approvals")) return [gateRecord()];
      if (String(sql).includes("FROM ai_workflow_runs")) return [];
      return [];
    });

    const result = await approveAction(42, "appr-1", 9);

    expect(result.success).toBe(false);
    expect(resumeWorkflow).not.toHaveBeenCalled();
  });

  it("rejecting a gate cancels the run", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("SELECT * FROM ai_action_approvals")) return [gateRecord()];
      if (String(sql).includes("FROM ai_workflow_runs")) return [{ id: 77 }];
      return [];
    });

    const result = await rejectAction(42, "appr-1", 9, "not now");

    expect(result.success).toBe(true);
    const cancel = mockQuery.mock.calls.find(
      (c) =>
        String(c[0]).includes("UPDATE ai_workflow_runs") &&
        String(JSON.stringify(c[1]?.replacements ?? {})).includes("cancelled"),
    );
    expect(cancel).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="workflowGateResolution" -v`
Expected: FAIL — approve returns "No executor for workflow_gate"; reject never touches `ai_workflow_runs`.

- [ ] **Step 3: Add the cancel helper to `engine.ts`**

In `Servers/services/workflows/engine.ts`, add:

```ts
/**
 * Terminate a run whose gating approval was rejected.
 *
 * `cancelled` rather than `failed`: a human declined, which is a different
 * fact from a step erroring, and the compliance audit trail has to keep them
 * apart. persistRun clears awaiting_approval_id for any non-pausing state, so
 * the stale link cannot re-trigger a later resume.
 */
async function cancelRunForRejectedApproval(
  approvalId: string,
  organizationId: number,
  userId: number,
  reason?: string,
): Promise<void> {
  const runs = (await sequelize.query(
    `SELECT id, workflow_type, current_step, results FROM ai_workflow_runs
      WHERE organization_id = :organizationId
        AND awaiting_approval_id = :approvalId
        AND state = 'awaiting_approval'
      LIMIT 1`,
    { replacements: { organizationId, approvalId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number; workflow_type: string; current_step: number; results: unknown }>;
  const run = runs[0];
  if (!run) return;

  const records = (Array.isArray(run.results) ? run.results : []) as StepRecord[];
  await persistRun(
    run.id,
    organizationId,
    "cancelled",
    run.current_step,
    records,
    `approval rejected by user ${userId}${reason ? `: ${reason}` : ""}`,
  );
  await logWorkflowAudit(
    organizationId,
    run.id,
    "cancelled",
    `workflow.${run.workflow_type}.rejected`,
    { approvalId, rejectedBy: userId, reason: reason ?? null },
  );
}
```

Add `cancelRunForRejectedApproval` to the `export { ... }` block at the bottom of the file.

- [ ] **Step 4: Branch `approveActionImpl` on the gate tool name**

In `approveActionImpl`, replace the executor lookup block (`const executor = writeToolExecutors.get(record.tool_name); if (!executor) { ... }`) so the gate is handled first:

```ts
  // A workflow gate has no executor by design: the write is performed by the
  // workflow step itself when the run resumes. The resume IS the execution.
  if (record.tool_name === WORKFLOW_GATE_TOOL) {
    stateHistory.push({ state: "approved", timestamp: new Date().toISOString(), actor: `user:${userId}` });
    stateHistory.push({ state: "executing", timestamp: new Date().toISOString(), actor: "system" });
    await updateApprovalRecord(id, organizationId, {
      state: "executing",
      stateHistory,
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
    });

    const runs = (await sequelize.query(
      `SELECT id FROM ai_workflow_runs
        WHERE organization_id = :organizationId
          AND awaiting_approval_id = :approvalId
          AND state = 'awaiting_approval'
        LIMIT 1`,
      { replacements: { organizationId, approvalId: id }, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;

    if (!runs[0]) {
      // Never report success for a gate that resumed nothing.
      stateHistory.push({
        state: "failed",
        timestamp: new Date().toISOString(),
        actor: "system",
        reason: "no workflow run linked",
      });
      await updateApprovalRecord(id, organizationId, {
        state: "failed",
        stateHistory,
        errorMessage: "no workflow run linked to this gate",
      });
      return { success: false, error: "no workflow run linked to this gate" };
    }

    const resumed = await resumeWorkflow(runs[0].id, id, organizationId);
    stateHistory.push({ state: "completed", timestamp: new Date().toISOString(), actor: "system" });
    await updateApprovalRecord(id, organizationId, {
      state: "completed",
      stateHistory,
      executedAt: new Date().toISOString(),
      result: { workflowRunId: runs[0].id, state: resumed?.state ?? null },
    });
    logStateHistory(organizationId, id, stateHistory, record.tool_name).catch(() => {});
    return { success: true, result: { workflowRunId: runs[0].id, state: resumed?.state ?? null } };
  }

  const executor = writeToolExecutors.get(record.tool_name);
  // ... existing no-executor handling unchanged from here
```

- [ ] **Step 5: Add the workflow path to `rejectActionImpl`**

In `rejectActionImpl`, after the `updateApprovalRecord(id, organizationId, { state: "rejected", stateHistory })` call and before the Redis `resolveConfirmation` block:

```ts
  // A rejected gate must not leave its run parked forever: the approval can
  // never return to pending_approval, so no future approve could recover it.
  if (record.tool_name === WORKFLOW_GATE_TOOL) {
    try {
      await cancelRunForRejectedApproval(id, organizationId, userId, reason);
    } catch (error) {
      logStructured(
        "error",
        `failed to cancel workflow run for rejected gate ${id}`,
        functionName,
        fileName,
      );
      logger.error("cancelRunForRejectedApproval failed:", error);
    }
  }
```

Add `cancelRunForRejectedApproval` to the existing `import { resumeWorkflow } from "../../services/workflows/engine";` line, and import `logger` from `../../utils/logger/fileLogger` if it is not already imported in this file.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="workflowGateResolution|approvalGateway" -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd Servers && npx prettier --write advisor/approval/approvalGateway.ts services/workflows/engine.ts advisor/approval/__tests__/workflowGateResolution.test.ts
cd /Users/ozger/Desktop/verifywise
git add Servers/advisor/approval/ Servers/services/workflows/engine.ts
git commit -m "fix(workflows): resolve gate approvals by resuming, cancel on rejection"
```

---

### Task 7: Wire the five gated steps to create real approvals

**Files:**
- Create: `Servers/services/workflows/approvalGate.ts`
- Create: `Servers/services/workflows/__tests__/approvalGate.test.ts`
- Modify: `Servers/services/workflows/definitions/incidentResponse.workflow.ts` (2 sites)
- Modify: `Servers/services/workflows/definitions/vendorOnboarding.workflow.ts`
- Modify: `Servers/services/workflows/definitions/auditPreparation.workflow.ts`
- Modify: `Servers/services/workflows/definitions/modelDeployment.workflow.ts`
- Modify: the four `__tests__/*.workflow.test.ts` files for those definitions

**Interfaces:**
- Consumes: `submitWorkflowGate` from Task 4.
- Produces: `export async function requestGateApproval(ctx: WorkflowContext, workflowId: string, stepId: string, description: string): Promise<StepResult>` returning `{ type: "pause", reason, approvalId }`. `workflowId` is a parameter because `WorkflowContext` does not carry one.

- [ ] **Step 1: Write the failing test for the helper**

Create `Servers/services/workflows/__tests__/approvalGate.test.ts`:

```ts
jest.mock("../../../advisor/approval/approvalGateway", () => ({
  submitWorkflowGate: jest.fn(async () => "appr-123"),
}));

import { requestGateApproval } from "../approvalGate";
import { submitWorkflowGate } from "../../../advisor/approval/approvalGateway";
import { WorkflowContext } from "../types";

const ctx: WorkflowContext = {
  workflowRunId: 77,
  organizationId: 42,
  userId: 9,
  triggerPayload: { workflowId: "incident_response" },
  results: {},
};

beforeEach(() => jest.clearAllMocks());

describe("requestGateApproval", () => {
  it("creates an approval and returns a pause carrying its id", async () => {
    // Without an approvalId the engine persists awaiting_approval_id = NULL and
    // the run can never be resumed — that is the defect this closes.
    const result = await requestGateApproval(
      ctx,
      "incident_response",
      "create_remediation_tasks",
      "Approve tasks",
    );

    expect(result).toEqual({
      type: "pause",
      reason: "Approve tasks",
      approvalId: "appr-123",
    });
    expect(submitWorkflowGate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 42,
        userId: 9,
        workflowRunId: 77,
        stepId: "create_remediation_tasks",
        description: "Approve tasks",
      }),
    );
  });

  it("fails the step rather than pausing unresumably when the approval cannot be created", async () => {
    (submitWorkflowGate as jest.Mock).mockRejectedValueOnce(new Error("db down"));

    const result = await requestGateApproval(ctx, "wf", "step", "desc");

    expect(result.type).toBe("fail");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="approvalGate" -v`
Expected: FAIL — `Cannot find module '../approvalGate'`

- [ ] **Step 3: Write the helper**

Create `Servers/services/workflows/approvalGate.ts`:

```ts
import { submitWorkflowGate } from "../../advisor/approval/approvalGateway";
import logger from "../../utils/logger/fileLogger";
import { StepResult, WorkflowContext } from "./types";

/**
 * Pause a gated step for human approval, creating the approval record that
 * makes the pause resumable.
 *
 * A bare `{ type: "pause" }` leaves ai_workflow_runs.awaiting_approval_id NULL,
 * and the only resume path matches on that column — so the run parks forever.
 * Every gated step goes through here so that cannot be forgotten one site at a
 * time.
 */
export async function requestGateApproval(
  ctx: WorkflowContext,
  workflowId: string,
  stepId: string,
  description: string,
): Promise<StepResult> {
  try {
    const approvalId = await submitWorkflowGate({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      // WorkflowContext carries no workflow id, so each definition passes its
      // own. It lands in the approval's input_params, which is what makes the
      // Admin queue readable without joining back to the run.
      workflowId,
      workflowRunId: ctx.workflowRunId,
      stepId,
      description,
    });
    return { type: "pause", reason: description, approvalId };
  } catch (error) {
    // Failing loudly beats pausing on an approval that does not exist, which
    // is indistinguishable from the bug this replaces.
    logger.error(`[workflow] could not create gate approval for ${stepId}:`, error);
    return {
      type: "fail",
      error: `could not create approval for gated step ${stepId}`,
    };
  }
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="approvalGate" -v`
Expected: PASS — 2 tests

- [ ] **Step 5: Wire the five gated sites**

Each site replaces its bare pause. Import in each file:

```ts
import { requestGateApproval } from "../approvalGate";
```

`incidentResponse.workflow.ts` — `createRemediationTasks`:

```ts
  if (!ctx.resumedApprovalId) {
    return requestGateApproval(
      ctx,
      "incident_response",
      "create_remediation_tasks",
      `Approve creation of remediation tasks for incident ${classification?.incidentId ?? "?"}`,
    );
  }
```

`incidentResponse.workflow.ts` — `escalateNotifyAdmins`:

```ts
  if (!ctx.resumedApprovalId) {
    return requestGateApproval(
      ctx,
      "incident_response",
      "escalate_notify_admins",
      `Approve admin escalation for critical incident ${classification?.incidentId ?? "?"}`,
    );
  }
```

`vendorOnboarding.workflow.ts`:

```ts
        if (!ctx.resumedApprovalId) {
          return requestGateApproval(
            ctx,
            "vendor_onboarding",
            "create_followup_tasks",
            `Follow-up tasks for ${vendor?.vendor_name || "vendor"} (${
              checks?.highSeverityCount || 0
            } high-severity risk(s)) require approval before creation`,
          );
        }
```

`auditPreparation.workflow.ts`:

```ts
      if (ctx.triggerPayload.approved !== true && !ctx.resumedApprovalId) {
        return requestGateApproval(
          ctx,
          "audit_preparation",
          "generate_audit_prep_report",
          "Audit-preparation report requires approval before publishing.",
        );
      }
```

`modelDeployment.workflow.ts`:

```ts
        if (trigger.requireApproval && !ctx.resumedApprovalId) {
          return requestGateApproval(
            ctx,
            "model_deployment",
            "create_evidence_task",
            "Evidence collection task requires approval",
          );
        }
```

The step ids above are verified against the definition files: `create_remediation_tasks` and `escalate_notify_admins` (incidentResponse), `create_followup_tasks` (vendorOnboarding), `generate_audit_prep_report` (auditPreparation), `create_evidence_task` (modelDeployment). The `stepId` argument is recorded in the approval's `input_params` and is what makes the approval queue readable.

- [ ] **Step 6: Update the four definition test files**

Each currently asserts `toEqual({ type: "pause", reason: "..." })` or `toMatchObject({ type: "pause" })`. Those still hold for `toMatchObject`, but exact `toEqual` assertions now need `approvalId`. In each affected test, mock the helper at the top of the file:

```ts
jest.mock("../../approvalGate", () => ({
  requestGateApproval: jest.fn(async (_ctx, _workflowId, _stepId, description) => ({
    type: "pause",
    reason: description,
    approvalId: "appr-test",
  })),
}));
```

and change exact-equality pause assertions to include `approvalId: "appr-test"`. Add a comment where changed:

```ts
    // A pause now carries the approval id that makes it resumable; a bare
    // pause left awaiting_approval_id NULL and parked the run forever.
```

- [ ] **Step 7: Run the whole workflows suite**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="workflows" -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd Servers && npx prettier --write services/workflows/
cd /Users/ozger/Desktop/verifywise
git add Servers/services/workflows/
git commit -m "fix(workflows): make every gated step create a resumable approval"
```

---

### Task 8: Close the approval bypass route

**Files:**
- Modify: `Servers/routes/aiConfirmation.route.ts`
- Create: `Servers/controllers/__tests__/aiConfirmation.route.test.ts`
- Regenerate: `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts`

`POST /api/ai-confirmations/approve/:id` calls the same `approveAction` as the Admin-guarded `/api/ai-approvals/:id/approve`, with no role check. An Admin-only workflow gate built on top of it would be security theatre.

- [ ] **Step 1: Write the failing test**

Create `Servers/controllers/__tests__/aiConfirmation.route.test.ts`:

```ts
import request from "supertest";
import express from "express";
import aiConfirmationRoutes from "../../routes/aiConfirmation.route";

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-test-role"] || "Editor";
    next();
  },
}));
jest.mock("../aiConfirmation.ctrl", () => ({
  approveConfirmation: (_req: any, res: any) => res.status(200).json({ ok: true }),
  rejectConfirmation: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getPendingConfirmations: (_req: any, res: any) => res.status(200).json({ ok: true }),
}));

const app = express();
app.use(express.json());
app.use("/api/ai-confirmations", aiConfirmationRoutes);

describe("ai-confirmations route guards", () => {
  it("refuses a non-Admin approving a confirmation", async () => {
    // Same approveAction as /api/ai-approvals/:id/approve, which is Admin-only.
    // Without this guard the Admin-only rule on workflow gates is bypassable.
    const res = await request(app)
      .post("/api/ai-confirmations/approve/appr-1")
      .set("x-test-role", "Editor");
    expect(res.status).toBe(403);
  });

  it("refuses a non-Admin rejecting a confirmation", async () => {
    const res = await request(app)
      .post("/api/ai-confirmations/reject/appr-1")
      .set("x-test-role", "Auditor");
    expect(res.status).toBe(403);
  });

  it("allows an Admin", async () => {
    const res = await request(app)
      .post("/api/ai-confirmations/approve/appr-1")
      .set("x-test-role", "Admin");
    expect(res.status).toBe(200);
  });

  it("leaves the read endpoint open to any authenticated role", async () => {
    const res = await request(app)
      .get("/api/ai-confirmations/pending")
      .set("x-test-role", "Auditor");
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="aiConfirmation.route" -v`
Expected: FAIL — the two refusal tests get 200.

- [ ] **Step 3: Add the guard**

In `Servers/routes/aiConfirmation.route.ts`:

```ts
import authorize from "../middleware/accessControl.middleware";
```

```ts
// Same approveAction/rejectAction as aiApproval.route.ts, which is Admin-only.
// Without the same guard here, that rule — and the Admin-only workflow gate
// built on it — is bypassable through this path.
router.post("/approve/:id", authenticateJWT, authorize(["Admin"]), approveConfirmation);
router.post("/reject/:id", authenticateJWT, authorize(["Admin"]), rejectConfirmation);
router.get("/pending", authenticateJWT, getPendingConfirmations);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Servers && npx jest --testPathIgnorePatterns=/tests/integration/ --testPathPatterns="aiConfirmation" -v`
Expected: PASS — 4 tests

- [ ] **Step 5: Regenerate the API docs and commit**

Route metadata changed, so the generated spec must be regenerated or the `api-docs-drift` CI job fails.

```bash
cd Servers
npm run build
npm run generate:swagger
npm run generate:endpoints
npm run check:api-drift
npx prettier --write routes/aiConfirmation.route.ts controllers/__tests__/aiConfirmation.route.test.ts
cd /Users/ozger/Desktop/verifywise
git add Servers/routes/aiConfirmation.route.ts Servers/controllers/__tests__/aiConfirmation.route.test.ts Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "fix(security): require Admin to resolve an AI confirmation"
```

---

### Task 9: End-to-end approval gate integration suite

**Files:**
- Create: `Servers/tests/integration/workflow-approval-gate.test.ts`
- Modify: `.github/workflows/backend-checks.yml`

**Interfaces:**
- Consumes: everything from Tasks 4–8.
- Produces: nothing.

This is the test that proves the cycle actually closes against a real database. Every unit test above mocks `sequelize.query`, which is exactly how the original defects survived a green suite.

- [ ] **Step 1: Write the suite**

Create `Servers/tests/integration/workflow-approval-gate.test.ts`:

```ts
jest.setTimeout(60000);

/**
 * The workflow approval gate, end to end against the real schema.
 *
 * Before this work no definition produced an approvalId, so the engine
 * persisted awaiting_approval_id = NULL and the only resume path — which
 * matches on that column — never fired. audit_preparation, vendor_onboarding
 * and incident_response parked in awaiting_approval permanently. Deeper still:
 * submitForApproval auto-rejects anything whose tool has no executor, and
 * approveActionImpl bailed on "No executor" before reaching the resume, so even
 * a hand-inserted approval could not be approved.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { startWorkflow, resumeWorkflow } from "../../services/workflows/engine";
import { register } from "../../services/workflows/registry";
import { requestGateApproval } from "../../services/workflows/approvalGate";
import { approveAction, rejectAction } from "../../advisor/approval/approvalGateway";
import { WorkflowDefinition } from "../../services/workflows/types";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const twoGateWorkflow: WorkflowDefinition = {
  id: "gate_probe",
  name: "Gate probe",
  triggerName: "gate.probe",
  agents: ["probe"],
  steps: [
    {
      id: "first_gate",
      description: "gated write",
      agent: "probe",
      isWrite: true,
      handler: async (ctx) =>
        ctx.resumedApprovalId
          ? { type: "ok", output: { first: true } }
          : requestGateApproval(ctx, "gate_probe", "first_gate", "Approve the first write"),
    },
    {
      id: "second_gate",
      description: "gated write",
      agent: "probe",
      isWrite: true,
      handler: async (ctx) =>
        ctx.resumedApprovalId
          ? { type: "ok", output: { second: true } }
          : requestGateApproval(ctx, "gate_probe", "second_gate", "Approve the second write"),
    },
  ],
};

async function runRow(id: number) {
  const rows = (await sequelize.query(
    `SELECT state, awaiting_approval_id FROM ai_workflow_runs WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  )) as Array<{ state: string; awaiting_approval_id: string | null }>;
  return rows[0];
}

async function approvalRow(id: string) {
  const rows = (await sequelize.query(
    `SELECT state, tool_name FROM ai_action_approvals WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  )) as Array<{ state: string; tool_name: string }>;
  return rows[0];
}

describe("workflow approval gate end to end", () => {
  let orgId: number;
  let adminId: number;

  beforeAll(() => register(twoGateWorkflow));

  beforeEach(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization("Gate org");
    adminId = await createTestUser(orgId, 1, `gate-admin-${Date.now()}@test.com`, "Password123!");
  });

  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  it("pauses with a real approval id persisted to the run", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });

    expect(run.state).toBe("awaiting_approval");
    const row = await runRow(run.id);
    expect(row.awaiting_approval_id).toBeTruthy();

    const approval = await approvalRow(row.awaiting_approval_id!);
    expect(approval.state).toBe("pending_approval");
    expect(approval.tool_name).toBe("workflow_gate");
  });

  it("approving resumes the run, and the SECOND gate pauses for its own approval", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;

    const result = await approveAction(orgId, first, adminId);
    expect(result.success).toBe(true);

    const after = await runRow(run.id);
    // One human decision must not authorize two gated writes.
    expect(after.state).toBe("awaiting_approval");
    expect(after.awaiting_approval_id).toBeTruthy();
    expect(after.awaiting_approval_id).not.toBe(first);
  });

  it("approving both gates drives the run to completed", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, first, adminId);
    const second = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, second, adminId);

    expect((await runRow(run.id)).state).toBe("completed");
  });

  it("rejecting cancels the run and clears the approval link", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;

    const result = await rejectAction(orgId, first, adminId, "not now");
    expect(result.success).toBe(true);

    const after = await runRow(run.id);
    expect(after.state).toBe("cancelled");
    expect(after.awaiting_approval_id).toBeNull();
    expect((await approvalRow(first)).state).toBe("rejected");
  });

  it("writes the audit trail for the whole cycle", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await rejectAction(orgId, first, adminId, "no");

    const rows = (await sequelize.query(
      `SELECT to_state, rule_name FROM ai_action_audit_log
        WHERE workflow_run_id = :id ORDER BY id ASC`,
      { replacements: { id: run.id }, type: QueryTypes.SELECT },
    )) as Array<{ to_state: string; rule_name: string }>;

    expect(rows.map((r) => r.to_state)).toContain("awaiting_approval");
    expect(rows.map((r) => r.to_state)).toContain("cancelled");
    expect(rows.map((r) => r.rule_name)).toContain("workflow.gate_probe.rejected");
  });

  it("marks a gate failed when its run has vanished, rather than reporting success", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await sequelize.query(`DELETE FROM ai_workflow_runs WHERE id = :id`, {
      replacements: { id: run.id },
      type: QueryTypes.DELETE,
    });

    const result = await approveAction(orgId, first, adminId);
    expect(result.success).toBe(false);
  });

  it("resume is a no-op for a run that is not awaiting approval", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, first, adminId);
    const second = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, second, adminId);

    const again = await resumeWorkflow(run.id, second, orgId);
    expect(again?.state).toBe("completed");
  });
});
```

The registry must know `gate_probe` before `resumeWorkflow` runs, or it cannot resolve the definition and returns the run unchanged.

- [ ] **Step 2: Run it**

Run:
```bash
cd Servers && NODE_ENV=test DB_APP_PASSWORD=test-app-role-password-for-ci \
  ENCRYPTION_KEY='default-key-change-this-in-production-32chars!!' \
  npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" \
  --testMatch="**/tests/integration/workflow-approval-gate.test.ts" --runInBand
```
Expected: PASS — 7 tests

- [ ] **Step 3: Add to CI**

Extend the `--testPathPatterns` alternation in the `Run reporting and workflow regression suites` step with `workflow-approval-gate`. The step's pattern should now list, at minimum: `workflow-audit-log`, `user-deletion-fks`, `reporting-rls-policies`, `report-run-visibility`, `framework-gap-workflow`, `report-scope-membership`, `report-scope-authorization`, `workflow-approval-gate`.

- [ ] **Step 4: Run the whole new-suite set together twice**

Cross-suite interference only shows in a shared `--runInBand` pass. Run the full CI pattern twice and confirm both are green before committing.

```bash
cd Servers && NODE_ENV=test DB_APP_PASSWORD=test-app-role-password-for-ci \
  ENCRYPTION_KEY='default-key-change-this-in-production-32chars!!' \
  npm run test:integration -- --testPathPatterns='tests/integration/(workflow-audit-log|user-deletion-fks|reporting-rls-policies|report-run-visibility|framework-gap-workflow|report-scope-membership|report-scope-authorization|workflow-approval-gate)\.test\.ts'
```
Expected: all suites pass, twice in a row.

- [ ] **Step 5: Commit**

```bash
cd Servers && npx prettier --write tests/integration/workflow-approval-gate.test.ts
cd /Users/ozger/Desktop/verifywise
git add Servers/tests/integration/workflow-approval-gate.test.ts .github/workflows/backend-checks.yml
git commit -m "test(workflows): cover the approval gate cycle end to end"
```

---

### Task 10: Full gate sweep and PR update

**Files:**
- Modify: PR #4389 description

- [ ] **Step 1: Run every gate**

```bash
cd Servers
npm run build
npm run test:unit
npm run test:coverage
npm run check:api-drift
npm run i18n:audit:strict
npm run format-check
NODE_ENV=test DB_APP_PASSWORD=test-app-role-password-for-ci \
  ENCRYPTION_KEY='default-key-change-this-in-production-32chars!!' npm run test:integration
NODE_ENV=test DB_APP_PASSWORD=test-app-role-password-for-ci \
  ENCRYPTION_KEY='default-key-change-this-in-production-32chars!!' \
  npx ts-node scripts/auditTenantIsolationCoverage.ts
cd ../Clients && npm run typecheck && npm run format-check && npm run i18n:audit:strict && npm run test:ci
```
Expected: all green. `test:unit` count should exceed the pre-task baseline of 4289.

- [ ] **Step 2: Push and watch CI**

```bash
git push origin hp-apr-16-add-tasks-agent
gh pr checks 4389
```
Expected: 23/23 pass. Confirm the `Run reporting and workflow regression suites` step shows `success` in the Tenant Isolation job — a new suite that CI does not execute proves nothing.

- [ ] **Step 3: Update the PR description**

Move both findings out of the "Found and NOT fixed — these need a decision" section into the fixed table, and record the decisions taken: org-scope reports are Admin-only, project-scope requires membership, pre-existing schedules keep running with a warning, workflow gates are Admin-resolvable, and rejection cancels the run. Note the two behaviour changes reviewers must know about:

- `POST /api/ai-confirmations/approve/:id` and `/reject/:id` now require Admin. Any non-Admin client using that path stops working — it was the bypass around the Admin rule on `/api/ai-approvals`.
- Workflow gates skip the rule engine, so org-level auto-approve rules do not apply to them.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: reporting module → Task 1; four call sites → Task 2; scheduler warning → Task 3; `submitWorkflowGate` → Task 4; `resumedApprovalId` clearing → Task 5; approve/reject branches → Task 6; `requestGateApproval` and the five definitions → Task 7; `aiConfirmation` guard → Task 8; both integration suites → Tasks 1, 2 and 9; consequences and PR update → Task 10. The spec's "Out of scope" list (`modelDeployment`'s unreachable trigger, the stuck-run reaper, the missing engine HTTP surface) is intentionally unplanned.

**Placeholder scan.** No TBD/TODO. Every code step carries the actual code. The two conditional instructions the first draft carried were resolved during self-review by reading the source: the registry exports `register` (not `registerWorkflow`), and the real gated step ids are `create_remediation_tasks`, `escalate_notify_admins`, `create_followup_tasks`, `generate_audit_prep_report` and `create_evidence_task` — two of which the first draft had wrong.

**Type consistency.** `assertReportScopeAllowed` takes the same five-field object in Tasks 1, 2 and 3. `reportScopeErrors` takes `ReportScopeCheck` in Task 1 only. `WORKFLOW_GATE_TOOL` is defined in Task 4 and consumed in Tasks 6 and 9. `submitWorkflowGate`'s config object is identical in Tasks 4 and 7. `requestGateApproval(ctx, workflowId, stepId, description)` has the same four-argument signature in Tasks 7 and 9; the first draft omitted `workflowId`, which `WorkflowContext` does not carry. `cancelRunForRejectedApproval(approvalId, organizationId, userId, reason?)` is defined and consumed within Task 6.
