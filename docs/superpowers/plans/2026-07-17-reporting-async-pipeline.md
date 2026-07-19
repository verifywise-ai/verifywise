# Reporting Phase 1 — Unified Async Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one-off report generation asynchronous — the `POST /v2/generate-report` endpoint creates a `report_runs` row, enqueues a BullMQ job, and returns a run id; the frontend polls run status and downloads the finished file — so that Phase 2's per-report LLM analyzers have somewhere to run and a run id to attach to.

**Architecture:** Manual generation stops returning a binary blob. It reuses the reporting domain that already exists for scheduled reports: the `report_runs` table, `createRunQuery`/`updateRunStatusQuery`/`getRunQuery` in `reportRun.utils.ts`, the `automation-actions` BullMQ queue, and the already-mounted `GET /api/reporting/runs/:id` and `GET /api/reporting/runs/:id/download` endpoints. A new worker-side runner (`executeManualRun`) does generate → upload → update-run inside the worker, with no `req`/`res`. Only the `POST` response shape and the frontend Generate modal are genuinely new.

**Tech Stack:** Node 22, Express 4, Sequelize 6 (raw SQL, no models for these tables), BullMQ + Redis, PostgreSQL (`verifywise` schema), React 19 + React Query 5, Vitest, Jest (ts-jest).

**This is Phase 1 of 4.** Phases 2 (analyzers), 3 (custom templates), 4 (delivery truthfulness) get their own plans, written after this one is green. Spec: `docs/superpowers/specs/2026-07-17-reporting-agent-analysis-design.md`. Issue: `verifywise-ai/verifywise#4280`.

---

## What already exists — DO NOT rebuild

Verified against the tree (see spec §Current state). Rebuilding any of these is a plan failure:

- `report_runs` table with `status`, `triggered_by`, `triggered_by_user_id`, `file_id`, `config_snapshot`, `ai_status` (JSONB), `error_message`, `duration_ms`, `output_filename`, `output_mime_type` — **no `trigger_type` column is needed; `triggered_by VARCHAR(20)` already carries `"manual"`/`"scheduler"`.**
- `createRunQuery(input)`, `updateRunStatusQuery(id, fields)`, `getRunQuery(id, organization_id)`, `listRunsQuery(organization_id, filters)` — all in `Servers/utils/reportRun.utils.ts`.
- `GET /api/reporting/runs`, `GET /api/reporting/runs/:id`, `GET /api/reporting/runs/:id/download` — mounted via `reportRun.route.ts` at `Servers/app.ts:253`.
- `generateReport(request, userId, organizationId)` — `Servers/services/reporting/index.ts:90`. Returns `{ success, filename, content: Buffer, mimeType, error? }`. **Never throws on failure — branch on `result.success`.**
- The `automation-actions` queue + `enqueueAutomationAction(actionKey, data, options)` — `Servers/services/automations/automationProducer.ts`. Use this for a one-shot job; do NOT add a repeatable `scheduleXxx()`.
- `mapReportTypeToFileSource(reportType)` — exported from `Servers/controllers/reporting.ctrl.ts:19`, also imported by `automationWorker.ts:12`. Reuse; do not move or rename (two importers).
- `uploadFile(file, userId, projectId, source, organizationId)` — `Servers/utils/fileUpload.utils.ts`.

## What Phase 1 changes

| File | Create/Modify | Responsibility |
|---|---|---|
| `Servers/database/migrations/<stamp>-report-runs-fileid-fk-and-llm-key.js` | Create | Add `report_runs.file_id` FK → `files` (`ON DELETE SET NULL`); add `scheduled_reports.llm_key_id INTEGER` |
| `Servers/services/reporting/manualReportRunner.ts` | Create | Worker-side: generate → upload → update run for a manual run |
| `Servers/services/reporting/__tests__/manualReportRunner.test.ts` | Create | Unit test the runner with mocked utils |
| `Servers/controllers/reporting.ctrl.ts` | Modify (`generateReportsV2` L240-386) | Create run, enqueue job, return `202 { runId }` |
| `Servers/controllers/__tests__/reporting.ctrl.test.ts` | Create | First-ever test for this controller |
| `Servers/services/automations/reportJobHandlers.ts` | Create | `handleManualReportGeneration(data)` handler |
| `Servers/services/automations/__tests__/reportJobHandlers.test.ts` | Create | Unit test the handler |
| `Servers/services/automations/automationWorker.ts` | Modify (before L759 else) | Dispatch arm for `generate_report_manual` |
| `Servers/controllers/reporting.ctrl.ts` (job name) | — | Job-name constant shared producer/handler (avoid typo drift) |
| `Clients/src/domain/interfaces/i.reporting.ts` | Create | `ReportRun`, `ReportRunStatus`, `GenerateReportResponse` types |
| `Clients/src/application/repository/reporting.repository.ts` | Modify | Add `generateReportV2(body)` + `getReportRun(id)` |
| `Clients/src/application/hooks/useReporting.ts` | Modify | Add `useGenerateReport()` + `useReportRun(id, enabled)` with polling |
| `Clients/src/application/hooks/__tests__/useReporting.test.ts` | Create | Test the poll hook stop-condition |
| `Clients/src/presentation/components/Reporting/GenerateReport/index.tsx` | Modify | Enqueue → poll → download flow, real progress |

