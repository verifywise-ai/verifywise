# MRM Metric Retention Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurable per-org retention for `mrm_metrics` — a daily BullMQ job prunes benign monitoring points older than the retention window (default 25 months) while NEVER deleting any point that produced a warn/breach evaluation, plus a Settings field to configure it.

**Architecture:** Mirrors the existing `mrmRevalidationSweep` pattern exactly: pure SQL utils → a per-org action with an all-orgs entry point → BullMQ repeatable job → thin JWT-authed controller → React Query hook → a new SectionNav section in the MRM Settings tab. New `mrm_org_settings` table (per-org, lazily created, defaults when absent).

**Tech Stack:** Node/Express/Sequelize raw SQL, BullMQ, Jest (unit + tenant-isolation integration), React 19 + React Query + VerifyWise components.

**Spec:** `docs/superpowers/specs/2026-07-10-mrm-metric-retention-design.md` (approved). Branch: `feat/mrm-retention` (already cut, spec committed).

## Global Constraints

- Application SQL uses **unqualified** table names (`search_path = verifywise`); migration DDL uses the explicit `verifywise.` prefix.
- `"window"` is a Postgres reserved word — always quote it in SQL (not needed in this feature's queries, but never write it bare).
- Controllers are thin: `logStructured("processing"/"successful"/"error", msg, fn, FILE)`, respond `res.status(n).json(STATUS_CODE[n](data))`, errors via a local `fail()` helper.
- Every tenant-scoped query filters `organization_id = :organizationId` via `:replacements`.
- Migration filename timestamp MUST come from `date +%Y%m%d%H%M%S` at creation time.
- Route changes require regenerating API docs: `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift` — commit the regenerated files with the route change.
- Frontend: VerifyWise components (`Field`, `CustomizableButton` with `text=` NOT `label=`), exact pixel spacing strings (`gap: "16px"`, never numeric multipliers), sentence case for all UI text, Lucide icons 16px strokeWidth 1.5.
- New user-facing strings need de/fr/es entries in `Clients/src/i18n/translations.ts` (DOM translator keys by the literal English string) — `npm run i18n:audit:strict` gates this.
- No `console.log` in committed code (logger only).
- Gates before PR: `cd Servers && npm run build` · `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build`.
- Constants locked by spec: default retention **25** months, floor **13**, `batchSize` **10000**, `maxBatches` **500**, cron `0 3 * * *` (the revalidation sweep runs at `0 4 * * *` — stay distinct).

---

### Task 1: Migration — `mrm_org_settings` table + `(organization_id, at)` index on `mrm_metrics`

**Files:**
- Create: `Servers/database/migrations/<TIMESTAMP>-create-mrm-org-settings.js` (timestamp from `date +%Y%m%d%H%M%S`)

**Interfaces:**
- Produces: table `verifywise.mrm_org_settings(organization_id PK, retention_months INT NOT NULL DEFAULT 25 CHECK >= 13, created_at, updated_at)`; index `idx_mrm_metrics_org_at ON verifywise.mrm_metrics(organization_id, at)`. Tasks 2 and 6 depend on both existing.

- [ ] **Step 1: Generate the timestamp and create the migration file**

Run: `date +%Y%m%d%H%M%S` — use the output as `<TIMESTAMP>` in the filename below (e.g. `20260710093015-create-mrm-org-settings.js`).

Write `Servers/database/migrations/<TIMESTAMP>-create-mrm-org-settings.js`:

```javascript
"use strict";

/**
 * MRM (Model Risk Management) — metric retention (gap #1).
 *
 * mrm_org_settings: org-wide MRM configuration. One row per org, lazily
 * created — a missing row means defaults. Deliberately named generically
 * (not "retention settings") so future MRM-wide toggles (e.g. alert
 * recipients/channels) add columns here instead of spawning new tables.
 *
 * retention_months: how long benign (never warn/breach) mrm_metrics points
 * are kept before the daily prune job removes them. Floor of 13 months —
 * retention can never drop below a one-year examiner cycle + margin
 * (SR 26-2 / SS1/23 / OSFI E-23 monitoring-evidence expectation).
 *
 * idx_mrm_metrics_org_at: the prune job scans (organization_id, at < cutoff);
 * the existing indexes ((org) and (org, model, metric, at)) do not serve an
 * org + at-range scan.
 *
 * Tenant-scoped by organization_id (the PK).
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_org_settings (
          organization_id INTEGER PRIMARY KEY
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          retention_months INTEGER NOT NULL DEFAULT 25
            CHECK (retention_months >= 13),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_metrics_org_at
          ON verifywise.mrm_metrics(organization_id, at);
      `,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        "DROP INDEX IF EXISTS verifywise.idx_mrm_metrics_org_at;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TABLE IF EXISTS verifywise.mrm_org_settings CASCADE;",
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
```

- [ ] **Step 2: Build and run the migration**

Run: `cd Servers && npm run build && npx sequelize db:migrate`
Expected: migration `<TIMESTAMP>-create-mrm-org-settings.js` listed as `== ... migrated`.

- [ ] **Step 3: Verify the table and index exist**

Run: `cd Servers && npx sequelize db:migrate:status | tail -3` and
`psql "$DATABASE_URL" -c "\d verifywise.mrm_org_settings" -c "\di verifywise.idx_mrm_metrics_org_at" 2>/dev/null || echo "psql not available — verified via migrate status"`
Expected: migration status `up`; if psql runs, the table shows `retention_months integer not null default 25` and the index exists.

- [ ] **Step 4: Commit**

```bash
git add Servers/database/migrations/
git commit -m "feat(mrm): mrm_org_settings table + org_at index for metric retention"
```

---

### Task 2: Settings + retention SQL utils

**Files:**
- Create: `Servers/utils/mrmSettings.utils.ts`
- Create: `Servers/utils/mrmRetention.utils.ts`

**Interfaces:**
- Consumes: tables from Task 1.
- Produces (Task 3, 5, 6 rely on these exact signatures):
  - `DEFAULT_RETENTION_MONTHS = 25`, `MIN_RETENTION_MONTHS = 13` (mrmSettings.utils)
  - `interface MrmOrgSettings { organization_id: number; retention_months: number }`
  - `getMrmOrgSettings(organizationId: number): Promise<MrmOrgSettings>` — returns defaults when no row
  - `upsertMrmOrgSettings(organizationId: number, retentionMonths: number): Promise<MrmOrgSettings>`
  - `getRetentionCutoffQuery(retentionMonths: number): Promise<string>` (mrmRetention.utils)
  - `pruneMetricsBatchQuery(organizationId: number, retentionMonths: number, batchSize: number): Promise<number>` — returns rows deleted

- [ ] **Step 1: Write `Servers/utils/mrmSettings.utils.ts`**

```typescript
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

/**
 * MRM org-wide settings (mrm_org_settings). One row per org, lazily created —
 * a missing row means defaults. Currently holds only the metric-retention
 * window; future MRM-wide config (alert recipients/channels) belongs here too.
 */

export const DEFAULT_RETENTION_MONTHS = 25;
// Floor: never below a one-year examiner cycle + margin (SR 26-2 / SS1/23 / OSFI E-23).
export const MIN_RETENTION_MONTHS = 13;

export interface MrmOrgSettings {
  organization_id: number;
  retention_months: number;
}

/** Read the org's MRM settings; a missing row resolves to defaults. */
export const getMrmOrgSettings = async (organizationId: number): Promise<MrmOrgSettings> => {
  const rows = (await sequelize.query(
    `SELECT organization_id, retention_months
       FROM mrm_org_settings
      WHERE organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as MrmOrgSettings[];
  return rows[0] ?? { organization_id: organizationId, retention_months: DEFAULT_RETENTION_MONTHS };
};

/** Create-or-update the org's MRM settings row. Caller validates the value. */
export const upsertMrmOrgSettings = async (
  organizationId: number,
  retentionMonths: number,
): Promise<MrmOrgSettings> => {
  const rows = (await sequelize.query(
    `INSERT INTO mrm_org_settings (organization_id, retention_months)
     VALUES (:organizationId, :retentionMonths)
     ON CONFLICT (organization_id)
     DO UPDATE SET retention_months = EXCLUDED.retention_months, updated_at = now()
     RETURNING organization_id, retention_months`,
    {
      replacements: { organizationId, retentionMonths },
      type: QueryTypes.SELECT,
    },
  )) as MrmOrgSettings[];
  return rows[0];
};
```

- [ ] **Step 2: Write `Servers/utils/mrmRetention.utils.ts`**

```typescript
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

/**
 * MRM metric retention — the examiner-safe prune (gap #1).
 *
 * Retention NEVER touches the audit trail: a raw mrm_metrics point is
 * prunable only if NO evaluation of it was warn/breach. Any point with a
 * warn/breach evaluation is kept forever. CASCADE then removes only the
 * pruned point's benign-only evaluation rows; breach evaluations are never
 * reached because their metric survives.
 *
 * The NOT EXISTS guard lives INSIDE the batching subquery — load-bearing.
 * If the batch window were selected first (oldest N) and filtered after,
 * never-deletable protected points would permanently occupy the window's
 * slots and wedge the loop with prunable rows still beyond the window.
 * With the guard inside, "deleted < batchSize" genuinely means "no more
 * prunable rows".
 */

/** The cutoff timestamp for a retention window, computed in SQL (one source of truth). */
export const getRetentionCutoffQuery = async (retentionMonths: number): Promise<string> => {
  const rows = (await sequelize.query(
    `SELECT (now() - make_interval(months => :retentionMonths))::text AS cutoff`,
    {
      replacements: { retentionMonths },
      type: QueryTypes.SELECT,
    },
  )) as { cutoff: string }[];
  return rows[0].cutoff;
};

/**
 * Delete one batch of prunable (benign, aged-out) metric points for an org.
 * Returns the number of rows deleted; a return < batchSize means done.
 */
export const pruneMetricsBatchQuery = async (
  organizationId: number,
  retentionMonths: number,
  batchSize: number,
): Promise<number> => {
  const [, meta] = await sequelize.query(
    `DELETE FROM mrm_metrics
      WHERE id IN (
        SELECT mm.id
          FROM mrm_metrics mm
         WHERE mm.organization_id = :organizationId
           AND mm.at < now() - make_interval(months => :retentionMonths)
           AND NOT EXISTS (
             SELECT 1 FROM mrm_metric_evaluations e
              WHERE e.organization_id = mm.organization_id
                AND e.metric_id = mm.id
                AND e.status IN ('warn', 'breach')
           )
         ORDER BY mm.at
         LIMIT :batchSize
      )`,
    {
      replacements: { organizationId, retentionMonths, batchSize },
    },
  );
  return (meta as { rowCount?: number } | undefined)?.rowCount ?? 0;
};
```

- [ ] **Step 3: Build to verify compilation**

Run: `cd Servers && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add Servers/utils/mrmSettings.utils.ts Servers/utils/mrmRetention.utils.ts
git commit -m "feat(mrm): settings + retention prune SQL utils"
```

---

### Task 3: The prune action (TDD — loop/cap logic unit-tested with mocked utils)

**Files:**
- Create: `Servers/services/automations/actions/mrmRetentionPrune.ts`
- Test: `Servers/services/automations/actions/__tests__/mrmRetentionPrune.test.ts`

**Interfaces:**
- Consumes: `getMrmOrgSettings` (Task 2), `getRetentionCutoffQuery` / `pruneMetricsBatchQuery` (Task 2), `getAllOrganizationsQuery` from `Servers/utils/organization.utils`.
- Produces (Task 4 and 6 rely on):
  - `PRUNE_BATCH_SIZE = 10000`, `PRUNE_MAX_BATCHES = 500`
  - `interface RetentionPruneSummary { organization_id: number; cutoff: string; deleted: number; batches: number; capped: boolean }`
  - `runRetentionPrune(organizationId: number): Promise<RetentionPruneSummary>`
  - `runRetentionPruneAllOrgs(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Write `Servers/services/automations/actions/__tests__/mrmRetentionPrune.test.ts`:

```typescript
import {
  PRUNE_BATCH_SIZE,
  PRUNE_MAX_BATCHES,
  runRetentionPrune,
  runRetentionPruneAllOrgs,
} from "../mrmRetentionPrune";
import { getMrmOrgSettings } from "../../../../utils/mrmSettings.utils";
import {
  getRetentionCutoffQuery,
  pruneMetricsBatchQuery,
} from "../../../../utils/mrmRetention.utils";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";

jest.mock("../../../../utils/mrmSettings.utils", () => ({
  getMrmOrgSettings: jest.fn(),
}));
jest.mock("../../../../utils/mrmRetention.utils", () => ({
  getRetentionCutoffQuery: jest.fn(),
  pruneMetricsBatchQuery: jest.fn(),
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockSettings = getMrmOrgSettings as jest.Mock;
const mockCutoff = getRetentionCutoffQuery as jest.Mock;
const mockPruneBatch = pruneMetricsBatchQuery as jest.Mock;
const mockAllOrgs = getAllOrganizationsQuery as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.mockResolvedValue({ organization_id: 1, retention_months: 25 });
  mockCutoff.mockResolvedValue("2024-06-10 00:00:00+00");
});

describe("runRetentionPrune", () => {
  it("stops after one batch when fewer than batchSize rows were deleted", async () => {
    mockPruneBatch.mockResolvedValueOnce(42);
    const summary = await runRetentionPrune(1);
    expect(mockPruneBatch).toHaveBeenCalledTimes(1);
    expect(mockPruneBatch).toHaveBeenCalledWith(1, 25, PRUNE_BATCH_SIZE);
    expect(summary).toEqual({
      organization_id: 1,
      cutoff: "2024-06-10 00:00:00+00",
      deleted: 42,
      batches: 1,
      capped: false,
    });
  });

  it("loops full batches and sums deletions until a short batch", async () => {
    mockPruneBatch
      .mockResolvedValueOnce(PRUNE_BATCH_SIZE)
      .mockResolvedValueOnce(PRUNE_BATCH_SIZE)
      .mockResolvedValueOnce(7);
    const summary = await runRetentionPrune(1);
    expect(mockPruneBatch).toHaveBeenCalledTimes(3);
    expect(summary.deleted).toBe(PRUNE_BATCH_SIZE * 2 + 7);
    expect(summary.batches).toBe(3);
    expect(summary.capped).toBe(false);
  });

  it("caps at PRUNE_MAX_BATCHES and reports capped: true", async () => {
    mockPruneBatch.mockResolvedValue(PRUNE_BATCH_SIZE); // every batch full
    const summary = await runRetentionPrune(1);
    expect(mockPruneBatch).toHaveBeenCalledTimes(PRUNE_MAX_BATCHES);
    expect(summary.batches).toBe(PRUNE_MAX_BATCHES);
    expect(summary.deleted).toBe(PRUNE_BATCH_SIZE * PRUNE_MAX_BATCHES);
    expect(summary.capped).toBe(true);
  });

  it("uses the org's configured retention_months", async () => {
    mockSettings.mockResolvedValue({ organization_id: 9, retention_months: 36 });
    mockPruneBatch.mockResolvedValueOnce(0);
    await runRetentionPrune(9);
    expect(mockCutoff).toHaveBeenCalledWith(36);
    expect(mockPruneBatch).toHaveBeenCalledWith(9, 36, PRUNE_BATCH_SIZE);
  });
});

describe("runRetentionPruneAllOrgs", () => {
  it("prunes every org and isolates a failing org", async () => {
    mockAllOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockSettings.mockImplementation(async (orgId: number) => {
      if (orgId === 2) throw new Error("boom");
      return { organization_id: orgId, retention_months: 25 };
    });
    mockPruneBatch.mockResolvedValue(0);
    await expect(runRetentionPruneAllOrgs()).resolves.toBeUndefined();
    // org 1 and 3 still pruned despite org 2 failing
    expect(mockPruneBatch).toHaveBeenCalledWith(1, 25, PRUNE_BATCH_SIZE);
    expect(mockPruneBatch).toHaveBeenCalledWith(3, 25, PRUNE_BATCH_SIZE);
  });

  it("skips orgs with undefined/null ids", async () => {
    mockAllOrgs.mockResolvedValue([{ id: undefined }, { id: 5 }]);
    mockPruneBatch.mockResolvedValue(0);
    await runRetentionPruneAllOrgs();
    expect(mockPruneBatch).toHaveBeenCalledTimes(1);
    expect(mockPruneBatch).toHaveBeenCalledWith(5, 25, PRUNE_BATCH_SIZE);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Servers && npx jest --testPathPatterns=mrmRetentionPrune --testPathIgnorePatterns=/tests/integration/`
Expected: FAIL — `Cannot find module '../mrmRetentionPrune'`.

- [ ] **Step 3: Write the action**

Write `Servers/services/automations/actions/mrmRetentionPrune.ts`:

```typescript
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import { getMrmOrgSettings } from "../../../utils/mrmSettings.utils";
import {
  getRetentionCutoffQuery,
  pruneMetricsBatchQuery,
} from "../../../utils/mrmRetention.utils";
import logger from "../../../utils/logger/fileLogger";

/**
 * MRM (Model Risk Management) — daily metric-retention prune.
 *
 * Removes benign (never warn/breach) mrm_metrics points older than the org's
 * retention window (mrm_org_settings.retention_months, default 25). Points
 * with any warn/breach evaluation are NEVER deleted — the examiner audit
 * trail is untouchable (see utils/mrmRetention.utils.ts for the guard).
 *
 * Batched (10k/batch) and capped (500 batches/run) so a pathological first
 * purge is bounded; the daily job picks up any remainder next day. Idempotent
 * — re-running only deletes what is now past cutoff.
 */

export const PRUNE_BATCH_SIZE = 10_000;
export const PRUNE_MAX_BATCHES = 500;

export interface RetentionPruneSummary {
  organization_id: number;
  cutoff: string;
  deleted: number;
  batches: number;
  capped: boolean;
}

/** Prune one org. */
export async function runRetentionPrune(organizationId: number): Promise<RetentionPruneSummary> {
  const settings = await getMrmOrgSettings(organizationId);
  const cutoff = await getRetentionCutoffQuery(settings.retention_months);

  let deleted = 0;
  let batches = 0;
  let capped = false;

  for (;;) {
    if (batches >= PRUNE_MAX_BATCHES) {
      capped = true;
      break;
    }
    const n = await pruneMetricsBatchQuery(
      organizationId,
      settings.retention_months,
      PRUNE_BATCH_SIZE,
    );
    batches += 1;
    deleted += n;
    if (n < PRUNE_BATCH_SIZE) {
      break;
    }
  }

  return { organization_id: organizationId, cutoff, deleted, batches, capped };
}

/**
 * Prune every org — the BullMQ daily job entry point. Isolated per org so one
 * org's failure cannot block the others (mirrors runRevalidationSweepAllOrgs).
 */
export async function runRetentionPruneAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const summary = await runRetentionPrune(org.id);
      if (summary.deleted > 0 || summary.capped) {
        logger.info(
          `MRM retention prune org ${org.id}: deleted=${summary.deleted} batches=${summary.batches} capped=${summary.capped} cutoff=${summary.cutoff}`,
        );
      }
    } catch (error) {
      logger.error(`❌ MRM retention prune failed for org ${org.id}:`, error);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Servers && npx jest --testPathPatterns=mrmRetentionPrune --testPathIgnorePatterns=/tests/integration/`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/automations/actions/mrmRetentionPrune.ts Servers/services/automations/actions/__tests__/mrmRetentionPrune.test.ts
git commit -m "feat(mrm): daily retention prune action with batched, capped, audit-safe loop"
```

---

### Task 4: BullMQ wiring (producer + jobs registry + worker dispatch)

**Files:**
- Modify: `Servers/services/automations/automationProducer.ts` (add scheduler after `scheduleMrmRevalidationSweep`, ~line 227)
- Modify: `Servers/jobs/producer.ts` (import + call in `addAllJobs`)
- Modify: `Servers/services/automations/automationWorker.ts` (import ~line 26, dispatch ~line 525)

**Interfaces:**
- Consumes: `runRetentionPruneAllOrgs` (Task 3), `automationQueue` (existing).
- Produces: repeatable job named `mrm_retention_prune`, daily at 03:00.

- [ ] **Step 1: Add the scheduler to `automationProducer.ts`**

Insert directly after the closing brace of `scheduleMrmRevalidationSweep()` (line 227):

```typescript
export async function scheduleMrmRetentionPrune() {
  logger.info("Adding MRM metric retention prune job to the queue...");
  // Daily at 3 AM (the revalidation sweep runs at 4 AM — kept distinct). Prunes
  // benign aged-out mrm_metrics points per org; warn/breach history is never
  // deleted. No obliterate here — the repeatable add is idempotent by repeat key.
  await automationQueue.add(
    "mrm_retention_prune",
    { type: "mrm_retention" },
    {
      repeat: { pattern: "0 3 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}
```

- [ ] **Step 2: Register in `Servers/jobs/producer.ts`**

Add `scheduleMrmRetentionPrune,` to the import block from `../services/automations/automationProducer` (after `scheduleMrmRevalidationSweep,` on line 16), and in `addAllJobs()` add after line 32:

```typescript
  await scheduleMrmRetentionPrune(); // non-obliterating — safe to run after the obliterating schedulers
```

- [ ] **Step 3: Dispatch in `automationWorker.ts`**

Add the import next to the sweep import (line 26):

```typescript
import { runRetentionPruneAllOrgs } from "./actions/mrmRetentionPrune";
```

Add the dispatch branch directly after the `mrm_revalidation_sweep` branch (after line 525):

```typescript
        } else if (name === "mrm_retention_prune") {
          await runRetentionPruneAllOrgs();
```

- [ ] **Step 4: Build to verify compilation**

Run: `cd Servers && npm run build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/automations/automationProducer.ts Servers/jobs/producer.ts Servers/services/automations/automationWorker.ts
git commit -m "feat(mrm): schedule daily retention prune via BullMQ (0 3 * * *)"
```

---

### Task 5: Settings endpoints — GET/PUT `/api/mrm/settings`

**Files:**
- Create: `Servers/controllers/mrmSettings.ctrl.ts`
- Modify: `Servers/routes/mrm.route.ts` (import + two routes)
- Modify (generated): `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` via generators

**Interfaces:**
- Consumes: `getMrmOrgSettings` / `upsertMrmOrgSettings` / `MIN_RETENTION_MONTHS` (Task 2).
- Produces (Task 7 frontend relies on): `GET /api/mrm/settings` → `STATUS_CODE[200]({ organization_id, retention_months })`; `PUT /api/mrm/settings` body `{ retention_months: number }` → 200 with the updated row, or 400 when not an integer ≥ 13.

- [ ] **Step 1: Write `Servers/controllers/mrmSettings.ctrl.ts`**

```typescript
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import {
  getMrmOrgSettings,
  MIN_RETENTION_MONTHS,
  upsertMrmOrgSettings,
} from "../utils/mrmSettings.utils";

const FILE = "mrmSettings.ctrl.ts";

function fail(req: Request, res: Response, fn: string, msg: string, error: unknown) {
  logStructured("error", msg, fn, FILE);
  logger.error(`❌ Error in ${fn}:`, error);
  const status = error instanceof CustomException ? error.statusCode : 500;
  if (status >= 500) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
  const body = (STATUS_CODE as any)[status]
    ? (STATUS_CODE as any)[status](translateError(req, error))
    : STATUS_CODE[400](translateError(req, error));
  return res.status(status).json(body);
}

export async function getMrmSettingsHandler(req: Request, res: Response) {
  const fn = "getMrmSettingsHandler";
  logStructured("processing", "fetching MRM settings", fn, FILE);
  try {
    const settings = await getMrmOrgSettings(req.organizationId!);
    logStructured("successful", "MRM settings retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve MRM settings", error);
  }
}

export async function updateMrmSettingsHandler(req: Request, res: Response) {
  const fn = "updateMrmSettingsHandler";
  logStructured("processing", "updating MRM settings", fn, FILE);
  try {
    const { retention_months } = req.body ?? {};
    if (!Number.isInteger(retention_months) || retention_months < MIN_RETENTION_MONTHS) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!("Retention must be an integer of at least 13 months"),
          ),
        );
    }
    const settings = await upsertMrmOrgSettings(req.organizationId!, retention_months);
    logStructured("successful", "MRM settings updated", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return fail(req, res, fn, "failed to update MRM settings", error);
  }
}
```

- [ ] **Step 2: Add the routes to `Servers/routes/mrm.route.ts`**

Add the import after the `mrmRevalidation.ctrl` import block:

```typescript
import {
  getMrmSettingsHandler,
  updateMrmSettingsHandler,
} from "../controllers/mrmSettings.ctrl";
```

Add the routes at the end of the file, before `export default router;`:

```typescript
// ===========================================================================
// Org-wide MRM settings (metric retention)
// ===========================================================================

// Missing row resolves to defaults (retention_months = 25); floor is 13 months.
router.get("/settings", authenticateJWT, getMrmSettingsHandler);
router.put("/settings", authenticateJWT, updateMrmSettingsHandler);
```

- [ ] **Step 3: Regenerate API docs and verify no drift**

Run: `cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`
Expected: both generators write files; drift check exits 0.

- [ ] **Step 4: Build**

Run: `cd Servers && npm run build`
Expected: exits 0.

- [ ] **Step 5: Commit (include generated files)**

```bash
git add Servers/controllers/mrmSettings.ctrl.ts Servers/routes/mrm.route.ts Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "feat(mrm): GET/PUT /api/mrm/settings for metric retention config"
```

---

### Task 6: Tenant-isolation integration tests (real Postgres — SQL behaviour proof)

**Files:**
- Test: `Servers/tests/integration/tenant-isolation/mrm-retention.isolation.test.ts`

**Interfaces:**
- Consumes: `runRetentionPrune` (Task 3), `getMrmOrgSettings`/`upsertMrmOrgSettings` (Task 2), factories `createTestModelInventory`, `createTestMrmMetric`, `createTestMrmMetricEvaluation` (existing, from `../../factories`), `seedTwoTenantContexts` harness, `cleanupDatabase` helper.
- Produces: proof of the audit-trail guard, wedge regression, org isolation, and settings scoping.

- [ ] **Step 1: Write the failing/verifying test suite**

Write `Servers/tests/integration/tenant-isolation/mrm-retention.isolation.test.ts`:

```typescript
jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  createTestModelInventory,
  createTestMrmMetric,
  createTestMrmMetricEvaluation,
} from "../../factories";
import { runRetentionPrune } from "../../../services/automations/actions/mrmRetentionPrune";
import {
  getMrmOrgSettings,
  upsertMrmOrgSettings,
} from "../../../utils/mrmSettings.utils";

/**
 * MRM metric retention — tenant isolation + audit-trail guard.
 *
 * The prune must (a) stay inside the caller's org, (b) never delete a point
 * with a warn/breach evaluation (the examiner audit trail), (c) not wedge
 * when protected points are older than prunable ones, and (d) settings must
 * be org-scoped with a defaults fallback.
 */

// Old enough to be past any retention window in these tests.
const ANCIENT = "2020-01-15T00:00:00Z";
// Recent enough to always be inside the window.
const RECENT = new Date().toISOString();

const metricIds = async (orgId: number): Promise<number[]> => {
  const rows = (await sequelize.query(
    `SELECT id FROM mrm_metrics WHERE organization_id = :orgId ORDER BY id`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as { id: number }[];
  return rows.map((r) => r.id);
};

const evalCountForMetric = async (metricId: number): Promise<number> => {
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM mrm_metric_evaluations WHERE metric_id = :metricId`,
    { replacements: { metricId }, type: QueryTypes.SELECT },
  )) as { n: number }[];
  return rows[0].n;
};

describe("MRM retention tenant isolation + audit guard", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns defaults when no settings row exists and scopes upserts per org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();

    const before = await getMrmOrgSettings(owner.orgId);
    expect(before.retention_months).toBe(25);

    await upsertMrmOrgSettings(owner.orgId, 36);
    const ownerAfter = await getMrmOrgSettings(owner.orgId);
    expect(ownerAfter.retention_months).toBe(36);

    // The other org still sees defaults — settings are org-scoped.
    const attackerView = await getMrmOrgSettings(attacker.orgId);
    expect(attackerView.retention_months).toBe(25);
  });

  it("prunes an aged benign point (and its ok evals) but keeps recent points", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    const oldBenign = await createTestMrmMetric(owner.orgId, modelId, { at: ANCIENT });
    await createTestMrmMetricEvaluation(owner.orgId, oldBenign, { status: "ok" });
    const recentBenign = await createTestMrmMetric(owner.orgId, modelId, {
      at: RECENT,
      metric: "auc",
    });
    await createTestMrmMetricEvaluation(owner.orgId, recentBenign, { status: "ok" });

    const summary = await runRetentionPrune(owner.orgId);

    expect(summary.deleted).toBe(1);
    const remaining = await metricIds(owner.orgId);
    expect(remaining).toEqual([recentBenign]);
    // CASCADE removed the pruned point's ok-eval rows.
    expect(await evalCountForMetric(oldBenign)).toBe(0);
  });

  it("NEVER deletes aged points with warn or breach evaluations", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    const oldWarn = await createTestMrmMetric(owner.orgId, modelId, { at: ANCIENT });
    await createTestMrmMetricEvaluation(owner.orgId, oldWarn, { status: "warn" });
    const oldBreach = await createTestMrmMetric(owner.orgId, modelId, {
      at: ANCIENT,
      metric: "auc",
    });
    await createTestMrmMetricEvaluation(owner.orgId, oldBreach, { status: "breach" });
    // A point with BOTH an ok and a breach eval is protected too.
    const oldMixed = await createTestMrmMetric(owner.orgId, modelId, {
      at: ANCIENT,
      metric: "gini",
    });
    await createTestMrmMetricEvaluation(owner.orgId, oldMixed, { status: "ok" });
    await createTestMrmMetricEvaluation(owner.orgId, oldMixed, { status: "breach" });

    const summary = await runRetentionPrune(owner.orgId);

    expect(summary.deleted).toBe(0);
    const remaining = await metricIds(owner.orgId);
    expect(remaining).toEqual([oldWarn, oldBreach, oldMixed].sort((a, b) => a - b));
    // Their evaluation audit rows survive intact.
    expect(await evalCountForMetric(oldWarn)).toBe(1);
    expect(await evalCountForMetric(oldBreach)).toBe(1);
    expect(await evalCountForMetric(oldMixed)).toBe(2);
  });

  it("wedge regression: protected points OLDER than benign ones do not block pruning", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);

    // Protected point is the OLDEST row (earliest at, smallest id).
    const protectedOldest = await createTestMrmMetric(owner.orgId, modelId, {
      at: "2019-01-01T00:00:00Z",
    });
    await createTestMrmMetricEvaluation(owner.orgId, protectedOldest, { status: "breach" });
    // Benign point is newer than the protected one but still past cutoff.
    const benignNewer = await createTestMrmMetric(owner.orgId, modelId, {
      at: ANCIENT,
      metric: "auc",
    });
    await createTestMrmMetricEvaluation(owner.orgId, benignNewer, { status: "ok" });

    const summary = await runRetentionPrune(owner.orgId);

    // The benign point is pruned even though a protected point precedes it —
    // the guard lives inside the batch window, so protected rows never clog it.
    expect(summary.deleted).toBe(1);
    expect(await metricIds(owner.orgId)).toEqual([protectedOldest]);
  });

  it("org A's prune never touches org B's data", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerModel = await createTestModelInventory(owner.orgId);
    const attackerModel = await createTestModelInventory(attacker.orgId);

    const ownerOld = await createTestMrmMetric(owner.orgId, ownerModel, { at: ANCIENT });
    await createTestMrmMetricEvaluation(owner.orgId, ownerOld, { status: "ok" });
    const attackerOld = await createTestMrmMetric(attacker.orgId, attackerModel, {
      at: ANCIENT,
    });
    await createTestMrmMetricEvaluation(attacker.orgId, attackerOld, { status: "ok" });

    const summary = await runRetentionPrune(owner.orgId);

    expect(summary.deleted).toBe(1);
    expect(await metricIds(owner.orgId)).toEqual([]);
    // The attacker org's identical aged benign point is untouched.
    expect(await metricIds(attacker.orgId)).toEqual([attackerOld]);
  });
});
```

- [ ] **Step 2: Run the suite against live Postgres**

Run: `cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --testPathPatterns=mrm-retention --runInBand`
Expected: PASS — 5 tests. (globalSetup creates the test DB and runs all migrations including Task 1's; if a previous run failed mid-migration, drop the test DB first.)

- [ ] **Step 3: Run the full unit suite to check for regressions**

Run: `cd Servers && npm run test:unit`
Expected: PASS (3360+ existing tests + the 6 from Task 3).

- [ ] **Step 4: Commit**

```bash
git add Servers/tests/integration/tenant-isolation/mrm-retention.isolation.test.ts
git commit -m "test(mrm): retention isolation suite — audit guard, wedge regression, org scoping"
```

---

### Task 7: Frontend — retention section in MRM Settings + i18n

**Files:**
- Modify: `Clients/src/domain/interfaces/i.mrm.ts` (add `IMrmOrgSettings`)
- Modify: `Clients/src/application/repository/mrm.repository.ts` (two functions)
- Modify: `Clients/src/application/hooks/useMrm.ts` (query key + two hooks)
- Create: `Clients/src/presentation/pages/ModelInventory/mrm/RetentionSection.tsx`
- Modify: `Clients/src/presentation/pages/ModelInventory/mrm/SettingsTab.tsx` (sixth SectionNav item + render)
- Modify: `Clients/src/i18n/translations.ts` (de/fr/es entries for the new strings)

**Interfaces:**
- Consumes: `GET/PUT /api/mrm/settings` (Task 5) returning `{ organization_id, retention_months }` at `response.data.data`.
- Produces: `IMrmOrgSettings`, `getMrmSettings(signal?)`, `updateMrmSettings(retention_months)`, `useMrmSettings()`, `useUpdateMrmSettings()`, `RetentionSection` component.

- [ ] **Step 1: Add the domain interface**

In `Clients/src/domain/interfaces/i.mrm.ts`, add at the end:

```typescript
export interface IMrmOrgSettings {
  organization_id: number;
  retention_months: number;
}
```

- [ ] **Step 2: Add repository functions**

In `Clients/src/application/repository/mrm.repository.ts`, add `IMrmOrgSettings` to the interface import block, then add at the end of the file:

```typescript
// ---- Org-wide MRM settings (metric retention) ----

