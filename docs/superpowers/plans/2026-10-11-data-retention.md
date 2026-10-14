# Data Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Admin can see and set how long every kind of log is kept from Settings → Data retention, and audit records can be pruned on a schedule without breaking audit ledger verification.

**Architecture:** A per-org audit retention setting (new table) drives a daily BullMQ job that deletes old rows from the audit tables; the hash-chained ledger is cut only from its oldest end, each cut leaves an append-only checkpoint that `verifyChain` starts from, and a narrowed delete trigger allows only those cuts. The AI Gateway gets an opt-in automatic purge. A new Admin-only settings tab aggregates every retention setting through one read endpoint and saves through each feature's own API.

**Tech Stack:** Express 4 + Sequelize raw SQL (PostgreSQL), BullMQ, Jest (unit + real-DB integration); FastAPI + SQLAlchemy + Alembic, pytest; React 19, MUI 7, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-data-retention-design.md`

## Global Constraints

- Only Admins change organization-wide retention periods (per-file evidence retention keeps today's permissions: project members and the file's owner). Server-side checks: `authorize("organization.admin")` on new routes; role check `req.role === "Admin" || req.role === "SuperAdmin"` inside existing handlers; gateway `require_admin`. Error text: "Only admins can change retention periods".
- Audit record periods (months): `null` (keep indefinitely, the default), 12, 24, 36, 60, 84, 120. Anything else is a 400.
- AI Gateway automatic deletion is off by default. Shipping this deletes nothing until an Admin turns something on.
- Ledger rows are deleted only as a contiguous oldest prefix per org, under `pg_advisory_xact_lock(9001, orgId)`, never the newest row, always with a checkpoint inserted first in the same transaction.
- Every transaction opened by the job calls `SELECT set_config('app.current_org', :orgId, true)`.
- Batch size 10,000; cap 500 batches per table per org per run.
- Migrations use the `verifywise.` schema prefix in DDL; plain `CREATE INDEX IF NOT EXISTS` (no CONCURRENTLY: migrations run at container start).
- New tables with `organization_id`: entry in `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts` plus an isolation test file, or CI's coverage script fails.
- New real-DB test files outside `tenant-isolation/` must be added to the allow-list regex in `.github/workflows/backend-checks.yml` (~line 180).
- Sentence case UI text; 30px control height; border `#d0d5dd`, radius 4px, primary `#13715B`; house components (`StandardModal`, `CustomizableButton`, `Select`, `Field`, `Toggle`). Every new string needs de/fr/es in `Clients/src/i18n/translations.ts`.
- Server response messages go through `req.t!(...)` like their neighbors, and every new message gets de/fr entries in `Servers/locales/*.json` (`cd Servers && npm run i18n:audit:strict` is a CI gate).
- Gates from package dirs: `cd Servers && npm run build && npm run format-check && npm run i18n:audit:strict && npm run test`; integration: `npm run test:integration -- --testPathPatterns=<file>` (needs `Servers/.env.test`); after route changes `npm run generate:swagger && npm run generate:endpoints`. `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npx vitest run <changed dirs>`. AIGateway: `cd AIGateway && python -m pytest tests/<file> -q`.
- No competitor names anywhere; commit format `type(scope): description` with a body.

## Review Focus

1. A ledger pruned in several batches across several days still verifies `intact`, and appends made between batches link correctly.
2. A DELETE on `audit_ledger` without the job's flag, or above the latest checkpoint, is rejected even for rows older than the cutoff.
3. A ledger whose every row is older than the cutoff keeps its newest row, and the next append still verifies.
4. A non-Admin cannot change any organization-wide retention period through any API (MRM `retention_months`, audit records, gateway, evidence org default), while their other edits on those endpoints, and per-file evidence retention, keep working.
5. Saving one AI Gateway retention value from the Data retention tab leaves every other guardrail setting unchanged.

---

### Task 1: Schema — settings, runs, checkpoints, delete trigger, indexes

**Files:**
- Create: `Servers/database/migrations/20261011150000-data-retention-tables.js`
- Create: `Servers/database/migrations/20261011150100-audit-ledger-retention-delete-trigger.js`
- Create: `Servers/database/migrations/20261011150200-retention-timestamp-indexes.js`
- Modify: `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts`
- Create: `Servers/tests/integration/audit-ledger-retention.test.ts` (trigger part; Task 2 extends it)
- Modify: `.github/workflows/backend-checks.yml` (allow-list regex: add `audit-ledger-retention`)