**Deliberate decisions locked before implementation (do not revisit):**
- `report_runs.file_id` FK uses **`ON DELETE SET NULL`** (preserve the audit run when a file is deleted; the download endpoint returns a clean 404 on a null `file_id`). This matches `report_runs.scheduled_report_id`'s existing `ON DELETE SET NULL`.
- `scheduled_reports.llm_key_id` is a **plain nullable `INTEGER`, no FK** — matching the reporting domain's deliberate no-FK stance on cross-domain refs (`template_id`, `file_id`, `project_id` all lack FKs on purpose). The resolver already tolerates a missing key.
- `report_run_analyses` table is **NOT created here** — it has no consumer until Phase 2 analyzers. Creating it now would be speculative.
- `POST /api/reporting/generate-report` (legacy) is a literal passthrough to `generateReportsV2` (`reporting.ctrl.ts:229`). It becomes async too. This is intentional — we are unifying, not preserving the blob contract. Stated explicitly per the known passthrough coupling.

---

## Task 1: Migration — file_id FK + llm_key_id column

**Files:**
- Create: `Servers/database/migrations/<stamp>-report-runs-fileid-fk-and-llm-key.js`

- [ ] **Step 1: Generate the timestamp and file**

Run: `cd Servers && date +%Y%m%d%H%M%S`
Use the printed value as `<stamp>` (it must sort after the newest existing migration `20260714205132`). Create `Servers/database/migrations/<stamp>-report-runs-fileid-fk-and-llm-key.js` with exactly:

```js
"use strict";

// Phase 1 async pipeline: give report_runs.file_id a real FK so archive downloads
// resolve, but ON DELETE SET NULL so deleting a file never destroys the run's
// audit record. Add scheduled_reports.llm_key_id — read by reportRunOrchestrator
// today with no backing column (silently undefined). No FK on llm_key_id, matching
// the reporting domain's deliberate no-FK stance on cross-domain references.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.scheduled_reports
        ADD COLUMN IF NOT EXISTS llm_key_id INTEGER;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        DROP CONSTRAINT IF EXISTS report_runs_file_id_fkey;
      -- Null out orphaned pointers before validating the constraint. file_id has
      -- never had referential integrity, and files are hard-deleted through paths
      -- unaware of report_runs, so ADD CONSTRAINT would otherwise fail on any env
      -- with existing report-run history. Nulling matches the ON DELETE SET NULL intent.
      UPDATE verifywise.report_runs
         SET file_id = NULL
       WHERE file_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM verifywise.files f WHERE f.id = report_runs.file_id);
      ALTER TABLE verifywise.report_runs
        ADD CONSTRAINT report_runs_file_id_fkey
        FOREIGN KEY (file_id) REFERENCES verifywise.files(id) ON DELETE SET NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        DROP CONSTRAINT IF EXISTS report_runs_file_id_fkey;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.scheduled_reports
        DROP COLUMN IF EXISTS llm_key_id;
    `);
  },
};
```

Note the reporting-migration dialect: raw `queryInterface.sequelize.query`, explicit `verifywise.` prefix, no `Sequelize` second arg, no transaction for a plain ALTER (matches `20260714205132-readiness-item-type.js`).

- [ ] **Step 2: Build and run the migration up**

Run: `cd Servers && npm run build && npx sequelize db:migrate`
Expected: migration named `<stamp>-report-runs-fileid-fk-and-llm-key` runs with no error. (Requires a local Postgres with the `verifywise` schema — see `Servers/CLAUDE.md` dev bootstrap.)

- [ ] **Step 3: Verify the schema changed**

Run:
```bash
cd Servers && npx sequelize db:migrate:status | tail -3
```
Expected: the new migration shows `up`.

Then confirm the FK and column exist (psql, or any DB client):
```sql
SELECT conname FROM pg_constraint WHERE conname = 'report_runs_file_id_fkey';
SELECT column_name FROM information_schema.columns
  WHERE table_schema='verifywise' AND table_name='scheduled_reports' AND column_name='llm_key_id';