export async function getMrmSettings(signal?: AbortSignal): Promise<IMrmOrgSettings> {
  const response = await apiServices.get("/mrm/settings", { signal });
  return (response.data as { data: IMrmOrgSettings }).data;
}

export async function updateMrmSettings(retention_months: number): Promise<IMrmOrgSettings> {
  const response = await apiServices.put("/mrm/settings", { retention_months });
  return (response.data as { data: IMrmOrgSettings }).data;
}
```

- [ ] **Step 3: Add hooks**

In `Clients/src/application/hooks/useMrm.ts`: add `getMrmSettings, updateMrmSettings` to the repository import block, `IMrmOrgSettings` to the interfaces import. In `mrmQueryKeys`, add:

```typescript
  settings: () => [...mrmQueryKeys.all, "settings"] as const,
```

At the end of the file, add:

```typescript
// ---- Org-wide MRM settings (metric retention) ----

export const useMrmSettings = (): UseQueryResult<IMrmOrgSettings, Error> =>
  useQuery({
    queryKey: mrmQueryKeys.settings(),
    queryFn: async ({ signal }) => await getMrmSettings(signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useUpdateMrmSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (retention_months: number) => await updateMrmSettings(retention_months),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.settings() });
    },
  });
};
```

- [ ] **Step 4: Write `RetentionSection.tsx`**

Write `Clients/src/presentation/pages/ModelInventory/mrm/RetentionSection.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import { useMrmSettings, useUpdateMrmSettings } from "../../../../application/hooks/useMrm";
import { mrmErrorMessage } from "./constants";
import { mrmSectionIntroStyle } from "./mrmStyles";