**Interfaces:**
- Produces tables `data_retention_settings`, `data_retention_runs`, `audit_ledger_retention_checkpoints`; GUC `verifywise.ledger_retention`.

- [ ] **Step 1: Tables migration** (`20261011150000-data-retention-tables.js`), one transaction:

```sql
CREATE TABLE IF NOT EXISTS verifywise.data_retention_settings (
  organization_id INTEGER PRIMARY KEY REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
  audit_retention_months INTEGER NULL CHECK (audit_retention_months IN (12, 24, 36, 60, 84, 120)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER NULL REFERENCES verifywise.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS verifywise.data_retention_runs (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
  record_type VARCHAR(40) NOT NULL CHECK (record_type IN (
    'audit_records', 'ai_gateway_guardrail_logs', 'ai_gateway_spend_logs', 'mrm_metrics',
    'shadow_ai_events', 'shadow_ai_daily_rollups', 'shadow_ai_alert_history')),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cutoff TIMESTAMPTZ NULL,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL CHECK (status IN ('success', 'capped', 'failed')),
  error TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_data_retention_runs_org_type_ran
  ON verifywise.data_retention_runs (organization_id, record_type, ran_at DESC);

CREATE TABLE IF NOT EXISTS verifywise.audit_ledger_retention_checkpoints (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
  pruned_through_id BIGINT NOT NULL,
  anchor_hash CHAR(64) NOT NULL,
  cutoff TIMESTAMPTZ NOT NULL,
  rows_deleted INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_checkpoints_org_through
  ON verifywise.audit_ledger_retention_checkpoints (organization_id, pruned_through_id DESC);

CREATE OR REPLACE FUNCTION verifywise.ledger_checkpoint_append_only()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM verifywise.organizations WHERE id = OLD.organization_id) THEN
    RETURN OLD;  -- organization cascade
  END IF;
  RAISE EXCEPTION 'audit_ledger_retention_checkpoints is append-only';
END;
$func$;
CREATE TRIGGER trg_ledger_checkpoint_no_update BEFORE UPDATE ON verifywise.audit_ledger_retention_checkpoints
  FOR EACH ROW EXECUTE FUNCTION verifywise.ledger_checkpoint_append_only();
CREATE TRIGGER trg_ledger_checkpoint_no_delete BEFORE DELETE ON verifywise.audit_ledger_retention_checkpoints
  FOR EACH ROW EXECUTE FUNCTION verifywise.ledger_checkpoint_append_only();
```

Down: drop triggers, function, tables (reverse order).

- [ ] **Step 2: Delete trigger migration** (`20261011150100-...`). Up replaces the function (the trigger `trg_audit_ledger_no_delete` already calls it — confirm with `\d verifywise.audit_ledger` / `20260226234302-tenant-tables.js:2114-2186` and keep the trigger as is):

```sql
CREATE OR REPLACE FUNCTION verifywise.audit_ledger_prevent_delete()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  -- Organization cascade (unchanged from 20260326204836).
  IF NOT EXISTS (SELECT 1 FROM verifywise.organizations WHERE id = OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  -- Retention job: flagged transaction, and only rows covered by a checkpoint.
  IF current_setting('verifywise.ledger_retention', true) = 'on'
     AND OLD.id <= (SELECT MAX(c.pruned_through_id)
                      FROM verifywise.audit_ledger_retention_checkpoints c
                     WHERE c.organization_id = OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'DELETE on audit_ledger is prohibited — append-only table';
END;
$func$;
```

Down restores the exact function body from `20260326204836-audit-ledger-allow-user-nullify.js` (organization cascade only).

- [ ] **Step 3: Index migration** (`20261011150200-...`). For each `{table, col}` below, `CREATE INDEX IF NOT EXISTS idx_<table>_org_<col> ON verifywise.<table> (organization_id, <col>)`, skipped when `to_regclass('verifywise.<table>') IS NULL` (do it in a `DO $$ ... $$` block per table). Header comment copies the no-CONCURRENTLY reason from `20261011120000-add-audit-ledger-org-id-index.js`. Down drops each `IF EXISTS`.
  - `changed_at`: vendor, vendor_risk, project_risk, policy, incident, use_case, model_inventory, model_risk, file, task, training `_change_history`, `dataset_change_histories`, fria_change_history, project_change_history, framework_change_history, evidence_hub_change_history (the last three may not exist).
  - `event_logs.timestamp`, `file_access_logs.access_date`, `audit_ledger.occurred_at`.
  - Not here: `model_lifecycle_change_history` and `ai_action_audit_log` (already indexed), the two `ai_gateway_*_change_history` tables (Alembic, Task 5).

