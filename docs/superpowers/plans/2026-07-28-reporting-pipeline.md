# Reporting Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `report_runs` the single list of produced reports — Generate shows the live ones, Archive shows archived ones — split templates into custom and system, and let a template be run once without scheduling it.

**Architecture:** One migration adds `archived_at`/`archived_by` to `report_runs` and backfills legacy `files`-based reports into it. The runs list query gains an `archived` filter; new endpoints archive, restore, delete a run, and run a template ad hoc by calling the *existing* `runScheduledReport()` orchestrator with a null schedule id. The frontend replaces two divergent tables with one `ReportRunsTable` rendered twice, and the wizard gains a `run-now` mode that drops its Schedule and Delivery steps.

**Tech Stack:** Node 22, TypeScript, Express, Sequelize (raw SQL), PostgreSQL, Jest; React 19, MUI 7, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-reporting-pipeline-design.md`

## Global Constraints

- Backend tests: `cd Servers && npx jest <path> --testPathIgnorePatterns=/tests/integration/`; full suite `npm run test:unit`. One suite (`advisor/evidenceAnalyzer/__tests__/calibration.test.ts`, "Cannot find module '../recency'") already fails on this branch and is unrelated — leave it.
- Frontend tests: `cd Clients && npx vitest run <path>`. Typecheck with **both** `npx tsc --noEmit -p tsconfig.app.json` and `npx tsc --noEmit -p tsconfig.test.json` — the root `tsconfig.json` has `files: []` and checks nothing, and the app project excludes test files.
- All SQL uses named replacements (`:name`). Never interpolate values into SQL.
- Every query is scoped by `organization_id`. This is a shared-schema multi-tenant database; an unscoped query is a data leak. An UPDATE or DELETE that matches zero rows returns 404 — never a silent 200.
- Run status vocabulary is fixed: `queued`, `running`, `success`, `partial_success`, `failed`. `partial_success` means the report generated but a delivery channel failed — it is downloadable and must not render as an error.
- Backend controller tests mock `../../utils/*` and `../../utils/statusCode.utils`; see `Servers/controllers/__tests__/reportRun.ctrl.test.ts` for the established shape. Query-module tests mock `../database/db`.
- Never `git add -A` or `git add .`. Commit only the paths listed in the task.
- Commit format: `type(scope): description`.

---

### Task 1: Migration — archive columns and legacy backfill

**Files:**
- Create: `Servers/database/migrations/20260728180000-report-runs-archive.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `report_runs.archived_at TIMESTAMPTZ NULL`, `report_runs.archived_by INTEGER NULL`, index `idx_report_runs_org_archived`, and one `report_runs` row per pre-existing legacy report file.

- [ ] **Step 1: Write the migration**

```javascript
"use strict";

/**
 * report_runs becomes the single list of produced reports.
 *
 * archived_at/archived_by carry the manual, reversible archive action. They are
 * orthogonal to `status`: a failed run can be archived without pretending it
 * succeeded.
 *
 * The backfill copies legacy `files`-based reports — the ones the old Generate
 * tab listed via files.source — into report_runs so they do not disappear from
 * a deployment that has them. It is idempotent: the NOT EXISTS guard means a
 * second run inserts nothing.
 */
const LEGACY_SOURCES = [
  "Project risks report",
  "Compliance tracker report",
  "Assessment tracker report",
  "Reference controls group",
  "Clauses and annexes report",
  "Vendors and risks report",
  "Models and risks report",
  "Training registry report",
  "Policy manager report",
  "All reports",
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES verifywise.users(id)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_report_runs_org_archived
        ON verifywise.report_runs(organization_id, archived_at)
    `);

    await queryInterface.sequelize.query(
      `INSERT INTO verifywise.report_runs
         (organization_id, triggered_by, triggered_by_user_id, status,
          file_id, output_filename, config_snapshot, created_at, completed_at, started_at)
       SELECT f.organization_id,
              'manual',
              f.uploaded_by,
              'success',
              f.id,
              f.filename,
              jsonb_build_object('legacy', true, 'source', f.source, 'project_id', f.project_id),
              f.uploaded_time,
              f.uploaded_time,
              f.uploaded_time
       FROM verifywise.files f
       WHERE f.source IN (:legacySources)
         AND f.organization_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM verifywise.report_runs r WHERE r.file_id = f.id
         )`,
      { replacements: { legacySources: LEGACY_SOURCES } },
    );
  },

  async down(queryInterface, Sequelize) {
    // Only the rows this migration created — identified by the marker it wrote.
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.report_runs WHERE config_snapshot->>'legacy' = 'true'
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.idx_report_runs_org_archived
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        DROP COLUMN IF EXISTS archived_at,
        DROP COLUMN IF EXISTS archived_by
    `);
  },
};
```

- [ ] **Step 2: Run the migration**

Run: `cd Servers && npm run migrate-db`
Expected: `20260728180000-report-runs-archive` applied, no errors.

- [ ] **Step 3: Verify the columns, the index and the backfill**

This repo configures Postgres through `Servers/.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`); there is no `DATABASE_URL`.

```bash
cd Servers && set -a && . ./.env && set +a && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\d verifywise.report_runs" -c "SELECT count(*) AS legacy_runs FROM verifywise.report_runs WHERE config_snapshot->>'legacy' = 'true';"
```

Expected: `archived_at` and `archived_by` present, `idx_report_runs_org_archived` listed. The dev database has zero legacy report files, so `legacy_runs` is `0` — that is a pass, not a failure.

- [ ] **Step 4: Verify the backfill is idempotent**

The dev database has **zero** legacy report files, so re-running the backfill there proves nothing about the `NOT EXISTS` guard. Verify it against real rows instead, inside a transaction that is rolled back so nothing is mutated:

```bash
cd Servers && set -a && . ./.env && set +a && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL'
BEGIN;
INSERT INTO verifywise.files (organization_id, filename, source, uploaded_by, uploaded_time, project_id)
VALUES (1, 'idempotency-probe.pdf', 'All reports', 2, NOW(), NULL);
-- first backfill pass
INSERT INTO verifywise.report_runs
  (organization_id, triggered_by, triggered_by_user_id, status, file_id, output_filename, config_snapshot, created_at, completed_at, started_at)
SELECT f.organization_id, 'manual', f.uploaded_by, 'success', f.id, f.filename,
       jsonb_build_object('legacy', true, 'source', f.source, 'project_id', f.project_id),
       f.uploaded_time, f.uploaded_time, f.uploaded_time
FROM verifywise.files f
WHERE f.source IN ('All reports') AND f.organization_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM verifywise.report_runs r WHERE r.file_id = f.id);
SELECT count(*) AS after_first FROM verifywise.report_runs WHERE config_snapshot->>'legacy' = 'true';
-- second pass, identical statement
INSERT INTO verifywise.report_runs
  (organization_id, triggered_by, triggered_by_user_id, status, file_id, output_filename, config_snapshot, created_at, completed_at, started_at)
SELECT f.organization_id, 'manual', f.uploaded_by, 'success', f.id, f.filename,
       jsonb_build_object('legacy', true, 'source', f.source, 'project_id', f.project_id),
       f.uploaded_time, f.uploaded_time, f.uploaded_time