```
Expected: one row each.

- [ ] **Step 4: Verify down() reverses cleanly, then re-apply**

Run:
```bash
cd Servers && npx sequelize db:migrate:undo && npx sequelize db:migrate
```
Expected: undo drops the constraint and column with no error; re-migrate re-adds them. (This proves `down()` is correct — a common migration failure is an irreversible `down`.)

- [ ] **Step 5: Commit**

```bash
cd /Users/halitozger/Desktop/verifywise/.claude/worktrees/practical-euler
git add Servers/database/migrations/*-report-runs-fileid-fk-and-llm-key.js
git commit -m "feat(reporting): add report_runs.file_id FK (SET NULL) and scheduled_reports.llm_key_id"
```

---

## Task 2: `executeManualRun` — the worker-side runner

This is the pure-ish unit that does the actual work off the request thread. It mirrors `reportRunOrchestrator.ts:runScheduledReport` but takes a plain `ReportGenerationRequest` (manual reports have no template to resolve) and an already-created run id.

**Files:**
- Create: `Servers/services/reporting/manualReportRunner.ts`
- Test: `Servers/services/reporting/__tests__/manualReportRunner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Servers/services/reporting/__tests__/manualReportRunner.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../index", () => ({ generateReport: jest.fn() }));
jest.mock("../../../utils/reportRun.utils", () => ({ updateRunStatusQuery: jest.fn() }));
jest.mock("../../../utils/fileUpload.utils", () => ({ uploadFile: jest.fn() }));
jest.mock("../../../controllers/reporting.ctrl", () => ({
  mapReportTypeToFileSource: jest.fn(() => "report"),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { executeManualRun } from "../manualReportRunner";
import { generateReport } from "../index";
import { updateRunStatusQuery } from "../../../utils/reportRun.utils";
import { uploadFile } from "../../../utils/fileUpload.utils";

const mockGenerate = generateReport as jest.MockedFunction<typeof generateReport>;
const mockUpdate = updateRunStatusQuery as jest.MockedFunction<typeof updateRunStatusQuery>;
const mockUpload = uploadFile as jest.MockedFunction<typeof uploadFile>;

const request: any = { projectId: 7, frameworkId: 1, projectFrameworkId: 2, reportType: "project", format: "pdf" };

describe("executeManualRun", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks the run success and stores the uploaded file id", async () => {
    mockGenerate.mockResolvedValue({ success: true, filename: "r.pdf", content: Buffer.from("x"), mimeType: "application/pdf" } as any);
    mockUpload.mockResolvedValue({ id: 42, filename: "r.pdf", content: Buffer.from("x") } as any);

    await executeManualRun(99, request, 3, 5);

    expect(mockGenerate).toHaveBeenCalledWith(request, 3, 5);
    expect(mockUpdate).toHaveBeenCalledWith(99, expect.objectContaining({
      status: "success", file_id: 42, output_filename: "r.pdf", output_mime_type: "application/pdf",
    }));
  });

  it("marks the run failed when generation fails, and never uploads", async () => {
    mockGenerate.mockResolvedValue({ success: false, filename: "", content: Buffer.alloc(0), mimeType: "", error: "boom" } as any);

    await executeManualRun(99, request, 3, 5);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(99, expect.objectContaining({ status: "failed", error_message: "boom" }));
  });

  it("marks the run failed when generation throws", async () => {
    mockGenerate.mockRejectedValue(new Error("kaboom"));

    await executeManualRun(99, request, 3, 5);

    expect(mockUpdate).toHaveBeenCalledWith(99, expect.objectContaining({ status: "failed", error_message: "kaboom" }));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd Servers && npx jest services/reporting/__tests__/manualReportRunner.test.ts`
Expected: FAIL — `Cannot find module '../manualReportRunner'`.

- [ ] **Step 3: Write the implementation**

Create `Servers/services/reporting/manualReportRunner.ts`:

```ts
import { generateReport } from "./index";
import { updateRunStatusQuery } from "../../utils/reportRun.utils";
import { uploadFile } from "../../utils/fileUpload.utils";
import { mapReportTypeToFileSource } from "../../controllers/reporting.ctrl";
import type { ReportGenerationRequest } from "../../domain.layer/interfaces/i.reportGeneration";
import logger from "../../utils/logger/fileLogger";

// Worker-side executor for a manual (non-scheduled) report run. The run row was
// already created (status 'running') by the controller so it could return an id;
// here we generate, upload, and set the final status. Never throws — a failure
// is recorded on the run, because the caller is a BullMQ job with no user to 500.
export async function executeManualRun(
  runId: number,
  request: ReportGenerationRequest,
  userId: number,
  organizationId: number,
): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await generateReport(request, userId, organizationId);
    if (!result.success) {
      await updateRunStatusQuery(runId, {
        status: "failed",
        error_message: result.error ?? "generation failed",
        duration_ms: Date.now() - startedAt,
      });
      return;
    }

    const uploaded = await uploadFile(
      { originalname: result.filename, buffer: result.content, fieldname: "file", mimetype: result.mimeType },
      userId,
      request.projectId,
      mapReportTypeToFileSource(request.reportType),
      organizationId,
    );

    await updateRunStatusQuery(runId, {
      status: "success",
      file_id: uploaded?.id ?? null,
      output_filename: uploaded?.filename ?? result.filename,
      output_mime_type: result.mimeType,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    logger.error("executeManualRun failed", e);
    await updateRunStatusQuery(runId, {
      status: "failed",
      error_message: e?.message ?? "unknown error",
      duration_ms: Date.now() - startedAt,
    });
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd Servers && npx jest services/reporting/__tests__/manualReportRunner.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Confirm `uploadFile` really returns `{ id, filename }`**

ts-jest has `diagnostics: false`, so a wrong property name will NOT fail the test — it would fail silently at runtime. Verify the real return shape:

Run: `cd Servers && grep -nE "return|id:|filename" utils/fileUpload.utils.ts | head -20`
Expected: confirm the resolved object exposes `id` and `filename`. If the property is named differently (e.g. `file.id`), fix `uploaded?.id`/`uploaded?.filename` accordingly and re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/reporting/manualReportRunner.ts Servers/services/reporting/__tests__/manualReportRunner.test.ts
git commit -m "feat(reporting): add executeManualRun worker-side runner"
```

---

## Task 3: BullMQ handler + dispatch arm

The handler is what the worker calls when it dequeues a `generate_report_manual` job. It unpacks the payload and calls `executeManualRun`. Job payload is JSON only — `ReportGenerationResult.content` (a Buffer) never crosses the job boundary; only the request + ids do.

**Files:**
- Create: `Servers/services/reporting/reportJobConstants.ts`
- Create: `Servers/services/automations/reportJobHandlers.ts`
- Test: `Servers/services/automations/__tests__/reportJobHandlers.test.ts`
- Modify: `Servers/services/automations/automationWorker.ts` (add arm before the terminal `else` at L759; add import)

- [ ] **Step 1: Add the shared job-name constant**

Create `Servers/services/reporting/reportJobConstants.ts` (one literal, imported by both producer-side controller and worker — a typo here fails a test, not production):

```ts
// Shared BullMQ job name for on-demand (manual) report generation.
// Duplicating this string across enqueue + dispatch risks a silent
// "No handler found for action type" at runtime; import it in both places.
export const MANUAL_REPORT_JOB = "generate_report_manual";

export interface ManualReportJobData {
  runId: number;
  request: {
    projectId: number;
    frameworkId: number;
    projectFrameworkId: number;
    reportType: string | string[];
    reportName?: string;
    format: "pdf" | "docx";
    branding?: { organizationName: string };
    aiEnhanced?: boolean;
    llmKeyId?: number;
  };
  userId: number;
  organizationId: number;
}
```

- [ ] **Step 2: Write the failing handler test**

Create `Servers/services/automations/__tests__/reportJobHandlers.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../reporting/manualReportRunner", () => ({ executeManualRun: jest.fn() }));

import { handleManualReportGeneration } from "../reportJobHandlers";
import { executeManualRun } from "../../reporting/manualReportRunner";

const mockExecute = executeManualRun as jest.MockedFunction<typeof executeManualRun>;

describe("handleManualReportGeneration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("forwards the job payload to executeManualRun", async () => {
    const data = {
      runId: 12,
      request: { projectId: 7, frameworkId: 1, projectFrameworkId: 2, reportType: "project", format: "pdf" as const },
      userId: 3,
      organizationId: 5,
    };

    await handleManualReportGeneration(data);

    expect(mockExecute).toHaveBeenCalledWith(12, data.request, 3, 5);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cd Servers && npx jest services/automations/__tests__/reportJobHandlers.test.ts`
Expected: FAIL — cannot find `../reportJobHandlers`.

- [ ] **Step 4: Write the handler**

Create `Servers/services/automations/reportJobHandlers.ts`:

```ts
import { executeManualRun } from "../reporting/manualReportRunner";
import type { ManualReportJobData } from "../reporting/reportJobConstants";

// Worker dispatch target for MANUAL_REPORT_JOB. Pure unpack → executeManualRun,
// which records its own success/failure on the run row.
export async function handleManualReportGeneration(data: ManualReportJobData): Promise<void> {
  await executeManualRun(data.runId, data.request as any, data.userId, data.organizationId);
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd Servers && npx jest services/automations/__tests__/reportJobHandlers.test.ts`
Expected: 1 passing.

- [ ] **Step 6: Wire the dispatch arm into the worker**

In `Servers/services/automations/automationWorker.ts`:

Add to the import block (near L94 where `handleReportSchedulerTick` is imported):
```ts
import { handleManualReportGeneration } from "./reportJobHandlers";
import { MANUAL_REPORT_JOB, ManualReportJobData } from "../reporting/reportJobConstants";
```

Add a dispatch arm **immediately before the terminal `} else {` at L759** (matching the existing `else if (name === "report_scheduler_tick")` arm shape):
```ts
        } else if (name === MANUAL_REPORT_JOB) {
          await handleManualReportGeneration(job.data as ManualReportJobData);
```

- [ ] **Step 7: Build to confirm the worker still compiles**

Run: `cd Servers && npm run build`
Expected: no TypeScript errors. (ts-jest ignores type errors, so `npm run build` is the real type gate — run it.)

- [ ] **Step 8: Commit**

```bash
git add Servers/services/reporting/reportJobConstants.ts Servers/services/automations/reportJobHandlers.ts Servers/services/automations/__tests__/reportJobHandlers.test.ts Servers/services/automations/automationWorker.ts
git commit -m "feat(reporting): add generate_report_manual BullMQ handler and dispatch arm"
```

---

## Task 4: Controller — `generateReportsV2` returns `202 { runId }`

The controller stops generating inline. It validates, creates a `report_runs` row (status `running`, `triggered_by: "manual"`), enqueues the job, and returns `202`. The heavy work moved to the worker (Task 2/3).

**Files:**
- Modify: `Servers/controllers/reporting.ctrl.ts` (`generateReportsV2` L240-386; add imports)
- Test: `Servers/controllers/__tests__/reporting.ctrl.test.ts` (new — no test exists for this controller today)

- [ ] **Step 1: Write the failing controller test**

Create `Servers/controllers/__tests__/reporting.ctrl.test.ts`:

```ts
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));
// Prevent loading the real reporting engine (Playwright/docx) at import time.
jest.mock("../../services/reporting", () => ({ generateReport: jest.fn() }));
jest.mock("../../utils/reportRun.utils", () => ({ createRunQuery: jest.fn() }));
jest.mock("../../services/automations/automationProducer", () => ({ enqueueAutomationAction: jest.fn() }));
jest.mock("../../utils/user.utils", () => ({ getUserByIdQuery: jest.fn() }));
jest.mock("../../utils/organization.utils", () => ({ getOrganizationByIdQuery: jest.fn() }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(), logSuccess: jest.fn(), logFailure: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true, default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn((_r, e) => (e as Error).message) }));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    202: (d: any) => ({ message: "Accepted", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import { generateReportsV2 } from "../reporting.ctrl";
import { createRunQuery } from "../../utils/reportRun.utils";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import { getUserByIdQuery } from "../../utils/user.utils";
import { getOrganizationByIdQuery } from "../../utils/organization.utils";

const mockCreateRun = createRunQuery as jest.MockedFunction<typeof createRunQuery>;
const mockEnqueue = enqueueAutomationAction as jest.MockedFunction<typeof enqueueAutomationAction>;
const mockUser = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockOrg = getOrganizationByIdQuery as jest.MockedFunction<typeof getOrganizationByIdQuery>;

function createMockReq(body: any = {}): Partial<Request> {
  return { body, organizationId: 5, userId: 3, t: (k: string) => k } as Partial<Request>;
}
function createMockRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe("generateReportsV2 (async)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a run, enqueues a job, and returns 202 with the run id", async () => {
    mockUser.mockResolvedValue({ id: 3, organization_id: 5 } as any);
    mockOrg.mockResolvedValue({ name: "Acme" } as any);
    mockCreateRun.mockResolvedValue({ id: 77 } as any);

    const req = createMockReq({ projectId: "7", frameworkId: "1", projectFrameworkId: "2", reportType: "project", format: "pdf" });
    const res = createMockRes();

    await generateReportsV2(req as Request, res as Response);

    expect(mockCreateRun).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: 5, triggered_by: "manual", triggered_by_user_id: 3,
    }));
    expect(mockEnqueue).toHaveBeenCalledWith(
      "generate_report_manual",
      expect.objectContaining({ runId: 77, userId: 3, organizationId: 5 }),
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { runId: 77 } }));
  });

  it("returns 404 when the user does not exist", async () => {
    mockUser.mockResolvedValue(null as any);
    const req = createMockReq({ projectId: "7", frameworkId: "1", projectFrameworkId: "2", reportType: "project" });
    const res = createMockRes();

    await generateReportsV2(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd Servers && npx jest controllers/__tests__/reporting.ctrl.test.ts`
Expected: FAIL — `generateReportsV2` still returns the old blob response (no 202, `createRunQuery`/`enqueueAutomationAction` never called).

- [ ] **Step 3: Add imports to the controller**

In `Servers/controllers/reporting.ctrl.ts`, add to the import block (L1-21):
```ts
import { createRunQuery } from "../utils/reportRun.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import { MANUAL_REPORT_JOB } from "../services/reporting/reportJobConstants";
```

- [ ] **Step 4: Replace the body of `generateReportsV2`**

Replace the entire function body (L240-386) — everything from `const { projectId: projectIdRaw, ... }` through the final `catch` — with:

```ts
export async function generateReportsV2(req: Request, res: Response): Promise<any> {
  const {
    projectId: projectIdRaw,
    reportType,
    frameworkId: frameworkIdRaw,
    reportName,
    projectFrameworkId: projectFrameworkIdRaw,
    format = "docx",
    aiEnhanced,
    llmKeyId,
  } = req.body;

  const projectId = parseInt(projectIdRaw);
  const frameworkId = parseInt(frameworkIdRaw);
  const projectFrameworkId = parseInt(projectFrameworkIdRaw);
  const userId = req.userId;
  const reportFormat: ReportFormat = format === "pdf" ? "pdf" : "docx";

  logProcessing({
    description: `enqueueing generateReportsV2 for project ID ${projectId}, report type: ${reportType}, format: ${reportFormat}`,
    functionName: "generateReportsV2",
    fileName: "reporting.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const user = await getUserByIdQuery(userId!);
    if (!user) {
      await logFailure({
        eventType: "Create",
        description: `User not found: ID ${userId}`,
        functionName: "generateReportsV2",
        fileName: "reporting.ctrl.ts",
        error: new Error("User not found"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    const organization = await getOrganizationByIdQuery(user.organization_id!);
    const organizationName = organization?.name || "VerifyWise";

    const request = {
      projectId,
      frameworkId,
      projectFrameworkId,
      reportType,
      reportName,
      format: reportFormat,
      branding: { organizationName },
      aiEnhanced: aiEnhanced === true,
      llmKeyId: llmKeyId ? parseInt(llmKeyId) : undefined,
    };

    const run = await createRunQuery({
      organization_id: req.organizationId!,
      scheduled_report_id: null,
      template_id: null,
      template_version_id: null,
      triggered_by: "manual",
      triggered_by_user_id: userId!,
      config_snapshot: { request },
      scheduled_for: null,
    });

    await enqueueAutomationAction(MANUAL_REPORT_JOB, {
      runId: run.id,
      request,
      userId: userId!,
      organizationId: req.organizationId!,
    });

    await logSuccess({
      eventType: "Create",
      description: `Queued ${reportType} report (${reportFormat}) as run ${run.id} for project ID ${projectId}`,
      functionName: "generateReportsV2",
      fileName: "reporting.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202]({ runId: run.id }));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: `Failed to queue ${reportType} report for project ID ${projectId}`,
      functionName: "generateReportsV2",
      fileName: "reporting.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
```

Clean up the imports the rewrite orphaned. Both `uploadFile` (from `../utils/fileUpload.utils`) and the `generateReport as generateReportV2` value (from `../services/reporting`) were used **only** in the old `generateReportsV2` body and are now file-wide unused — `executeManualRun` owns that work in the worker now. Confirm and remove:

```bash
grep -n "uploadFile\|generateReportV2" Servers/controllers/reporting.ctrl.ts
```
If the only remaining hits are the import lines, change the services import to keep just the type — `import { ReportFormat } from "../services/reporting";` (`ReportFormat` is still used by `const reportFormat: ReportFormat`) — and delete the `uploadFile` import line. Do NOT touch `mapReportTypeToFileSource` (defined in this file, imported by the worker) or `ReportFormat`.

- [ ] **Step 5: Run the controller test**

Run: `cd Servers && npx jest controllers/__tests__/reporting.ctrl.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Build**

Run: `cd Servers && npm run build`
Expected: no type errors. Fix any unused-import error surfaced here.

- [ ] **Step 7: Regenerate API docs (route response changed)**

Run: `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`
Expected: `check:api-drift` passes (exit 0). Commit the regenerated `swagger.yaml` / `endpoints.ts` in the next step, or CI `api-docs-drift` fails.

- [ ] **Step 8: Commit**

```bash
git add Servers/controllers/reporting.ctrl.ts Servers/controllers/__tests__/reporting.ctrl.test.ts Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "feat(reporting): generateReportsV2 enqueues a run and returns 202 { runId }"
```

---

## Task 5: Frontend types + repository

**Files:**
- Create: `Clients/src/domain/interfaces/i.reporting.ts`
- Modify: `Clients/src/application/repository/reporting.repository.ts`

- [ ] **Step 1: Create the interface file**

Create `Clients/src/domain/interfaces/i.reporting.ts`:

```ts
// Types for the enterprise reporting stack (templates / scheduled / runs).
// Phase 1 introduces only what the async generate flow needs; later phases extend.

export type ReportRunStatus =
  | "running"
  | "success"
  | "failed"
  | "partial_success";

export interface ReportRun {
  id: number;
  organization_id: number;
  status: ReportRunStatus;
  triggered_by: string;
  file_id: number | null;
  output_filename: string | null;
  output_mime_type: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface GenerateReportRequestBody {
  projectId: number | string;
  frameworkId: number | string;
  projectFrameworkId: number | string;
  reportType: string | string[];
  reportName?: string;
  format?: "pdf" | "docx";
  aiEnhanced?: boolean;
  llmKeyId?: number;
}

export interface GenerateReportResponse {
  runId: number;
}
```

- [ ] **Step 2: Add repository functions**

In `Clients/src/application/repository/reporting.repository.ts`, add (keep the existing `extract` helper and `apiServices` import):

```ts
import type {
  GenerateReportRequestBody,
  GenerateReportResponse,
  ReportRun,
} from "../../domain/interfaces/i.reporting";

// Enqueue an async report generation; returns the run id to poll.
export async function generateReportV2(
  body: GenerateReportRequestBody,
): Promise<GenerateReportResponse> {
  return extract(await apiServices.post("/reporting/v2/generate-report", body));
}

// Fetch a single run (org-scoped) for status polling.
export async function getReportRun(id: number): Promise<ReportRun> {
  return extract(await apiServices.get(`/reporting/runs/${id}`));
}
```

(`downloadReportRun(id)` already exists in this file — reuse it, don't duplicate.)

- [ ] **Step 3: Type-check the frontend**

Run: `cd Clients && npx tsc --noEmit`
Expected: no errors from the new file/functions. (Vitest does not type-check; `tsc --noEmit` is the gate.)

- [ ] **Step 4: Commit**

```bash
git add Clients/src/domain/interfaces/i.reporting.ts Clients/src/application/repository/reporting.repository.ts
git commit -m "feat(reporting): add ReportRun types and async generate/poll repository fns"
```

---

## Task 6: Frontend hooks — generate mutation + polling query

**Files:**
- Modify: `Clients/src/application/hooks/useReporting.ts`
- Test: `Clients/src/application/hooks/__tests__/useReporting.test.ts` (new)

- [ ] **Step 1: Write the failing hook test**

Create `Clients/src/application/hooks/__tests__/useReporting.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useReportRun } from "../useReporting";

const mockGetReportRun = vi.fn();
vi.mock("../../repository/reporting.repository", () => ({
  getReportRun: (...args: unknown[]) => mockGetReportRun(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useReportRun", () => {
  afterEach(() => vi.clearAllMocks());

  it("fetches the run when enabled and id is set", async () => {
    mockGetReportRun.mockResolvedValue({ id: 5, status: "success" });

    const { result } = renderHook(() => useReportRun(5, true), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetReportRun).toHaveBeenCalledWith(5);
    expect(result.current.data).toEqual({ id: 5, status: "success" });
  });

  it("does not fetch when disabled", async () => {
    const { result } = renderHook(() => useReportRun(undefined, false), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetReportRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd Clients && npx vitest run src/application/hooks/__tests__/useReporting.test.ts`
Expected: FAIL — `useReportRun` is not exported.

- [ ] **Step 3: Add the hooks**

In `Clients/src/application/hooks/useReporting.ts`, add (the file already imports `useQuery, useMutation, useQueryClient` and `* as repo`):

```ts
// Poll a single report run until it leaves the "running" state.
// v5 refetchInterval: return false to stop polling once terminal.
export const useReportRun = (id: number | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["reporting", "run", id],
    queryFn: () => repo.getReportRun(id as number),
    enabled: enabled && id != null,
    refetchInterval: (query) =>
      query.state.data && (query.state.data as any).status !== "running" ? false : 2000,
  });

// Enqueue an async report generation; returns { runId }.
export const useGenerateReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repo.generateReportV2,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "runs"] }),
  });
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd Clients && npx vitest run src/application/hooks/__tests__/useReporting.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add Clients/src/application/hooks/useReporting.ts Clients/src/application/hooks/__tests__/useReporting.test.ts
git commit -m "feat(reporting): add useGenerateReport mutation and useReportRun polling hook"
```

---

## Task 7: Rewrite the Generate modal — enqueue → poll → download

This replaces the sync `handleAutoDownload` blob flow. The modal enqueues, polls the run with `useReportRun`, shows real progress driven by run status, and on `success` downloads via the existing `downloadReportRun(runId)` blob endpoint using `run.output_filename` for the filename (the GET download endpoint returns no headers).

**Files:**
- Modify: `Clients/src/presentation/components/Reporting/GenerateReport/index.tsx`
- Modify: `Clients/src/presentation/components/Reporting/GenerateReport/DownloadReportFrom/index.tsx` (drive progress from real status, not a timer)

- [ ] **Step 1: Read the two files in full before editing**

Run:
```bash
cd Clients && sed -n '1,220p' src/presentation/components/Reporting/GenerateReport/index.tsx
sed -n '1,160p' src/presentation/components/Reporting/GenerateReport/DownloadReportFrom/index.tsx
```
Understand: where the current submit calls `handleAutoDownload`, how the modal is opened/closed (`isOpen`, parent unmount), and where the fake progress bar lives (`// Simulated progress`). The known dead `403` branch (CustomAxios sets no `validateStatus`) can be dropped.

- [ ] **Step 2: Replace the submit path with enqueue + poll**

In `GenerateReport/index.tsx`, where the report is currently generated synchronously, use the new hooks. The essential control flow (adapt variable names to the existing component — do not invent new prop names):

```tsx
import { useGenerateReport, useReportRun } from "../../../../application/hooks/useReporting";
import { downloadReportRun } from "../../../../application/repository/reporting.repository";

// inside the component:
const generate = useGenerateReport();
const [runId, setRunId] = React.useState<number | undefined>(undefined);
const run = useReportRun(runId, runId != null);

const onSubmit = (body: GenerateReportRequestBody) => {
  generate.mutate(body, {
    onSuccess: (res) => setRunId(res.runId),
    onError: () => showAlert({ variant: "error", body: "Failed to start report", isToast: true }),
  });
};

// when the run reaches a terminal state, download or surface the error:
React.useEffect(() => {
  if (!run.data) return;
  if (run.data.status === "success" && run.data.file_id != null) {
    downloadReportRun(run.data.id).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = run.data!.output_filename ?? "report";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setRunId(undefined);
    });
  } else if (run.data.status === "failed") {
    showAlert({ variant: "error", body: run.data.error_message ?? "Report generation failed", isToast: true });
    setRunId(undefined);
  }
}, [run.data]);
```

Use `showAlert` from `infrastructure/api/customAxios` (the toast mechanism the Reporting tabs already use) — pick this one, drop the local `<Alert isToast>` path, so the modal has one alert mechanism.

- [ ] **Step 3: Drive the progress display from status, not a timer**

In `DownloadReportFrom/index.tsx`, replace the `// Simulated progress` timer with a status-driven indicator: `running` → indeterminate `CircularProgress` (per the design rules' loading spec), `success`/`failed` handled by the parent effect above. Remove the 10s/30s easing constants. Keep it minimal — an indeterminate spinner with the label "Generating report…" is sufficient; there is no real percentage to show.

- [ ] **Step 4: Verify in the browser (preview)**

Start the frontend preview and exercise the flow:
- Enqueue a report → the modal shows the running spinner.
- The run transitions to `success` → the file downloads and the modal resets.
- Force a failure (e.g. temporarily point at a project with no data) → the error toast shows `error_message`.

Use the Browser pane: `read_console_messages` for errors, `read_network_requests` to confirm one `POST /reporting/v2/generate-report` → `202`, then repeated `GET /reporting/runs/:id` until `status !== "running"`, then one `GET /reporting/runs/:id/download`. Screenshot the success state.

(This step requires the backend API **and** the BullMQ worker running: `cd Servers && npm run watch`, `cd Servers && npm run worker`, `cd Clients && npm run dev`. Without the worker, the run stays `running` forever — that is the expected symptom of a missing worker, not a bug in this code.)

- [ ] **Step 5: Type-check and run the frontend test suite**

Run:
```bash
cd Clients && npx tsc --noEmit && npm run test:ci
```
Expected: no type errors; all tests pass (including the new `useReporting.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add Clients/src/presentation/components/Reporting/GenerateReport/
git commit -m "feat(reporting): async enqueue-poll-download flow in the Generate modal"
```

---

## Task 8: Docs

**Files:**
- Modify: `docs/technical/domains/reporting.md` (flow + Last Updated)
- Modify: `docs/technical/infrastructure/automations.md` (job table ~L103)

- [ ] **Step 1: Update the reporting domain doc**

In `docs/technical/domains/reporting.md`: document that manual generation is now async (`POST /v2/generate-report` → `202 { runId }` → poll `GET /runs/:id` → `GET /runs/:id/download`), that manual and scheduled reports share the `report_runs` pipeline, and that a BullMQ worker is required for any report to generate. Bump the **Last Updated** date at the top to today (mandated by the root `CLAUDE.md`).

- [ ] **Step 2: Add the job to the automations doc**

In `docs/technical/infrastructure/automations.md` (~L103 job table): add a row for `generate_report_manual` (one-shot, `automation-actions` queue, enqueued on demand by `generateReportsV2`).

- [ ] **Step 3: Commit**

```bash
git add docs/technical/domains/reporting.md docs/technical/infrastructure/automations.md
git commit -m "docs(reporting): document async manual generation pipeline and worker requirement"
```

---

## Final verification

- [ ] **Backend build + full unit suite**

Run: `cd Servers && npm run build && npm run test`
Expected: build clean; `manualReportRunner`, `reportJobHandlers`, `reporting.ctrl` tests green.

- [ ] **Frontend type-check + CI test run**

Run: `cd Clients && npx tsc --noEmit && npm run test:ci`
Expected: clean.

- [ ] **API drift**

Run: `cd Servers && npm run check:api-drift`
Expected: exit 0.

- [ ] **End-to-end smoke (with worker running)**

With API + worker + frontend up, generate one report and confirm: a `report_runs` row is created with `triggered_by='manual'`, transitions `running` → `success`, `file_id` is populated, and the file downloads. Confirm a second run whose generation fails records `status='failed'` with a non-null `error_message` (not `success`).

---

## Notes carried forward to later phases (do not implement here)

- **Phase 2** creates `report_run_analyses` and the six analyzers; `report_runs.ai_status` (JSONB) already exists to hold analyzer state.
- **Phase 4** fixes the scheduled-report invisibility (`INNER JOIN projects` in `getGeneratedReportsQuery`), real MJML delivery, `listRunsQuery` pagination (hard `LIMIT 200` at `reportRun.utils.ts:38`), and the missing `scheduled_reports` UPDATE endpoint. The DELETE endpoint already exists — wire it into the repository, do not rebuild it.
- The legacy `scheduled_report` automation trigger (`automationWorker.ts:250-492`) is retired in a later phase, not here — Phase 1 leaves it untouched so the async cutover is isolated.