- [ ] **Step 4: Isolation registry entry only.** Add entries following the `file_org_settings` pattern: `{ name: "data_retention", tables: ["data_retention_settings", "data_retention_runs", "audit_ledger_retention_checkpoints"], baseRoute: "/api/data-retention", testFile: "data-retention.isolation.test.ts" }`. The isolation test file itself is written in Task 4, which creates the route it calls.

- [ ] **Step 5: Trigger integration tests** (`audit-ledger-retention.test.ts`, real DB, `jest.setTimeout(60000)`, helpers `createTestOrganization`/`cleanupDatabase`). Seed 5 ledger rows with `appendToAuditLedger`. Assert:
  - `DELETE FROM audit_ledger WHERE id = <first>` rejects with "append-only".
  - With `set_config('verifywise.ledger_retention','on',true)` but no checkpoint → rejected.
  - With a checkpoint `pruned_through_id = id2` in the same transaction and the flag on: deleting ids ≤ id2 succeeds; deleting id3 rejects.
  - `UPDATE`/`DELETE` on the checkpoint row rejects; deleting the organization cascades both tables.
  Add `audit-ledger-retention` to the allow-list regex in `backend-checks.yml`.

- [ ] **Step 6: Gates and commit.** Servers build/format/unit; run the new integration file; `npx ts-node scripts/auditTenantIsolationCoverage.ts` against the test DB. Commit `feat(retention): retention tables, checkpointed ledger delete rule, timestamp indexes`.

### Task 2: Ledger prune and checkpoint-aware verification

**Files:**
- Create: `Servers/utils/auditLedgerRetention.utils.ts`
- Modify: `Servers/utils/auditLedger.utils.ts` (`verifyChain`)
- Modify: `Servers/controllers/auditLedger.ctrl.ts` (verify response passes `prunedThrough`)
- Modify: `Servers/tests/integration/audit-ledger-retention.test.ts`
- Create: `Servers/utils/__tests__/auditLedgerRetention.utils.test.ts`

**Interfaces:**
- Produces:
  - `pruneAuditLedgerBatch(organizationId: number, cutoff: string, batchSize: number): Promise<number>` (rows deleted; `< batchSize` means done)
  - `getLatestLedgerCheckpoint(organizationId: number): Promise<{ pruned_through_id: number; anchor_hash: string; cutoff: string } | null>`
  - `VerifyChainResult.prunedThrough?: { id: number; cutoff: string }`
  - `AUDIT_LEDGER_LOCK_NS` exported from `auditLedger.utils.ts` (currently a module const).

- [ ] **Step 1: Prune, unit test first** (mock `sequelize.transaction`/`query`; assert lock, `set_config` for org and the flag, checkpoint insert before delete, delete bounded by `L`). Implementation:

```ts
export async function pruneAuditLedgerBatch(
  organizationId: number,
  cutoff: string,
  batchSize: number,
): Promise<number> {
  return sequelize.transaction(async (transaction) => {
    const q = (sql: string, replacements: Record<string, unknown>) =>
      sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction }) as Promise<any[]>;

    await q(`SELECT set_config('app.current_org', :org, true)`, { org: String(organizationId) });
    await q(`SELECT pg_advisory_xact_lock(:ns, :organizationId)`, {
      ns: AUDIT_LEDGER_LOCK_NS,
      organizationId,
    });

    // First id inside the retention period; with none, the newest id, so the newest row is kept.
    const [{ bound }] = await q(
      `SELECT COALESCE(
         (SELECT MIN(id) FROM audit_ledger WHERE organization_id = :organizationId AND occurred_at >= :cutoff),
         (SELECT MAX(id) FROM audit_ledger WHERE organization_id = :organizationId)
       ) AS bound`,
      { organizationId, cutoff },
    );
    if (bound === null) return 0;

    const [last] = await q(
      `SELECT id, entry_hash, (SELECT COUNT(*) FROM audit_ledger
                                WHERE organization_id = :organizationId AND id <= s.id)::int AS n
         FROM audit_ledger s
        WHERE s.id = (SELECT MAX(id) FROM (
                        SELECT id FROM audit_ledger
                         WHERE organization_id = :organizationId AND id < :bound
                         ORDER BY id ASC LIMIT :batchSize) b)`,
      { organizationId, bound, batchSize },
    );
    if (!last) return 0;

    await q(
      `INSERT INTO audit_ledger_retention_checkpoints
         (organization_id, pruned_through_id, anchor_hash, cutoff, rows_deleted)
       VALUES (:organizationId, :id, :hash, :cutoff, :n) RETURNING id`,
      { organizationId, id: last.id, hash: String(last.entry_hash).trim(), cutoff, n: last.n },
    );
    await q(`SELECT set_config('verifywise.ledger_retention', 'on', true)`, {});
    await sequelize.query(
      `DELETE FROM audit_ledger WHERE organization_id = :organizationId AND id <= :id`,
      { replacements: { organizationId, id: last.id }, transaction },
    );
    return last.n;
  });
}
```