FROM verifywise.files f
WHERE f.source IN ('All reports') AND f.organization_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM verifywise.report_runs r WHERE r.file_id = f.id);
SELECT count(*) AS after_second FROM verifywise.report_runs WHERE config_snapshot->>'legacy' = 'true';
ROLLBACK;
SQL
```

Expected: `after_first` = 1 and `after_second` = 1. The ROLLBACK leaves the database exactly as it was — confirm with the `legacy_runs` query from Step 3, which must still return 0.

- [ ] **Step 5: Commit**

```bash
git add Servers/database/migrations/20260728180000-report-runs-archive.js
git commit -m "feat(reporting): add archive columns to report runs and backfill legacy reports"
```

---

### Task 2: Backend — the archived filter

**Files:**
- Modify: `Servers/utils/reportRun.utils.ts` (`listRunsQuery`, line 42)
- Modify: `Servers/controllers/reportRun.ctrl.ts` (`listRuns`, line 23)
- Create: `Servers/utils/reportRun.utils.test.ts`
- Modify: `Servers/controllers/__tests__/reportRun.ctrl.test.ts`

**Interfaces:**
- Consumes: the columns from Task 1.
- Produces: `listRunsQuery(organization_id, filters)` where `filters` additionally accepts `archived?: boolean`; `GET /reporting/runs?archived=true|false`.

- [ ] **Step 1: Write the failing query test**

Create `Servers/utils/reportRun.utils.test.ts`:

```typescript
const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { listRunsQuery } from "./reportRun.utils";

describe("listRunsQuery archived filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // count query, then rows query
    mockQuery.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
  });

  it("returns only live runs when archived is false", async () => {
    await listRunsQuery(1, { archived: false });

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain("archived_at IS NULL");
    expect(countSql).not.toContain("archived_at IS NOT NULL");
  });

  it("returns only archived runs when archived is true", async () => {
    await listRunsQuery(1, { archived: true });

    expect(mockQuery.mock.calls[0][0]).toContain("archived_at IS NOT NULL");
  });

  it("does not filter on archived when the flag is omitted", async () => {
    await listRunsQuery(1, {});

    expect(mockQuery.mock.calls[0][0]).not.toContain("archived_at");
  });

  it("always scopes by organization", async () => {
    await listRunsQuery(7, { archived: false });

    expect(mockQuery.mock.calls[0][0]).toContain("organization_id = :organization_id");
    expect((mockQuery.mock.calls[0][1] as any).replacements.organization_id).toBe(7);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Servers && npx jest utils/reportRun.utils.test.ts --testPathIgnorePatterns=/tests/integration/`
Expected: FAIL — the SQL contains no `archived_at` predicate.

- [ ] **Step 3: Add the filter to the query**

In `Servers/utils/reportRun.utils.ts`, change the `listRunsQuery` signature to:

```typescript
export async function listRunsQuery(
  organization_id: number,
  filters: {
    scheduledReportId?: any;
    status?: any;
    archived?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ rows: any[]; total: number }> {
```

and add this after the existing `status` filter block, before `const whereSql = where.join(" AND ");`:

```typescript
  // Tri-state on purpose: true → archived only, false → live only, undefined →
  // both. An omitted flag must keep the pre-archive behaviour for any caller
  // that has not opted in.
  if (filters.archived === true) {
    where.push("archived_at IS NOT NULL");
  } else if (filters.archived === false) {
    where.push("archived_at IS NULL");
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Servers && npx jest utils/reportRun.utils.test.ts --testPathIgnorePatterns=/tests/integration/`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing controller test**

Append to `Servers/controllers/__tests__/reportRun.ctrl.test.ts`, inside the existing top-level `describe`:

```typescript
describe("listRuns archived query parameter", () => {
  const mockList = listRunsQuery as jest.MockedFunction<typeof listRunsQuery>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue({ rows: [], total: 0 });
  });

  it("passes archived=false through as the boolean false", async () => {
    const req = { ...createMockReq(), query: { archived: "false" } } as any;
    const res = createMockRes() as Response;

    await listRuns(req, res);

    expect(mockList).toHaveBeenCalledWith(5, expect.objectContaining({ archived: false }));
  });

  it("passes archived=true through as the boolean true", async () => {
    const req = { ...createMockReq(), query: { archived: "true" } } as any;
    const res = createMockRes() as Response;

    await listRuns(req, res);

    expect(mockList).toHaveBeenCalledWith(5, expect.objectContaining({ archived: true }));
  });

  it("omits archived entirely when the parameter is absent", async () => {
    const req = { ...createMockReq(), query: {} } as any;
    const res = createMockRes() as Response;

    await listRuns(req, res);

    expect(mockList.mock.calls[0][1].archived).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd Servers && npx jest controllers/__tests__/reportRun.ctrl.test.ts --testPathIgnorePatterns=/tests/integration/`
Expected: FAIL — `archived` is not forwarded.

- [ ] **Step 7: Forward the parameter**

In `Servers/controllers/reportRun.ctrl.ts`, inside `listRuns`, add above the `listRunsQuery` call:

```typescript
    // Query strings are strings: only the two literals map to booleans, and
    // anything else leaves the filter off rather than guessing.
    const archived =
      req.query.archived === "true" ? true : req.query.archived === "false" ? false : undefined;
```

and pass it:

```typescript
    const { rows, total } = await listRunsQuery(req.organizationId!, {
      scheduledReportId: req.query.scheduledReportId,
      status: req.query.status,
      archived,
      limit,
      offset,
    });
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd Servers && npx jest utils/reportRun.utils.test.ts controllers/__tests__/reportRun.ctrl.test.ts --testPathIgnorePatterns=/tests/integration/`
Expected: PASS, both suites.

- [ ] **Step 9: Commit**

```bash
git add Servers/utils/reportRun.utils.ts Servers/utils/reportRun.utils.test.ts Servers/controllers/reportRun.ctrl.ts Servers/controllers/__tests__/reportRun.ctrl.test.ts
git commit -m "feat(reporting): filter report runs by archived state"
```

---

### Task 3: Backend — archive, restore and delete a run

**Files:**
- Modify: `Servers/utils/reportRun.utils.ts` (append)
- Modify: `Servers/controllers/reportRun.ctrl.ts` (append)
- Modify: `Servers/routes/reportRun.route.ts`
- Modify: `Servers/utils/reportRun.utils.test.ts`
- Modify: `Servers/controllers/__tests__/reportRun.ctrl.test.ts`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces:
  - `setRunArchivedQuery(id: number, organization_id: number, archived: boolean, userId: number | null): Promise<any | null>` — returns the updated row, or `null` when nothing matched.
  - `deleteRunQuery(id: number, organization_id: number): Promise<boolean>` — deletes the run and its file, `false` when nothing matched.
  - `PATCH /reporting/runs/:id/archive`, `PATCH /reporting/runs/:id/restore`, `DELETE /reporting/runs/:id`.

- [ ] **Step 1: Write the failing query tests**

Append to `Servers/utils/reportRun.utils.test.ts`, extending the existing import to `import { listRunsQuery, setRunArchivedQuery, deleteRunQuery } from "./reportRun.utils";`:

```typescript
describe("setRunArchivedQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stamps archived_at and archived_by, scoped to the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, archived_at: "2026-07-28" }]);

    const row = await setRunArchivedQuery(1, 5, true, 3);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("archived_at = NOW()");
    expect(sql).toContain("archived_by = :userId");
    expect(sql).toContain("WHERE id = :id AND organization_id = :organization_id");
    expect((options as any).replacements).toMatchObject({ id: 1, organization_id: 5, userId: 3 });
    expect(row).toEqual({ id: 1, archived_at: "2026-07-28" });
  });

  it("clears both columns when restoring", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, archived_at: null }]);

    await setRunArchivedQuery(1, 5, false, 3);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("archived_at = NULL");
    expect(sql).toContain("archived_by = NULL");
  });

  it("returns null when the run belongs to another organization", async () => {
    mockQuery.mockResolvedValueOnce([]);

    expect(await setRunArchivedQuery(1, 999, true, 3)).toBeNull();
  });
});