interface RetentionSectionProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const MIN_RETENTION_MONTHS = 13;

const RetentionSection = ({ onError, onSuccess }: RetentionSectionProps) => {
  const { data: settings } = useMrmSettings();
  const updateSettings = useUpdateMrmSettings();
  const [months, setMonths] = useState<string>("");

  // Seed the input from the loaded settings; keep user edits afterwards.
  useEffect(() => {
    if (settings) setMonths(String(settings.retention_months));
  }, [settings]);

  const handleSave = async () => {
    const parsed = Number(months);
    if (!Number.isInteger(parsed) || parsed < MIN_RETENTION_MONTHS) {
      onError("Retention must be at least 13 months");
      return;
    }
    try {
      await updateSettings.mutateAsync(parsed);
      onSuccess("Retention saved");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to save retention"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Benign monitoring points older than the retention window are removed by a daily job.
        Breach and evaluation history is never deleted.
      </Typography>

      <Box sx={{ maxWidth: "360px", marginBottom: "16px" }}>
        <Field
          id="mrm-retention-months"
          type="number"
          label="Monitoring data retention (months)"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          helperText="Breach and evaluation history is always retained; this only ages out benign monitoring points."
        />
      </Box>

      <CustomizableButton
        variant="contained"
        text="Save retention"
        onClick={handleSave}
        isDisabled={updateSettings.isPending}
        testId="mrm-save-retention-btn"
      />
    </Box>
  );
};

export default RetentionSection;
```

- [ ] **Step 5: Register the section in `SettingsTab.tsx`**

In `Clients/src/presentation/pages/ModelInventory/mrm/SettingsTab.tsx`:

1. Add `Archive` to the lucide import: `import { Rss, Layers, SlidersHorizontal, Bell, Users, Archive } from "lucide-react";`
2. Add the import: `import RetentionSection from "./RetentionSection";`
3. Extend the section type: `type SettingsSection = "metrics-feed" | "tiering-rules" | "default-thresholds" | "alerts" | "roles" | "retention";`
4. Append to `SECTION_ITEMS` (after the `roles` entry):

```tsx
  {
    key: "retention",
    slug: "retention",
    label: "Data retention",
    icon: <Archive size={16} strokeWidth={1.5} />,
  },
```

5. Add the render branch after the `roles` branch:

```tsx
        {section === "retention" && (
          <RetentionSection onError={onError} onSuccess={onSuccess} />
        )}
```

- [ ] **Step 6: Add de/fr/es translations**

In `Clients/src/i18n/translations.ts`, add each of the following English-source keys to the `de`, `fr`, and `es` dictionaries (place near the existing MRM/settings strings in each dictionary). `"Data retention"` already exists in all languages — do NOT duplicate it.

| English (key) | de | fr | es |
|---|---|---|---|
| `Monitoring data retention (months)` | `Aufbewahrung von Überwachungsdaten (Monate)` | `Rétention des données de surveillance (mois)` | `Retención de datos de monitoreo (meses)` |
| `Breach and evaluation history is always retained; this only ages out benign monitoring points.` | `Verstoß- und Bewertungshistorie wird immer aufbewahrt; hiermit werden nur unauffällige Überwachungspunkte ausgesondert.` | `L'historique des dépassements et des évaluations est toujours conservé ; seuls les points de surveillance sans incident sont purgés.` | `El historial de incumplimientos y evaluaciones siempre se conserva; esto solo depura puntos de monitoreo sin incidencias.` |
| `Benign monitoring points older than the retention window are removed by a daily job. Breach and evaluation history is never deleted.` | `Unauffällige Überwachungspunkte, die älter als das Aufbewahrungsfenster sind, werden durch einen täglichen Job entfernt. Verstoß- und Bewertungshistorie wird nie gelöscht.` | `Les points de surveillance sans incident plus anciens que la fenêtre de rétention sont supprimés par une tâche quotidienne. L'historique des dépassements et des évaluations n'est jamais supprimé.` | `Los puntos de monitoreo sin incidencias anteriores a la ventana de retención se eliminan mediante una tarea diaria. El historial de incumplimientos y evaluaciones nunca se elimina.` |
| `Save retention` | `Aufbewahrung speichern` | `Enregistrer la rétention` | `Guardar retención` |
| `Retention saved` | `Aufbewahrung gespeichert` | `Rétention enregistrée` | `Retención guardada` |
| `Failed to save retention` | `Aufbewahrung konnte nicht gespeichert werden` | `Échec de l'enregistrement de la rétention` | `No se pudo guardar la retención` |
| `Retention must be at least 13 months` | `Die Aufbewahrung muss mindestens 13 Monate betragen` | `La rétention doit être d'au moins 13 mois` | `La retención debe ser de al menos 13 meses` |

- [ ] **Step 7: Run the full frontend gate set**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check`
Expected: all exit 0. If `format-check` flags the new files, run `npm run format` and re-check. If `i18n:audit:strict` flags a missing string, add exactly that string to the three dictionaries.

- [ ] **Step 8: Build**

Run: `cd Clients && npm run build`
Expected: build completes.

- [ ] **Step 9: Commit**

```bash
git add Clients/src/domain/interfaces/i.mrm.ts Clients/src/application/repository/mrm.repository.ts Clients/src/application/hooks/useMrm.ts Clients/src/presentation/pages/ModelInventory/mrm/RetentionSection.tsx Clients/src/presentation/pages/ModelInventory/mrm/SettingsTab.tsx Clients/src/i18n/translations.ts
git commit -m "feat(mrm): data retention section in MRM settings (de/fr/es)"
```

---

### Task 8: Final gates + docs touch-up

**Files:**
- Modify: `docs/technical/domains/mrm.md` (retention row in the DB table + one backend paragraph + fix stale "Not yet merged" status line)

**Interfaces:**
- Consumes: everything above.
- Produces: a PR-ready branch.

- [ ] **Step 1: Update the as-built doc**

In `docs/technical/domains/mrm.md`:
1. Replace the status line `> **Status:** Built, PR #4228 (branch \`feat/mrm-revalidation\` → \`develop\`). Not yet merged.` with `> **Status:** Merged (PR #4228, 2026-07-04). Metric retention added on \`feat/mrm-retention\`.`
2. Add a row to the Database table after the `mrm_revalidation_events` row:

```markdown
| `mrm_org_settings` | org-wide MRM config | `retention_months` (default 25, CHECK ≥ 13); one row per org, lazily created — missing row = defaults |
```

3. Add a paragraph at the end of the Backend section:

```markdown
**Metric retention** (`utils/mrmRetention.utils.ts`, `services/automations/actions/mrmRetentionPrune.ts`)
— daily BullMQ job (03:00) prunes benign aged-out `mrm_metrics` points per org
(batched 10k, capped 500 batches/run). **A point with any warn/breach evaluation
is never deleted** — the NOT EXISTS guard lives inside the batch-window subquery
(guard-outside would let protected rows clog the window and wedge the loop).
Config via `GET/PUT /api/mrm/settings` (floor 13 months); UI in Settings → Data retention.
```

4. Update the `> **Last Updated:**` date to 2026-07-10.

- [ ] **Step 2: Full backend gate**

Run: `cd Servers && npm run build && npm run test:unit`
Expected: build 0, all unit tests pass.

- [ ] **Step 3: Full frontend gate**

Run: `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build`
Expected: all exit 0.

- [ ] **Step 4: Server format check**

Run: `cd Servers && npm run format-check || npm run format`
Expected: clean (run `npm run format` and re-stage if it reports issues).

- [ ] **Step 5: Commit docs + push branch**

```bash
git add docs/technical/domains/mrm.md
git commit -m "docs(mrm): retention job + mrm_org_settings in as-built doc"
git push -u origin feat/mrm-retention
```

Expected: branch pushed. **Do NOT open a PR — that requires explicit user approval.**