Unit cases: no rows → 0 and no insert; all rows old → bound is the max id (newest kept); batch smaller than deletable rows → `L` is the batch's last id.

- [ ] **Step 2: `verifyChain` from the checkpoint, test first.** Read the latest checkpoint; start `prevHash` at its `anchor_hash` (trimmed) instead of `GENESIS_HASH`, and add `AND id > :prunedThroughId` (0 without a checkpoint) to the walk query. Return `prunedThrough: { id, cutoff }` on every status when a checkpoint exists. Unit tests: with checkpoint → first row linking to the anchor is `intact`; first row not linking → `compromised` at that id; without checkpoint behavior is unchanged (existing tests pass as is).

- [ ] **Step 3: Real-DB scenarios** in `audit-ledger-retention.test.ts`. Never back-date rows: `occurred_at` is part of the hash, so a back-dated row can never verify. Instead seed 20 rows, take `cutoff = (SELECT now()::text)` after a 50 ms pause, then seed 10 more; prune with that cutoff and batch 7 until done → 20 deleted over 3 batches, 3 checkpoints, `verifyChain` `intact` with `prunedThrough.id` = id20; append 2 more rows → still `intact`; all-old case keeps the newest row and a following append verifies; tampering the first remaining row's `description` → `compromised`.

- [ ] **Step 4: Controller.** `GET /audit-ledger/verify` returns `prunedThrough` as is. Update its controller test.

- [ ] **Step 5: Gates, commit** `feat(audit-ledger): prune from the oldest end with checkpoints; verify from the latest checkpoint`.

### Task 3: Daily retention job for audit records, run log, MRM and Shadow AI run recording

**Files:**
- Create: `Servers/utils/dataRetention.utils.ts` (settings read/write, table list, batch delete, runs)
- Create: `Servers/services/automations/actions/dataRetentionPrune.ts`
- Modify: `Servers/services/automations/automationProducer.ts`, `Servers/jobs/producer.ts`, `Servers/services/automations/automationWorker.ts`
- Modify: `Servers/services/automations/tests/automationProducer.spec.ts`
- Modify: `Servers/services/automations/actions/mrmRetentionPrune.ts`, `Servers/services/shadowAiAggregation.service.ts` (record runs)
- Create: `Servers/utils/__tests__/dataRetention.utils.test.ts`, `Servers/services/automations/actions/__tests__/dataRetentionPrune.test.ts`