describe("deleteRunQuery", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes the run's file and then the run, both org-scoped", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, file_id: 42 }]); // fetch
    mockQuery.mockResolvedValueOnce([]); // delete file
    mockQuery.mockResolvedValueOnce([]); // delete run

    expect(await deleteRunQuery(1, 5)).toBe(true);

    const fileSql = mockQuery.mock.calls[1][0] as string;
    expect(fileSql).toContain("DELETE FROM files");
    expect(fileSql).toContain("organization_id = :organization_id");
    const runSql = mockQuery.mock.calls[2][0] as string;
    expect(runSql).toContain("DELETE FROM report_runs");
    expect(runSql).toContain("organization_id = :organization_id");
  });

  it("deletes the run alone when it produced no file", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, file_id: null }]);
    mockQuery.mockResolvedValueOnce([]);

    expect(await deleteRunQuery(1, 5)).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("returns false when the run does not belong to the organization", async () => {
    mockQuery.mockResolvedValueOnce([]);

    expect(await deleteRunQuery(1, 999)).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd Servers && npx jest utils/reportRun.utils.test.ts --testPathIgnorePatterns=/tests/integration/`
Expected: FAIL — `setRunArchivedQuery` and `deleteRunQuery` are not exported.

- [ ] **Step 3: Implement the queries**

Append to `Servers/utils/reportRun.utils.ts`:

```typescript
/**
 * Archive or restore one run. Returns the updated row, or null when the id does
 * not belong to this organization — the caller turns that into a 404 rather
 * than reporting a success that never happened.
 */
export async function setRunArchivedQuery(
  id: number,
  organization_id: number,
  archived: boolean,
  userId: number | null,
): Promise<any | null> {
  const setClause = archived
    ? "archived_at = NOW(), archived_by = :userId"
    : "archived_at = NULL, archived_by = NULL";

  const rows: any[] = await sequelize.query(
    `UPDATE report_runs SET ${setClause}, updated_at = NOW()
     WHERE id = :id AND organization_id = :organization_id
     RETURNING *`,
    { replacements: { id, organization_id, userId }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/**
 * Permanently delete a run and the file it produced — the file is the report,
 * which is what DELETE /reporting/:id meant before runs became the list. A run
 * with no file_id (failed, or still running) deletes the row alone.
 */
export async function deleteRunQuery(id: number, organization_id: number): Promise<boolean> {
  const rows: any[] = await sequelize.query(
    `SELECT id, file_id FROM report_runs WHERE id = :id AND organization_id = :organization_id`,
    { replacements: { id, organization_id }, type: QueryTypes.SELECT },
  );
  const run = rows[0];
  if (!run) return false;

  if (run.file_id) {
    await sequelize.query(
      `DELETE FROM files WHERE id = :file_id AND organization_id = :organization_id`,
      { replacements: { file_id: run.file_id, organization_id }, type: QueryTypes.DELETE },
    );
  }

  await sequelize.query(
    `DELETE FROM report_runs WHERE id = :id AND organization_id = :organization_id`,
    { replacements: { id, organization_id }, type: QueryTypes.DELETE },
  );
  return true;
}
```

Note the `:userId` replacement is supplied on both branches even though the restore branch does not reference it — Sequelize tolerates unused replacements, and passing it unconditionally keeps the call site simple.

- [ ] **Step 4: Run to verify they pass**

Run: `cd Servers && npx jest utils/reportRun.utils.test.ts --testPathIgnorePatterns=/tests/integration/`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write the failing controller tests**

Append to `Servers/controllers/__tests__/reportRun.ctrl.test.ts`. Extend the `jest.mock("../../utils/reportRun.utils", ...)` factory at the top of the file to also return `setRunArchivedQuery: jest.fn()` and `deleteRunQuery: jest.fn()`, extend the import to `import { archiveRun, restoreRun, deleteRun, listRuns, getRun, downloadRun, getRunAnalyses } from "../reportRun.ctrl";`, and add:

```typescript
describe("archiveRun / restoreRun / deleteRun", () => {
  const mockSetArchived = setRunArchivedQuery as jest.MockedFunction<typeof setRunArchivedQuery>;
  const mockDelete = deleteRunQuery as jest.MockedFunction<typeof deleteRunQuery>;

  beforeEach(() => jest.clearAllMocks());

  it("archives with the authed organization and user, never the request body", async () => {
    mockSetArchived.mockResolvedValue({ id: 1, archived_at: "2026-07-28" });
    const req = { params: { id: "1" }, body: { organizationId: 999 }, organizationId: 5, userId: 3 } as any;
    const res = createMockRes() as Response;

    await archiveRun(req, res);

    expect(mockSetArchived).toHaveBeenCalledWith(1, 5, true, 3);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("restores with archived false", async () => {
    mockSetArchived.mockResolvedValue({ id: 1, archived_at: null });
    const res = createMockRes() as Response;

    await restoreRun(createMockReq({ id: "1" }) as Request, res);

    expect(mockSetArchived).toHaveBeenCalledWith(1, 5, false, 3);
  });

  it("404s when the run belongs to another organization", async () => {
    mockSetArchived.mockResolvedValue(null);
    const res = createMockRes() as Response;

    await archiveRun(createMockReq({ id: "1" }) as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("404s on delete when nothing matched", async () => {
    mockDelete.mockResolvedValue(false);
    const res = createMockRes() as Response;

    await deleteRun(createMockReq({ id: "1" }) as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("deletes org-scoped and returns 200", async () => {
    mockDelete.mockResolvedValue(true);
    const res = createMockRes() as Response;

    await deleteRun(createMockReq({ id: "1" }) as Request, res);

    expect(mockDelete).toHaveBeenCalledWith(1, 5);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `cd Servers && npx jest controllers/__tests__/reportRun.ctrl.test.ts --testPathIgnorePatterns=/tests/integration/`
Expected: FAIL — `archiveRun`, `restoreRun` and `deleteRun` are not exported.

- [ ] **Step 7: Implement the handlers**

Append to `Servers/controllers/reportRun.ctrl.ts`, extending its import from `../utils/reportRun.utils` to include `setRunArchivedQuery` and `deleteRunQuery`:

```typescript
async function setArchived(req: Request, res: Response, archived: boolean): Promise<any> {
  try {
    const run = await setRunArchivedQuery(
      Number(req.params.id),
      req.organizationId!,
      archived,
      req.userId ?? null,
    );
    if (!run) return res.status(404).json(STATUS_CODE[404]("not found"));
    return res.status(200).json(STATUS_CODE[200](run));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function archiveRun(req: Request, res: Response): Promise<any> {
  return setArchived(req, res, true);
}

export async function restoreRun(req: Request, res: Response): Promise<any> {
  return setArchived(req, res, false);
}

export async function deleteRun(req: Request, res: Response): Promise<any> {
  try {
    const deleted = await deleteRunQuery(Number(req.params.id), req.organizationId!);
    if (!deleted) return res.status(404).json(STATUS_CODE[404]("not found"));
    return res.status(200).json(STATUS_CODE[200]({ id: Number(req.params.id) }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}
```

- [ ] **Step 8: Register the routes**

In `Servers/routes/reportRun.route.ts`, add the `authorize` import used elsewhere in the codebase (`import authorize from "../middleware/auth.middleware";` — copy the exact import line from `Servers/routes/reportTemplate.route.ts`) and add below the existing routes:

```typescript
router.patch("/:id/archive", authenticateJWT, authorize(["Admin", "Editor"]), archiveRun);
router.patch("/:id/restore", authenticateJWT, authorize(["Admin", "Editor"]), restoreRun);
router.delete("/:id", authenticateJWT, authorize(["Admin", "Editor"]), deleteRun);
```

- [ ] **Step 9: Run the tests and the typecheck**

Run: `cd Servers && npx jest utils/reportRun.utils.test.ts controllers/__tests__/reportRun.ctrl.test.ts --testPathIgnorePatterns=/tests/integration/ && npx tsc --noEmit`
Expected: PASS, both suites; tsc clean.

- [ ] **Step 10: Extend the tenant-isolation suite**

`Servers/tests/integration/tenant-isolation/report-runs.isolation.test.ts` already covers list/get/download/analyses against a real two-tenant database. Add the three new routes to its `ROUTES` map:

```typescript
  archive: (id: number) => `/api/reporting/runs/${id}/archive`,
  restore: (id: number) => `/api/reporting/runs/${id}/restore`,
  remove: (id: number) => `/api/reporting/runs/${id}`,
```

and add a describe block following the file's existing pattern — seed a run in the owner tenant with its `seedRun(ownerCtx)` helper, then assert from the *other* tenant's context that:

- `PATCH ROUTES.archive(id)` returns 404 and the row's `archived_at` is still NULL when read back with SQL,
- `PATCH ROUTES.restore(id)` returns 404,
- `DELETE ROUTES.remove(id)` returns 404 and `SELECT count(*) FROM report_runs WHERE id = :id` is still 1.

The last assertion is the one that matters: a cross-tenant delete that returns 404 but still removed the row would pass a status-code-only test.

- [ ] **Step 11: Run the isolation suite**

Run: `cd Servers && npm run test:integration -- --testPathPatterns=report-runs.isolation`
Expected: PASS. This suite needs the database from `Servers/.env`; if it cannot connect, say so rather than skipping silently.

- [ ] **Step 12: Commit**

```bash
git add Servers/utils/reportRun.utils.ts Servers/utils/reportRun.utils.test.ts Servers/controllers/reportRun.ctrl.ts Servers/controllers/__tests__/reportRun.ctrl.test.ts Servers/routes/reportRun.route.ts Servers/tests/integration/tenant-isolation/report-runs.isolation.test.ts
git commit -m "feat(reporting): archive, restore and delete report runs"
```

---

### Task 4: Backend — run a template now

**Files:**
- Modify: `Servers/controllers/reportTemplate.ctrl.ts` (append)
- Modify: `Servers/routes/reportTemplate.route.ts`
- Create: `Servers/controllers/__tests__/reportTemplateRun.ctrl.test.ts`

**Interfaces:**
- Consumes: `runScheduledReport(sched, opts)` from `Servers/services/reporting/reportRunOrchestrator.ts`; `getVersionByIdQuery(version_id, organization_id)` and `getTemplateQuery(id, organization_id)` from `Servers/utils/reportTemplate.utils.ts`.
- Produces: `POST /reporting/templates/:id/run`.

- [ ] **Step 1: Write the failing test**

Create `Servers/controllers/__tests__/reportTemplateRun.ctrl.test.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../utils/reportTemplate.utils", () => ({
  getTemplateQuery: jest.fn(),
  getVersionByIdQuery: jest.fn(),
}));
jest.mock("../../services/reporting/reportRunOrchestrator", () => ({
  runScheduledReport: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    202: (d: any) => ({ message: "Accepted", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import { runTemplateNow } from "../reportTemplate.ctrl";
import { getTemplateQuery, getVersionByIdQuery } from "../../utils/reportTemplate.utils";
import { runScheduledReport } from "../../services/reporting/reportRunOrchestrator";

const mockTemplate = getTemplateQuery as jest.MockedFunction<any>;
const mockVersion = getVersionByIdQuery as jest.MockedFunction<any>;
const mockRun = runScheduledReport as jest.MockedFunction<any>;

function createMockRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const body = {
  templateVersionId: 9,
  name: "Q3 risk review",
  scope: "project",
  projectId: 4,
  sectionsConfig: { sections: [{ reportSectionKey: "risks", defaultEnabled: true }] },
  aiBlocksConfig: { executiveSummary: true },
  format: "pdf",
};

describe("runTemplateNow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTemplate.mockResolvedValue({ id: 2, name: "Risk template", organization_id: null });
    mockVersion.mockResolvedValue({ id: 9, template_id: 2 });
    mockRun.mockResolvedValue(undefined);
  });

  it("runs the orchestrator with no schedule id and storage forced on", async () => {
    const req = { params: { id: "2" }, body, organizationId: 5, userId: 3 } as any;
    const res = createMockRes() as Response;

    await runTemplateNow(req, res);

    const [sched, opts] = mockRun.mock.calls[0];
    expect(sched.id).toBeNull();
    expect(sched.organization_id).toBe(5);
    expect(sched.template_id).toBe(2);
    expect(sched.template_version_id).toBe(9);
    expect(sched.delivery_config).toEqual({ saveToStorage: true });
    expect(sched.sections_config).toEqual(body.sectionsConfig);
    expect(sched.project_id).toBe(4);
    expect(opts).toEqual({ triggeredBy: "manual", userId: 3 });
  });

  it("sends no project id for an organization-scoped run", async () => {
    const req = {
      params: { id: "2" },
      body: { ...body, scope: "organization", projectId: 4 },
      organizationId: 5,
      userId: 3,
    } as any;

    await runTemplateNow(req, createMockRes() as Response);

    expect(mockRun.mock.calls[0][0].project_id).toBeNull();
  });

  it("404s when the template does not belong to the organization", async () => {
    mockTemplate.mockResolvedValue(null);
    const res = createMockRes() as Response;

    await runTemplateNow({ params: { id: "2" }, body, organizationId: 5, userId: 3 } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("404s when the version belongs to a different template", async () => {
    mockVersion.mockResolvedValue({ id: 9, template_id: 77 });
    const res = createMockRes() as Response;

    await runTemplateNow({ params: { id: "2" }, body, organizationId: 5, userId: 3 } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Servers && npx jest controllers/__tests__/reportTemplateRun.ctrl.test.ts --testPathIgnorePatterns=/tests/integration/`
Expected: FAIL — `runTemplateNow` is not exported.

- [ ] **Step 3: Implement the handler**

Append to `Servers/controllers/reportTemplate.ctrl.ts`, adding `runScheduledReport` to its imports from `../services/reporting/reportRunOrchestrator` and `getVersionByIdQuery` / `getTemplateQuery` to its imports from `../utils/reportTemplate.utils`:

```typescript
/**
 * POST /reporting/templates/:id/run — produce one report from a template
 * without creating a schedule.
 *
 * Deliberately calls the same orchestrator a scheduled run uses, with a
 * schedule-shaped object whose id is null (report_runs.scheduled_report_id is
 * nullable). Generation, delivery, analysis and status handling therefore have
 * exactly one implementation.
 */
export async function runTemplateNow(req: Request, res: Response): Promise<any> {
  try {
    const templateId = Number(req.params.id);
    const organizationId = req.organizationId!;
    const userId = req.userId ?? null;

    const template = await getTemplateQuery(templateId, organizationId);
    if (!template) return res.status(404).json(STATUS_CODE[404]("template not found"));

    const version = await getVersionByIdQuery(Number(req.body.templateVersionId), organizationId);
    if (!version || Number(version.template_id) !== templateId) {
      return res.status(404).json(STATUS_CODE[404]("template version not found"));
    }

    const isProjectScope = req.body.scope === "project";
    const sched = {
      id: null,
      organization_id: organizationId,
      template_id: templateId,
      template_version_id: version.id,
      name: req.body.name ?? template.name,
      project_id: isProjectScope ? (req.body.projectId ?? null) : null,
      framework_id: req.body.frameworkId ?? null,
      project_framework_id: req.body.projectFrameworkId ?? null,
      sections_config: req.body.sectionsConfig ?? null,
      ai_blocks_config: req.body.aiBlocksConfig ?? null,
      format: req.body.format ?? "pdf",
      // Storage is what gives the run a file_id, and a run without one has
      // nothing to download. Run now puts a report in the list; it is not a
      // delivery mechanism.
      delivery_config: { saveToStorage: true },
      owner_id: userId,
      created_by: userId,
      llm_key_id: template.llm_key_id ?? null,
    };

    await runScheduledReport(sched, { triggeredBy: "manual", userId: userId ?? undefined });

    return res.status(200).json(STATUS_CODE[200]({ started: true }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}
```

- [ ] **Step 4: Register the route**

In `Servers/routes/reportTemplate.route.ts`, add `runTemplateNow` to the controller import and add:

```typescript
router.post("/:id/run", authenticateJWT, authorize(["Admin", "Editor"]), runTemplateNow);
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `cd Servers && npx jest controllers/__tests__/reportTemplateRun.ctrl.test.ts --testPathIgnorePatterns=/tests/integration/ && npx tsc --noEmit`
Expected: PASS, 4 tests; tsc clean.

- [ ] **Step 6: Run the whole backend suite**

Run: `cd Servers && npm run test:unit`
Expected: no new failures beyond the pre-existing `advisor/evidenceAnalyzer` suite.

- [ ] **Step 7: Commit**

```bash
git add Servers/controllers/reportTemplate.ctrl.ts Servers/controllers/__tests__/reportTemplateRun.ctrl.test.ts Servers/routes/reportTemplate.route.ts
git commit -m "feat(reporting): run a template once without scheduling it"
```

---

### Task 5: Frontend — repository, hooks and the shared runs table

**Files:**
- Modify: `Clients/src/application/repository/reporting.repository.ts`
- Modify: `Clients/src/application/hooks/useReporting.ts`
- Modify: `Clients/src/domain/interfaces/i.reporting.ts`
- Create: `Clients/src/presentation/pages/Reporting/ReportRunsTable.tsx`
- Create: `Clients/src/presentation/pages/Reporting/__tests__/ReportRunsTable.test.tsx`

**Interfaces:**
- Consumes: `GET /reporting/runs?archived=`, `PATCH /reporting/runs/:id/archive`, `PATCH /reporting/runs/:id/restore`, `DELETE /reporting/runs/:id` from Tasks 2-3.
- Produces:
  - `getRuns(params?: { scheduledReportId?, archived?, limit?, offset? })`
  - `archiveRun(id)`, `restoreRun(id)`, `deleteRun(id)` repository functions
  - `useArchiveRun()`, `useRestoreRun()`, `useDeleteRun()` mutation hooks
  - `<ReportRunsTable variant="live" | "archived" />` — a self-contained tab body: fetches, paginates, renders rows and actions.
  - `ReportRun` gains `archived_at: string | null` and `template_id: number | null`.

- [ ] **Step 1: Extend the type and the repository**

In `Clients/src/domain/interfaces/i.reporting.ts`, add to `ReportRun`:

```typescript
  archived_at: string | null;
  template_id: number | null;
```

In `Clients/src/application/repository/reporting.repository.ts`, change `getRuns` to accept and forward `archived`:

```typescript
export async function getRuns(params?: {
  scheduledReportId?: number;
  archived?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ReportRunPage> {
  const qs = new URLSearchParams();
  if (params?.scheduledReportId) qs.set("scheduledReportId", String(params.scheduledReportId));
  // Explicit check: `false` is meaningful here and must still be sent.
  if (params?.archived !== undefined) qs.set("archived", String(params.archived));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return extract(await apiServices.get(`/reporting/runs${suffix}`));
}

export async function archiveRun(id: number) {
  return extract(await apiServices.patch(`/reporting/runs/${id}/archive`, {}));
}

export async function restoreRun(id: number) {
  return extract(await apiServices.patch(`/reporting/runs/${id}/restore`, {}));
}

export async function deleteRun(id: number) {
  return extract(await apiServices.delete(`/reporting/runs/${id}`));
}
```

- [ ] **Step 2: Add the mutation hooks**

In `Clients/src/application/hooks/useReporting.ts`, add `archived?: boolean;` to the `RunPageParams` type and append:

```typescript
// All three invalidate the whole runs key: an archive moves a row between two
// cached lists, so refreshing only one leaves the other stale.
const useRunMutation = (fn: (id: number) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "runs"] }),
  });
};

export const useArchiveRun = () => useRunMutation(repo.archiveRun);
export const useRestoreRun = () => useRunMutation(repo.restoreRun);
export const useDeleteRun = () => useRunMutation(repo.deleteRun);
```

- [ ] **Step 3: Write the failing table test**

Create `Clients/src/presentation/pages/Reporting/__tests__/ReportRunsTable.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockRunsPage = vi.fn();
const mockArchive = vi.fn();
const mockRestore = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../../../application/hooks/useReporting", () => ({
  useReportRunsPage: (...args: any[]) => mockRunsPage(...args),
  useArchiveRun: () => ({ mutate: mockArchive, isPending: false }),
  useRestoreRun: () => ({ mutate: mockRestore, isPending: false }),
  useDeleteRun: () => ({ mutate: mockDelete, isPending: false }),
  useRunAnalyses: () => ({ data: [], isLoading: false }),
}));

import ReportRunsTable from "../ReportRunsTable";

const run = (over: Record<string, unknown> = {}) => ({
  id: 1,
  organization_id: 1,
  status: "success",
  triggered_by: "manual",
  file_id: 10,
  output_filename: "Q3 risk review.pdf",
  output_mime_type: "application/pdf",
  error_message: null,
  archived_at: null,
  template_id: 2,
  created_at: "2026-07-28T10:00:00Z",
  completed_at: "2026-07-28T10:01:00Z",
  ...over,
});

describe("ReportRunsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunsPage.mockReturnValue({ data: { rows: [run()], total: 1 }, isLoading: false });
  });

  it("asks for live runs in the live variant", () => {
    renderWithProviders(<ReportRunsTable variant="live" />);
    expect(mockRunsPage).toHaveBeenCalledWith(expect.objectContaining({ archived: false }));
  });

  it("asks for archived runs in the archived variant", () => {
    renderWithProviders(<ReportRunsTable variant="archived" />);
    expect(mockRunsPage).toHaveBeenCalledWith(expect.objectContaining({ archived: true }));
  });

  it("shows a failed run with its status instead of hiding it", () => {
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ status: "failed", file_id: null, error_message: "boom" })], total: 1 },
      isLoading: false,
    });

    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("treats partial_success as downloadable, not an error", () => {
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ status: "partial_success" })], total: 1 },
      isLoading: false,
    });

    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(screen.getByText("Partial success")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeEnabled();
  });

  it("archives from the live variant", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getByRole("button", { name: /archive/i }));

    expect(mockArchive).toHaveBeenCalledWith(1);
  });

  it("restores from the archived variant", async () => {
    const user = userEvent.setup();
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ archived_at: "2026-07-28T11:00:00Z" })], total: 1 },
      isLoading: false,
    });
    renderWithProviders(<ReportRunsTable variant="archived" />);

    await user.click(screen.getByRole("button", { name: /restore/i }));

    expect(mockRestore).toHaveBeenCalledWith(1);
  });

  it("shows the empty state per variant", () => {
    mockRunsPage.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });

    renderWithProviders(<ReportRunsTable variant="archived" />);

    expect(screen.getByText(/no archived reports/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/ReportRunsTable.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 5: Implement the table**

Create `Clients/src/presentation/pages/Reporting/ReportRunsTable.tsx`:

```tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * One table for both report lists. The Generate tab renders it with
 * variant="live" (archived_at IS NULL), the Archive tab with variant="archived".
 * Keeping them one component is what stops the two lists drifting apart the way
 * the files-based list and the runs list did.
 */
import { useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Tooltip,
} from "@mui/material";
import { Archive, ArchiveRestore, Download, Trash2, FileText } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import EmptyState from "../../components/States/Empty";
import {
  useReportRunsPage,
  useArchiveRun,
  useRestoreRun,
  useDeleteRun,
} from "../../../application/hooks/useReporting";
import { downloadReportRun } from "../../../application/repository/reporting.repository";

const ROWS_PER_PAGE_DEFAULT = 10;

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  partial_success: "Partial success",
  failed: "Failed",
};

// partial_success is a success with a delivery caveat — the file exists and is
// downloadable, so it must not read as an error.
const STATUS_COLOR: Record<string, "default" | "info" | "success" | "warning" | "error"> = {
  queued: "default",
  running: "info",
  success: "success",
  partial_success: "warning",
  failed: "error",
};

export default function ReportRunsTable({ variant }: { variant: "live" | "archived" }) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_DEFAULT);

  const { data, isLoading } = useReportRunsPage({
    archived: variant === "archived",
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  });

  const archive = useArchiveRun();
  const restore = useRestoreRun();
  const remove = useDeleteRun();

  const rows: any[] = data?.rows ?? [];
  // Gate on the server total, not the page length: an empty page 2 means "you
  // paged past the end", not "there is nothing here".
  const total = data?.total ?? rows.length;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (!total) {
    return (
      <EmptyState
        icon={variant === "archived" ? Archive : FileText}
        message={
          variant === "archived"
            ? "No archived reports yet."
            : "No reports yet. Generate one, or run a template."
        }
        showBorder
      />
    );
  }

  return (
    <>
      <TableContainer sx={singleTheme.tableStyles.primary.frame}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Report</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Triggered by</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.output_filename ?? "—"}</TableCell>
                <TableCell>
                  <Tooltip title={r.error_message ?? ""} disableHoverListener={!r.error_message}>
                    <Chip
                      size="small"
                      label={STATUS_LABEL[r.status] ?? r.status}
                      color={STATUS_COLOR[r.status] ?? "default"}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell>{r.triggered_by}</TableCell>
                <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Download">
                    <span>
                      <IconButton
                        aria-label="Download"
                        size="small"
                        disabled={!r.file_id}
                        onClick={() => downloadReportRun(r.id)}
                      >
                        <Download size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {variant === "live" ? (
                    <Tooltip title="Archive">
                      <IconButton
                        aria-label="Archive"
                        size="small"
                        onClick={() => archive.mutate(r.id)}
                      >
                        <Archive size={16} />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Restore">
                      <IconButton
                        aria-label="Restore"
                        size="small"
                        onClick={() => restore.mutate(r.id)}
                      >
                        <ArchiveRestore size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete">
                    <IconButton
                      aria-label="Delete"
                      size="small"
                      onClick={() => remove.mutate(r.id)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
      />
    </>
  );
}
```

Before running the test, confirm the two imported helpers exist at those paths and match the names used here: `EmptyState` (`Clients/src/presentation/components/States/Empty`) and `singleTheme` (`Clients/src/presentation/themes/v1SingleTheme`) — `ArchiveTab.tsx` imports both, so copy its exact import lines if they differ.

- [ ] **Step 5b: Port the AI-analyses drawer into the table**

`ArchiveTab.tsx` today owns a "View analyses" action and a right-hand `Drawer` that renders `useRunAnalyses(selectedRunId)` (`ArchiveTab.tsx:54-63,152-200`). Task 6 replaces that file, so the drawer must live here or the feature is deleted — and the spec requires it in **both** tabs.

Move it verbatim into `ReportRunsTable`: the `const [selectedRunId, setSelectedRunId] = useState<number | null>(null)` state, the `useRunAnalyses(selectedRunId ?? undefined)` call, the "View analyses" action button in the actions cell, and the `Drawer` block with its loading and empty states. Keep its existing comments — they explain that `null` both closes the drawer and disables the query, and that the action is always offered because whether a run produced analyses is only known after fetching.

Then add to the test file:

```tsx
  it("opens the analyses drawer for the run whose action was clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getByRole("button", { name: /view analyses/i }));

    expect(screen.getByText(/ai analyses/i)).toBeInTheDocument();
  });
```

and extend the `useReporting` mock in that file so `useRunAnalyses` records its argument:

```tsx
const mockAnalyses = vi.fn();
// in the factory:
  useRunAnalyses: (...args: any[]) => {
    mockAnalyses(...args);
    return { data: [], isLoading: false };
  },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/ReportRunsTable.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 7: Typecheck**

Run: `cd Clients && npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.test.json`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add Clients/src/application/repository/reporting.repository.ts Clients/src/application/hooks/useReporting.ts Clients/src/domain/interfaces/i.reporting.ts Clients/src/presentation/pages/Reporting/ReportRunsTable.tsx Clients/src/presentation/pages/Reporting/__tests__/ReportRunsTable.test.tsx
git commit -m "feat(reporting): add one runs table for the live and archived lists"
```

---

### Task 6: Frontend — wire the Generate and Archive tabs

**Files:**
- Modify: `Clients/src/presentation/pages/Reporting/index.tsx`
- Modify: `Clients/src/presentation/pages/Reporting/ArchiveTab.tsx`

**Interfaces:**
- Consumes: `<ReportRunsTable variant="live" | "archived" />` from Task 5.
- Produces: the Generate tab body renders `ReportRunsTable variant="live"`; the Archive tab renders `variant="archived"`.

- [ ] **Step 1: Point the Generate tab at the runs table**

In `Clients/src/presentation/pages/Reporting/index.tsx`, replace the `<ReportLists ... />` block inside `{activeTab === 0 && ...}` with:

```tsx
      {activeTab === 0 && (
        <div data-joyride-id="reports-list">
          <Box sx={{ display: "flex", justifyContent: "flex-end", my: 2 }}>
            <div data-joyride-id="generate-report-button">
              <GenerateReport onReportGenerated={handleReportGenerated} />
            </div>
          </Box>
          <ReportRunsTable key={refreshKey} variant="live" />
        </div>
      )}
```

Add `import ReportRunsTable from "./ReportRunsTable";` and remove the now-unused `import ReportLists from "./Reports";`. Keep `refreshKey` and `handleReportGenerated`: passing the key remounts the table after a manual generation so the new run appears without a page reload.

- [ ] **Step 2: Point the Archive tab at the same table**

Replace the whole body of `Clients/src/presentation/pages/Reporting/ArchiveTab.tsx` with:

```tsx
/**
 * Archive tab — reports the user archived. The run history it used to show now
 * lives in the Generate tab, which lists non-archived runs.
 */
import ReportRunsTable from "./ReportRunsTable";

export default function ArchiveTab() {
  return <ReportRunsTable variant="archived" />;
}
```

- [ ] **Step 3: Verify no other module imports the removed list**

Run: `cd Clients && grep -rn "from \"./Reports\"\|from \"../Reports\"" src/presentation/pages/Reporting`
Expected: no matches. If any remain, leave `Reports/index.tsx` in place and only stop importing it from `index.tsx` — do not delete a file another module still uses.

- [ ] **Step 4: Rehome the existing ArchiveTab tests**

`Clients/src/presentation/pages/Reporting/__tests__/ArchiveTab.test.tsx` already exists with five tests: paginated-envelope rendering, offset on page change, loading and rendering a run's analyses, the analyses empty state, and the no-runs empty state. They were written against the component you just replaced, so they will fail.

Do not delete them. Every one of those behaviours now lives in `ReportRunsTable`, which Task 5 covers — so for each of the five, either confirm Task 5's test file already asserts the same behaviour (pagination, empty state, analyses drawer) or move the assertion there. Then reduce `ArchiveTab.test.tsx` to a single test that the tab renders the table in archived mode:

```tsx
vi.mock("../ReportRunsTable", () => ({
  default: ({ variant }: { variant: string }) => <div data-testid="runs-table">{variant}</div>,
}));

it("renders the runs table in archived mode", () => {
  renderWithProviders(<ArchiveTab />);
  expect(screen.getByTestId("runs-table")).toHaveTextContent("archived");
});
```

- [ ] **Step 5: Check the page-level test**

`__tests__/Reporting.test.tsx` renders the page and its tabs. Run it and, if it asserts on the old Generate-tab list, update those assertions to the new table. Do not weaken a test to make it pass — if it checked that the Generate tab shows reports, it should still check that, against the new component.

- [ ] **Step 6: Run the reporting frontend tests and typecheck**

Run: `cd Clients && npx vitest run src/presentation/pages/Reporting && npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.test.json`
Expected: PASS; both typechecks clean.

- [ ] **Step 7: Commit**

```bash
git add Clients/src/presentation/pages/Reporting/index.tsx Clients/src/presentation/pages/Reporting/ArchiveTab.tsx Clients/src/presentation/pages/Reporting/__tests__/ArchiveTab.test.tsx Clients/src/presentation/pages/Reporting/__tests__/Reporting.test.tsx Clients/src/presentation/pages/Reporting/__tests__/ReportRunsTable.test.tsx
git commit -m "feat(reporting): show live runs in Generate and archived ones in Archive"
```

---

### Task 7: Frontend — templates split and Run now

**Files:**
- Modify: `Clients/src/presentation/pages/Reporting/TemplatesTab.tsx`
- Modify: `Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx`
- Modify: `Clients/src/presentation/pages/Reporting/index.tsx`
- Modify: `Clients/src/application/repository/reporting.repository.ts`
- Modify: `Clients/src/application/hooks/useReporting.ts`
- Modify: `Clients/src/presentation/pages/Reporting/__tests__/TemplatesTab.test.tsx` (exists — 5 tests)
- Modify: `Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx` (exists)

**Already implemented — do not rebuild:** `TemplatesTab.tsx:126,151` already branches on `t.is_system_template` to withhold Edit and Archive from system templates, and `TemplatesTab.test.tsx` already covers it ("offers no edit or archive on a system template", "offers edit and archive on a custom template"). This task adds the two labelled sections, Duplicate, and Run now. Keep the existing behaviour and its tests intact.

**Interfaces:**
- Consumes: `POST /reporting/templates/:id/run` from Task 4; `useTemplates()`, `useCreateTemplate()` from `useReporting`.
- Produces: `runTemplateNow(id, body)` repository function; `useRunTemplateNow()` hook; `TemplatesTab` calling `onUse(templateId, mode)`; `ConfigureReportWizard` accepting `mode: "schedule" | "run-now"`.

- [ ] **Step 1: Add the repository call and hook**

In `Clients/src/application/repository/reporting.repository.ts`:

```typescript
export async function runTemplateNow(id: number, body: Record<string, unknown>) {
  return extract(await apiServices.post(`/reporting/templates/${id}/run`, body));
}
```

In `Clients/src/application/hooks/useReporting.ts`:

```typescript
export const useRunTemplateNow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      repo.runTemplateNow(id, body),
    // The new run belongs in the Generate list, so refresh runs — not schedules.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "runs"] }),
  });
};
```

- [ ] **Step 2: Add the failing tests to the existing TemplatesTab suite**

Open `Clients/src/presentation/pages/Reporting/__tests__/TemplatesTab.test.tsx`. It already mocks `useTemplates`, `useUpdateTemplate` and `useArchiveTemplate` and has five passing tests — read its existing mock factory and fixture shape and reuse them rather than writing new ones. Its fixtures key on `is_system_template`; keep that.

Add `useCreateTemplate: () => ({ mutate: mockCreate, isPending: false })` to the existing mock factory (with `const mockCreate = vi.fn();` beside the other mock consts), make sure the fixture list contains one template with `is_system_template: false` and one with `is_system_template: true`, and append these tests to the existing `describe`:

```tsx
  it("splits templates into my templates and system templates", () => {
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const mine = screen.getByRole("region", { name: /my templates/i });
    expect(within(mine).getByText("My quarterly review")).toBeInTheDocument();

    const system = screen.getByRole("region", { name: /system templates/i });
    expect(within(system).getByText("EU AI Act pack")).toBeInTheDocument();
  });

  it("offers no edit or archive on a system template", () => {
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    expect(within(system).queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(within(system).queryByRole("button", { name: /^archive$/i })).not.toBeInTheDocument();
    expect(within(system).getByRole("button", { name: /duplicate/i })).toBeInTheDocument();
  });

  it("starts the schedule flow from Use template", async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={onUse} />);

    const mine = screen.getByRole("region", { name: /my templates/i });
    await user.click(within(mine).getByRole("button", { name: /use template/i }));

    expect(onUse).toHaveBeenCalledWith(1, "schedule");
  });

  it("starts the run-now flow from Run now", async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={onUse} />);

    const mine = screen.getByRole("region", { name: /my templates/i });
    await user.click(within(mine).getByRole("button", { name: /run now/i }));

    expect(onUse).toHaveBeenCalledWith(1, "run-now");
  });

  it("duplicates a system template as a copy owned by the org", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplatesTab onUse={vi.fn()} />);

    const system = screen.getByRole("region", { name: /system templates/i });
    await user.click(within(system).getByRole("button", { name: /duplicate/i }));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "EU AI Act pack (copy)" }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/TemplatesTab.test.tsx`
Expected: FAIL — there are no labelled regions and `onUse` takes one argument.

- [ ] **Step 4: Split the templates list**

In `TemplatesTab.tsx`:

1. Change the prop type to `{ onUse: (templateId: number, mode: "schedule" | "run-now") => void }`.
2. Partition on the flag the file already branches on at lines 126 and 151 — introducing a second notion of "system" (an `organization_id` check) would be a bug waiting to happen the first time the two disagree:

```tsx
  // is_system_template marks the shared, cross-organization templates. Editing
  // or archiving one would change it for every organization, so those actions
  // stay withheld and Duplicate is offered instead.
  const myTemplates = templates.filter((t: any) => !t.is_system_template);
  const systemTemplates = templates.filter((t: any) => t.is_system_template);
```

3. Wrap the existing card list in two labelled regions. Keep the card markup that is already in the file — only the surrounding structure and the per-card action buttons change:

```tsx
      <Box component="section" aria-label="My templates" sx={{ mb: 4 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 15, mb: 1 }}>My templates</Typography>
        {myTemplates.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            You haven&apos;t created any templates yet.
          </Typography>
        ) : (
          myTemplates.map((t: any) => renderCard(t, { editable: true }))
        )}
      </Box>

      <Box component="section" aria-label="System templates">
        <Typography sx={{ fontWeight: 600, fontSize: 15, mb: 1 }}>System templates</Typography>
        {systemTemplates.map((t: any) => renderCard(t, { editable: false }))}
      </Box>
```

`renderCard(t, { editable })` is the existing card body extracted into a local function. Both variants show **Use template** (`onUse(t.id, "schedule")`) and **Run now** (`onUse(t.id, "run-now")`). When `editable` is true the card also shows Edit and Archive, wired to the handlers already in the file. When it is false it shows Duplicate instead — and must render neither Edit nor Archive:

```tsx
  const duplicate = useCreateTemplate();
  const handleDuplicate = (t: any) =>
    duplicate.mutate(
      {
        name: `${t.name} (copy)`,
        description: t.description ?? null,
        category: t.category ?? CATEGORIES[0],
        sectionsConfig: t.latestVersion?.sections_config ?? null,
        aiBlocksConfig: t.latestVersion?.ai_blocks_config ?? null,
        formatConfig: t.latestVersion?.format_config ?? null,
        brandingConfig: t.latestVersion?.branding_config ?? null,
      },
      { onError: mutationError("Failed to duplicate template") },
    );
```

If `myTemplates` is empty, render a short line in that section saying no custom templates exist yet — never hide the section, or the user cannot tell the split exists.

- [ ] **Step 5: Add run-now mode to the wizard**

In `ConfigureReportWizard.tsx`:

1. Add `mode` to the props: `{ template, mode, onClose }` with `mode: "schedule" | "run-now"`.
2. Replace the module-level `STEPS` constant with a per-mode list:

```tsx
const SCHEDULE_STEPS = ["Scope", "Sections", "AI Insights", "Schedule", "Delivery", "Review"];
const RUN_NOW_STEPS = ["Scope", "Sections", "AI Insights", "Review"];
```

and inside the component: `const STEPS = mode === "run-now" ? RUN_NOW_STEPS : SCHEDULE_STEPS;`

3. The step bodies are currently selected by numeric index (`active === 4` and similar). Select by name instead so dropping two steps cannot shift the wrong panel into view: `const step = STEPS[active];` then render on `step === "Scope"`, `step === "Sections"`, `step === "AI Insights"`, `step === "Schedule"`, `step === "Delivery"`, `step === "Review"`. Apply the same change to the `canProceed` guard, whose delivery check must run only when `step === "Delivery"`.
4. Add the run-now mutation and branch the submit:

```tsx
  const runNow = useRunTemplateNow();

  const submit = () => {
    if (!template.latestVersion?.id) return;
    const base = {
      templateVersionId: template.latestVersion.id,
      name: `${template.name}${scope === "project" ? " - Project" : " - Org"}`,
      scope,
      projectId: scope === "project" ? projectId : null,
      sectionsConfig: { sections },
      aiBlocksConfig: ai,
      format,
    };

    if (mode === "run-now") {
      runNow.mutate(
        { id: template.id, body: base },
        {
          onSuccess: onClose,
          onError: () =>
            showAlert({ variant: "error", body: "Failed to run report", isToast: true }),
        },
      );
      return;
    }

    create.mutate(
      {
        ...base,
        templateId: template.id,
        scheduleConfig: schedule,
        deliveryConfig: { ...delivery, recipients: parseRecipients(recipientsText) },
      },
      {
        onSuccess: onClose,
        onError: () =>
          showAlert({ variant: "error", body: "Failed to create scheduled report", isToast: true }),
      },
    );
  };
```

5. The final button reads `mode === "run-now" ? "Run now" : "Create schedule"` (keep whatever label it uses today for the schedule case).

- [ ] **Step 6: Wire the mode through the page**

In `Reporting/index.tsx`:

```tsx
  const [wizardMode, setWizardMode] = useState<"schedule" | "run-now">("schedule");

  const handleUseTemplate = useCallback(
    async (templateId: number, mode: "schedule" | "run-now" = "schedule") => {
      try {
        const template = await getTemplate(templateId);
        setWizardMode(mode);
        setWizardTemplate(template);
      } catch (error: any) {
        showAlert({
          variant: "error",
          body: error?.message || "Failed to load template.",
          isToast: true,
        });
      }
    },
    [],
  );

  const handleWizardClose = useCallback(() => {
    setWizardTemplate(null);
    // A schedule belongs on the Scheduled tab; a run-now report belongs in the
    // Generate list, so send the user where their result actually landed.
    setActiveTab(wizardMode === "run-now" ? 0 : 2);
  }, [wizardMode]);
```

and pass `mode={wizardMode}` where `ConfigureReportWizard` is rendered.

- [ ] **Step 7: Run the tests and typechecks**

Run: `cd Clients && npx vitest run src/presentation/pages/Reporting && npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.test.json`
Expected: PASS; both typechecks clean.

- [ ] **Step 8: Build**

Run: `cd Clients && npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add Clients/src/presentation/pages/Reporting/TemplatesTab.tsx Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx Clients/src/presentation/pages/Reporting/index.tsx Clients/src/presentation/pages/Reporting/__tests__/TemplatesTab.test.tsx Clients/src/application/repository/reporting.repository.ts Clients/src/application/hooks/useReporting.ts
git commit -m "feat(reporting): split custom and system templates and add Run now"
```

---

### Task 8: End-to-end verification and documentation

**Files:**
- Modify: `docs/technical/domains/reporting.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Verify the pipeline against the running app**

With both dev servers running, log in and:

1. Reporting → Templates. Confirm two sections; confirm a system template offers Duplicate but not Edit or Archive.
2. Click **Run now** on a system template, pick a scope, finish the wizard.
3. Confirm the app lands on the Generate tab and the new report appears there with a status — **not** in Archive.
4. Archive that row; confirm it leaves Generate and appears in Archive.
5. Restore it; confirm it returns to Generate.

Then confirm the run is real rather than a UI illusion:

```bash
cd Servers && set -a && . ./.env && set +a && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, status, triggered_by, scheduled_report_id, template_id, file_id, archived_at FROM verifywise.report_runs ORDER BY id DESC LIMIT 5;"
```

Expected: a row with `scheduled_report_id` NULL, `template_id` set, `status` `success` or `partial_success`, and a non-null `file_id`. A NULL `file_id` means storage delivery did not run — that is the bug this step exists to catch.

- [ ] **Step 2: Run both suites**

Run: `cd Servers && npm run test:unit`
Expected: no new failures beyond the pre-existing `advisor/evidenceAnalyzer` suite.

Run: `cd Clients && npx vitest run`
Expected: all pass.

- [ ] **Step 3: Update the domain doc**

In `docs/technical/domains/reporting.md`, update the **Reporting Tables** section and the tab descriptions:

- `report_runs` is the single list of produced reports. `archived_at`/`archived_by` carry a manual, reversible archive; archiving is orthogonal to `status`.
- The Generate tab lists `archived_at IS NULL`, the Archive tab lists `archived_at IS NOT NULL`. Both render the same `ReportRunsTable`.
- `POST /reporting/templates/:id/run` produces one report from a template with no schedule row, by calling `runScheduledReport()` with a null schedule id and `delivery_config: { saveToStorage: true }`. Scheduled runs and run-now share one execution path.
- `PATCH /reporting/runs/:id/archive`, `PATCH /reporting/runs/:id/restore`, `DELETE /reporting/runs/:id` — all Admin/Editor and org-scoped, 404 on a foreign id.
- System templates (`organization_id IS NULL`) are read-only in the UI; Duplicate creates an org-owned copy.
- Note that the legacy `files`-based list (`GET /reporting/generate-report`, `getGeneratedReportsQuery`) is no longer read by the Reporting page, and that its inner join to `projects` is why organization-scoped reports were invisible in it.

Update the "Last Updated" date at the top of the file.

- [ ] **Step 4: Commit**

```bash
git add docs/technical/domains/reporting.md
git commit -m "docs(reporting): document the unified run list, archive and run-now"
```

---

## Verification checklist

- [ ] `cd Servers && npm run test:unit` — no new failures
- [ ] `cd Servers && npx tsc --noEmit` — clean
- [ ] `cd Clients && npx vitest run` — all pass
- [ ] `cd Clients && npx tsc --noEmit -p tsconfig.app.json` and `-p tsconfig.test.json` — both clean
- [ ] `cd Clients && npm run build` — succeeds
- [ ] A run-now report appears in Generate with a non-null `file_id`, and never in Archive
- [ ] Archive then Restore moves a report between the two tabs
- [ ] A system template offers Duplicate but neither Edit nor Archive
- [ ] Archiving or deleting a run id from another organization returns 404