**Interfaces:**
- Consumes: `pruneAuditLedgerBatch` (Task 2), `appendToAuditLedger`.
- Produces:
  - `AUDIT_RETENTION_MONTHS = [12, 24, 36, 60, 84, 120] as const`
  - `getAuditRetentionMonths(orgId): Promise<number | null>`, `setAuditRetentionMonths(orgId, months: number | null, userId): Promise<void>` (upsert)
  - `AUDIT_RECORD_TABLES: ReadonlyArray<{ table: string; timestampColumn: string }>`
  - `countAuditRecordsBefore(orgId, months): Promise<number>` (for Task 4's preview; ledger count uses the same bound rule as the prune)
  - `recordRetentionRun(row: { organizationId; recordType; cutoff: string | null; deletedCount; status; error? }): Promise<void>`
  - `getLatestRetentionRuns(orgId): Promise<Record<RecordType, { ran_at; deleted_count; status } | undefined>>`
  - `runDataRetentionPrune(orgId)`, `runDataRetentionPruneAllOrgs()`

- [ ] **Step 1: Table list, test first.** `AUDIT_RECORD_TABLES` lists `event_logs/timestamp`, every `ENTITY_CONFIGS` table with `changed_at` except `model_lifecycle_change_history/created_at`, `ai_gateway_endpoint_change_history/changed_at`, `ai_gateway_guardrail_change_history/changed_at`, `ai_action_audit_log/created_at`, `file_access_logs/access_date`. Test: every `Object.values(ENTITY_CONFIGS).map(c => c.tableName)` is in the list; every entry matches `/^[a-z_]+$/`.

- [ ] **Step 2: Batch delete.** `deleteAuditRowsBatch(orgId, {table, timestampColumn}, cutoff, batchSize)`: in a transaction, `set_config('app.current_org', ...)`, skip when `SELECT to_regclass('verifywise.' || :table)` is null, then

```sql
DELETE FROM <table> WHERE ctid IN (
  SELECT ctid FROM <table>
   WHERE organization_id = :organizationId AND <timestampColumn> < :cutoff
   ORDER BY <timestampColumn> LIMIT :batchSize)
```

`<table>`/`<timestampColumn>` come only from `AUDIT_RECORD_TABLES` (look the entry up by value; throw on anything else). Tests: unknown table throws; missing table returns 0 without a delete.

- [ ] **Step 3: Org prune, test first.** `runDataRetentionPrune(orgId)`: months = `getAuditRetentionMonths`; null → return without recording. Cutoff via `SELECT (now() - make_interval(months => :m))::text`. Ledger: loop `pruneAuditLedgerBatch` up to 500 batches; then each table up to 500 batches. Total deleted > 0 → `appendToAuditLedger({ organizationId, entryType: "event_log", userId: null, eventType: "Delete", entityType: "audit_ledger", description: \`Retention removed ${total} audit records before ${cutoffDate}\` })` (wrapped in try/catch). Record one `audit_records` run: `success`, `capped` if any cap hit, `failed` with the message on error (then rethrow to the all-orgs loop). Tests: null setting does nothing; counts summed; cap → `capped`; error → `failed` row recorded; self-audit skipped when nothing deleted.

- [ ] **Step 4: All orgs + scheduling.** `runDataRetentionPruneAllOrgs` mirrors `runRetentionPruneAllOrgs` (per-org try/catch, `logger.error`). `scheduleDataRetentionPrune()` with `"data_retention_prune"`, `{ type: "data_retention" }`, pattern `"30 3 * * *"`, no obliterate; `safeSchedule("data-retention-prune", ...)` after the obliterating schedulers in `producer.ts`; worker branch `else if (name === "data_retention_prune") await runDataRetentionPruneAllOrgs();`. Spec test: `expectSchedulerCall("data_retention_prune", { type: "data_retention" }, "30 3 * * *")` and no obliterate.

- [ ] **Step 5: Record existing cleanups.** `runRetentionPrune` (MRM) records an `mrm_metrics` run with its cutoff/deleted/capped. `purgeOldEvents` (Shadow AI) records `shadow_ai_events`, `shadow_ai_daily_rollups`, `shadow_ai_alert_history` runs only for periods > 0. Recording failures are logged and never break the cleanup. Update their tests.

- [ ] **Step 6: Gates, commit** `feat(retention): daily audit record retention job with run history`.

### Task 4: Data retention API and Admin-only retention changes

**Files:**
- Create: `Servers/controllers/dataRetention.ctrl.ts`, `Servers/routes/dataRetention.route.ts`
- Create: `Servers/utils/aiGatewayInternal.utils.ts`
- Modify: `Servers/app.ts` (mount `/api/data-retention`)
- Modify: `Servers/controllers/mrmSettings.ctrl.ts`, `Servers/controllers/fileManager.ctrl.ts`
- Modify (generated): `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts`
- Tests: `Servers/controllers/__tests__/dataRetention.ctrl.test.ts`, route guard test, MRM and file manager controller tests.
- Create: `Servers/tests/integration/tenant-isolation/data-retention.isolation.test.ts` (model on `mrm-retention.isolation.test.ts`: seed two orgs, write a setting and a run row for org A, assert org B's `GET /api/data-retention` shows neither; registry entry from Task 1).

**Interfaces:**
- Consumes: Task 3 utils; gateway endpoints from Task 5 (`GET /internal/guardrails/settings`, `GET /internal/retention/config`). Until Task 5 lands, the gateway rows render as `unavailable` when the calls fail, so this task does not block on it.
- Produces:

```ts
type RetentionRecordKey =
  | "audit_records" | "ai_gateway_guardrail_logs" | "ai_gateway_spend_logs" | "agent_control_logs"
  | "mrm_metrics" | "evidence_files" | "shadow_ai_events" | "shadow_ai_daily_rollups"
  | "shadow_ai_alert_history" | "server_logs";

interface RetentionRow {
  key: RetentionRecordKey;
  period: { unit: "months" | "days"; value: number } | { unit: "policy"; value: string | null } | null; // null = indefinitely
  automaticDeletion: "yes" | "no" | "archive" | "rotate";
  lastCleanup: { ranAt: string; deletedCount: number; status: "success" | "capped" | "failed" } | null;
  source: "app" | "deployment";
  deploymentSetting?: string; // env var name for source "deployment"
  unavailable?: boolean;      // gateway unreachable
}
// GET /api/data-retention → { rows: RetentionRow[]; auditPrunedThrough: { cutoff: string } | null }
// GET /api/data-retention/audit-records/preview?months=N → { count: number }
// PUT /api/data-retention/audit-records { months: number | null } → { months }
```

- [ ] **Step 1: Gateway helper.** `aiGatewayRequest(method, path, { organizationId?, role?, body? })` sending `x-internal-key` (`AI_GATEWAY_INTERNAL_KEY`) plus `x-organization-id`/`x-role` when given, 10s timeout, throws on non-2xx. Unit test with mocked `fetch`.

- [ ] **Step 2: Controller, test first.**
  - GET builds the ten rows: audit records (Task 3 setting; `automaticDeletion` yes when a period is set), gateway guardrail/spend (`log_retention_days`, `spend_log_retention_days`, `auto_purge_enabled` → yes/no; `unavailable` on failure), Agent Control (`mcp_audit_retention_days`, `source: "deployment"`, `deploymentSetting: "MCP_AUDIT_RETENTION_DAYS"`), MRM (`retention_months`, yes), evidence (`file_org_settings.default_retention_policy`, `archive`), three Shadow AI rows (0 → `period: null`, yes when > 0), server logs (`getServerLogRetentionDays()` from Task 6 — until then 14, `rotate`, deployment `LOG_RETENTION_DAYS`). `lastCleanup` from `getLatestRetentionRuns`. `auditPrunedThrough` from `getLatestLedgerCheckpoint`.
  - Preview validates `months` ∈ `AUDIT_RETENTION_MONTHS` (400 otherwise) and returns `countAuditRecordsBefore`.
  - PUT validates `months` (null or allowed value, else 400 "Invalid retention period"), upserts, and appends a ledger `event_log` "Audit record retention changed from <old> to <new>" (`Indefinitely` for null).
  - All three routes `authenticateJWT, authorize("organization.admin")`. Route test asserts the guard on each layer.

- [ ] **Step 3: MRM, test first.** In `updateMrmSettingsHandler`, before validation: `if (has("retention_months") && req.role !== "Admin" && req.role !== "SuperAdmin") return 403 "Only admins can change retention periods"`. Tests: Editor + `retention_months` → 403; Editor + alert fields only → 200; Admin + `retention_months` → 200.

- [ ] **Step 4: Evidence files stay as they are.** Per-file `retention_policy` keeps today's permissions (project members, file owner). Add one regression test: an Editor who is a project member changes a file's `retention_policy` → 200.

- [ ] **Step 5: Docs, gates, commit.** Regenerate swagger + endpoints (set summaries/descriptions for the new routes by hand, regenerate again). Commit `feat(retention): data retention API; only admins change org retention periods`.

### Task 5: AI Gateway — spend period, automatic purge, partial settings update

**Files:**
- Create: `AIGateway/src/database/migrations/versions/a0011_retention.py`
- Modify: `AIGateway/src/crud/guardrails.py`, `AIGateway/src/routers/guardrails_crud.py`, `AIGateway/src/routers/spend.py`
- Create: `AIGateway/src/routers/retention.py` (mounted with prefix `/internal` in `AIGateway/src/app.py`)
- Create: `AIGateway/tests/test_retention.py` (mocked style of `test_agent_policy_scope.py`)
- Modify: `Servers/services/automations/actions/dataRetentionPrune.ts` (call gateway purge, record runs)

**Interfaces:**
- Produces: `GET /internal/retention/config` → `{ "mcp_audit_retention_days": int }`; `POST /internal/retention/purge` → `{ "results": [{ "organization_id", "guardrail_deleted", "spend_deleted" }] }`; settings GET/PUT include `spend_log_retention_days`, `auto_purge_enabled`.

- [ ] **Step 1: Alembic a0011** (`revision = "a0011"`, `down_revision = "a0010"`, starts with `SET search_path TO verifywise`): add `spend_log_retention_days INTEGER NOT NULL DEFAULT 90 CHECK (spend_log_retention_days >= 1)` and `auto_purge_enabled BOOLEAN NOT NULL DEFAULT false` to `ai_gateway_guardrail_settings` (`ADD COLUMN IF NOT EXISTS`); indexes `(organization_id, changed_at)` on both `ai_gateway_*_change_history` tables. Downgrade drops them.

- [ ] **Step 2: Partial upsert, test first.** `upsert_guardrail_settings(org_id, data)`: INSERT uses defaults for missing keys, but `ON CONFLICT DO UPDATE SET` only the keys present in `data` (whitelisted list incl. the two new ones). Validate `log_retention_days`/`spend_log_retention_days` int ≥ 1 and `auto_purge_enabled` bool (400 otherwise). Test: updating only `spend_log_retention_days` leaves `pii_on_error` and `log_retention_days` unchanged.

- [ ] **Step 3: Spend purge** keeps reading `spend_log_retention_days` (now real). No behavior change beyond the column existing.

- [ ] **Step 4: Internal endpoints, test first.** Both `verify_internal_key`. Purge selects orgs `WHERE auto_purge_enabled`, and for each runs `purge_guardrail_logs(org, log_retention_days)` and `purge_spend_logs(db, org, spend_log_retention_days)` in its own try/except (an error returns `{..., "error": str}` for that org). Tests: orgs with the switch off are not purged; one org failing does not stop others.

- [ ] **Step 5: Node side.** In `runDataRetentionPruneAllOrgs`, after the org loop: `aiGatewayRequest("POST", "/internal/retention/purge")`; for each result record `ai_gateway_guardrail_logs` and `ai_gateway_spend_logs` runs (`failed` with the error when present). A gateway failure is logged and never fails the job. Unit test with mocked helper.

- [ ] **Step 6: Gates, commit** `feat(ai-gateway): opt-in automatic log purge, spend log retention column, partial settings update`.

### Task 6: Server log retention setting

**Files:**
- Modify: `Servers/utils/logger/fileLogger.ts`, `Servers/.env.example`, `docs/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md`
- Create: `Servers/utils/logger/__tests__/logRetention.test.ts`

- [ ] **Step 1, test first.** Export `getServerLogRetentionDays(): number` = `parseInt(process.env.LOG_RETENTION_DAYS)` when an integer ≥ 1, else 14. Use `maxFiles: \`${getServerLogRetentionDays()}d\``. Tests: unset → 14; "30" → 30; "0", "abc", "-5" → 14.
- [ ] **Step 2.** Document `LOG_RETENTION_DAYS=14` in `.env.example` and the deployment guide (self-hosted only). Task 4's server log row uses this function.
- [ ] **Step 3: Gates, commit** `feat(logging): configurable server log retention`.

### Task 7: Client — Settings → Data retention tab

**Files:**
- Create: `Clients/src/application/repository/dataRetention.repository.ts`, `Clients/src/application/hooks/useDataRetention.ts`
- Create: `Clients/src/presentation/pages/SettingsPage/DataRetention/index.tsx`, `.../DataRetention/EditRetentionModal.tsx`, `.../DataRetention/__tests__/DataRetention.test.tsx`
- Modify: `Clients/src/presentation/pages/SettingsPage/index.tsx`, `Clients/src/i18n/translations.ts`

**Interfaces:**
- Consumes: Task 4 API; existing `updateMrmSettings` (`mrm.repository.ts`), `updateFileOrgSettings`, `updateSettingsConfig` (`shadowAi.repository.ts`), `PUT /ai-gateway/guardrails/settings` (partial, Task 5).

- [ ] **Step 1: Repository + hooks.** `getDataRetention()`, `previewAuditRetention(months)`, `updateAuditRetention(months)`; React Query key `["data-retention"]`, invalidated after any save from the tab.
- [ ] **Step 2: Tab wiring.** Add `"data-retention"` to `BUILT_IN_TABS`; tab item `{ label: "Data retention", value: "data-retention", icon: <valid TabItem icon, e.g. "Archive" if listed, else "Database">, tooltip: "How long each kind of record is kept" }` and panel, both only when `userRoleName === "Admin"` (same pattern as Audit ledger).
- [ ] **Step 3: Table, test first.** Columns: Records (name + one-line description), Kept for ("Indefinitely", "N days", "N months"/"N years" when divisible by 12, evidence policy label), Automatic deletion ("Yes", "No", "Archived, not deleted", "Rotated daily"), Last cleanup ("<date> · N removed", "Failed", "Daily" for Agent Control, "Rotated daily" for server logs, otherwise "—"), and an action cell: Edit button (`CustomizableButton`, outlined, 30px) for app rows, "Set by deployment: <ENV>" text for deployment rows, "Unavailable" for unreachable gateway rows. Above the table, when `auditPrunedThrough` is set: "Audit records before <date> were removed by the retention policy." Tests: renders ten rows from a mocked response; deployment rows have no Edit; unavailable rows have no Edit.
- [ ] **Step 4: Edit modal, test first.** `StandardModal` with one control per row kind:
  - Audit records: `Select` (Keep indefinitely, 1, 2, 3, 5, 7, 10 years). If the new period is shorter than the current (indefinitely counts as longest), Save first calls preview and shows a confirm step: "The next cleanup will permanently delete N records older than <period>. Deleted records cannot be restored." (N sums the ledger and the other audit tables, which hold the same events twice, so the copy says "records", not "events".) with a link "Export CSV first" to `/settings/audit-ledger`, and a "Delete records" confirm button. Longer or equal saves directly.
  - Gateway guardrail / spend: `Field` days (integer ≥ 1) + `Toggle` "Delete automatically" (shared flag; shown on both rows). Saves only the changed keys.
  - MRM: `Field` months (integer ≥ 13).
  - Evidence: `Select` with the retention policy options from `Clients/src/domain/enums/retention.enum.ts` / existing option list.
  - Shadow AI: `Field` days (empty or 0 = indefinitely, max 3650).
  Errors are left to the global toast; the modal stays open. Tests: shortening shows the count and only saves after confirming; lengthening saves without preview; gateway save sends only changed keys; validation blocks invalid numbers.
- [ ] **Step 5: i18n** de/fr/es for every new string. **Gates, commit** `feat(retention): data retention settings tab`.

### Task 8: Client — module pages follow the Admin-only rule; gateway purge; ledger note

**Files:**
- Modify: `Clients/src/presentation/pages/ModelInventory/mrm/RetentionSection.tsx`
- Modify: `Clients/src/presentation/pages/AIGateway/Settings/index.tsx` (+ `index.test.tsx`)
- Modify: `Clients/src/presentation/pages/SettingsPage/AuditLedger/index.tsx` (+ test)
- Modify: `Clients/src/i18n/translations.ts`; tests next to each file

- [ ] **Step 1: Read-only for non-Admins.** `RetentionSection` (model risk management) is disabled for non-Admins (`useAuth().userRoleName !== "Admin"`) with helper text "Only admins can change retention periods". Tests for both roles. `FileMetadataEditor` is not changed: per-file retention stays editable as today.
- [ ] **Step 2: AI Gateway settings.** Add "Spend log retention (days)" `Field` and a "Delete automatically" `Toggle` to the retention card; save includes them. "Purge old logs" opens a `StandardModal` confirm ("Permanently delete guardrail logs older than N days?") and afterwards shows "N logs deleted" or the error message (no swallowed catch). Update `index.test.tsx` (purge now requires confirm).
- [ ] **Step 3: Audit ledger page.** When the verify result has `prunedThrough`, show "Records before <date> removed by retention policy" next to the result. Test.
- [ ] **Step 4: i18n, gates, commit** `feat(retention): admin-only retention controls, purge confirmation, ledger retention note`.

### Task 9: Documentation

**Files:**
- Modify: `docs/technical/domains/` audit-ledger or the closest existing doc (find with `grep -ril "audit ledger" docs/technical`), `docs/technical/architecture/database-schema.md`
- Modify: `shared/user-guide-content/` article covering the audit ledger or settings, if one exists (then mirror to `~/website/verifywise/content/user-guide/`, uncommitted there)

- [ ] **Step 1.** Document the retention setting, the checkpoint model (why verification still holds), the job time, the Admin-only rule, the new tables, `LOG_RETENTION_DAYS`, and the gateway automatic purge.
- [ ] **Step 2.** Commit `docs(retention): data retention`.
