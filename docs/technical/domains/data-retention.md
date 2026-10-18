# Data retention

Admins see and set how long each kind of record is kept in **Settings → Data retention**. Audit records default to **keep indefinitely**, and AI Gateway automatic deletion is **off by default**, so nothing is deleted until an Admin opts in. Design: `docs/superpowers/specs/2026-10-11-data-retention-design.md`.

## What is configurable

| Records | Where it is set | Deleted by |
|---|---|---|
| Audit records (audit ledger, event log, change history tables, AI Advisor action log, file access logs) | `data_retention_settings.audit_retention_months` | `data_retention_prune` |
| AI Gateway guardrail logs | `ai_gateway_guardrail_settings.log_retention_days` | gateway purge (manual button, or the daily job when `auto_purge_enabled`) |
| AI Gateway spend logs | `ai_gateway_guardrail_settings.spend_log_retention_days` | same |
| Agent Control logs | `ai_gateway_guardrail_settings.mcp_audit_retention_days` per organization (null = deployment default `MCP_AUDIT_RETENTION_DAYS`; floor `MCP_AUDIT_RETENTION_MIN_DAYS`) | daily job `mcp_audit_cleanup` (calls the gateway) |
| Model risk metrics | `mrm_org_settings.retention_months` | `mrm_retention_prune` |
| Evidence files | org default in `file_org_settings`, per-file `retention_policy` | never deleted (archived) |
| Shadow AI events, daily rollups, alert history | Shadow AI settings | `shadowAiAggregation.service.ts` |
| Server logs | `LOG_RETENTION_DAYS` env (default 14), see [CONFIGURATION_REFERENCE.md](../../deployment/CONFIGURATION_REFERENCE.md) | winston daily rotation |

Each row saves through its feature's existing endpoint; only audit records use the new one. The tab is shown with the Audit ledger tab (`Clients/src/presentation/pages/SettingsPage/index.tsx`).

## Audit records setting

- Periods: keep indefinitely (`NULL`, default), 1, 2, 3, 5, 7, 10 years, stored as months 12, 24, 36, 60, 84, 120. The table CHECK and the controller both reject anything else (400).
- Table `data_retention_settings` (one row per org; a missing row means keep indefinitely).
- A change appends an `event_log` entry to the audit ledger. Shortening the period opens a confirmation in the UI showing how many records the next cleanup will delete.

API (all `authorize("organization.admin")`, `Servers/routes/dataRetention.route.ts`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/data-retention` | every row of the tab in one response; AI Gateway rows show as unavailable if the gateway is unreachable |
| GET | `/api/data-retention/audit-records/preview?months=N` | number of records a period would delete |
| PUT | `/api/data-retention/audit-records` | set the audit period |

## Admin-only rule

Only Admins change organization-wide periods, checked on the server. The `/api/data-retention` routes rely on `authorize("organization.admin")` alone (no role-name check in the handler), so a custom role granted that permission can use them. `PUT /api/mrm/settings` returns 403 "Only admins can change retention periods" when the body contains `retention_months` and the caller's role does not hold `organization.admin` (resolved by `roleHasPermission`, the same check `authorize()` uses, through `canChangeRetentionPeriods` in `utils/retentionAudit.utils.ts`; SuperAdmin keeps access); alert settings in the same endpoint are unchanged. `PATCH /api/shadow-ai/settings` stays Admin/SuperAdmin only, except that a save changing only retention periods is also allowed for a role holding `organization.admin`; the rate limit stays Admin only. AI Gateway settings use `require_admin` (role name `Admin`), so a custom role sees the gateway rows but the gateway rejects its save with "Admin access required". The file org default route is `authorize("organization.admin")`. On the client, the Data retention tab and the MRM retention section use `useHasPermission("organization.admin", { fallbackToAdmin: true })`. Per-file evidence retention (`retention_policy`, `expiry_date`) keeps today's permissions: project members and the file's owner.

Every retention change leaves a ledger entry (`entity_type` `data_retention`, `event_type` `Update`, written by `appendRetentionChangeToLedger` in `utils/retentionAudit.utils.ts`): the audit period (`PUT /api/data-retention/audit-records`), the MRM metric period (`updateMrmSettingsHandler`, only when `retention_months` actually changes), the evidence default policy (`PUT` file org settings, only when `default_retention_policy` changes), the three Shadow AI periods (`updateSettings` in `shadowAi.ctrl.ts`, only for `retention_*` keys in the body that changed) and the AI Gateway periods. For the gateway, Express handles `PUT /api/ai-gateway/guardrails/settings` itself (`controllers/aiGatewaySettings.ctrl.ts`, registered before the proxy in `routes/aiGateway.route.ts`): it reads the current settings, forwards the PUT with the caller's org, user, role and request id (30 s timeout, as the proxy had), returns the gateway's status and body unchanged (errors included), and appends one entry describing the retention keys present in the request body that changed (`log_retention_days`, `spend_log_retention_days`, `auto_purge_enabled`, `mcp_audit_retention_days`). The Agent Control entry is labelled "Agent Control log retention" and describes null as "the deployment default". When the old settings could not be read, the entry says "set to X". A failed append is logged and never fails the request.

## Daily job

`data_retention_prune`, cron `30 3 * * *` (`automationProducer.ts`), action `services/automations/actions/dataRetentionPrune.ts`.

- Reads every org with an audit period in one query (`getOrgsWithAuditRetention`) and runs org by org; one org's failure is logged and does not stop the others. Orgs with no audit period are not touched.
- Deletes in batches of 10,000 (`RETENTION_BATCH_SIZE`), at most 500 batches per table per org per run (`RETENTION_MAX_BATCHES`); a capped run continues the next day.
- Order per org: audit ledger, then each table in `AUDIT_RECORD_TABLES` (`utils/dataRetention.utils.ts`: `event_logs`, the change history tables, `ai_action_audit_log`, `file_access_logs`) with `WHERE organization_id = :org AND <timestamp> < :cutoff`. Whether each table exists is checked once per run with `auditTableExists` (`deleteAuditRowsBatch` assumes the table exists). A failing table is recorded and the rest continue.
- Every transaction calls `set_config('app.current_org', :orgId, true)`.
- If anything was deleted, one ledger entry is appended: "Retention removed N audit records before <date>".
- Each run writes a row to `data_retention_runs` (`record_type`, `cutoff`, `deleted_count`, `status` of `success`, `capped` or `failed`, `error`); the tab reads it for "Last cleanup". The MRM prune and the Shadow AI cleanup also record runs there. All three go through `safeRecordRetentionRun`, which logs a recording failure and never fails the cleanup.
- After the audit work the job calls the AI Gateway (below).
- Last, it deletes `data_retention_runs` rows older than 13 months, keeping the latest row per (org, record type) so "Last cleanup" always has a value (`pruneRetentionRunHistory`, batched per org).
- The MRM prune and the Shadow AI cleanup record a `failed` run when they fail (Shadow AI: per cleanup type whose period is above 0; the other types still run). When the Shadow AI settings cannot be read, a `failed` run with no cutoff is recorded for each of the three Shadow AI types, as the MRM prune does when its settings read fails.

## Audit ledger pruning and why verification still holds

The ledger is a per-org hash chain: each row's `prev_hash` is the previous row's `entry_hash`. Deleting rows from the middle would break it, so pruning only removes the oldest prefix.

`pruneAuditLedgerBatch` (`utils/auditLedgerRetention.utils.ts`), one transaction per batch:

1. Takes `pg_advisory_xact_lock(9001, orgId)`, the lock every append takes, so no append is in flight.
2. Bounds the delete by id, not by timestamp (`occurred_at` is not strictly monotonic with id): deletable rows are those below the smallest id still inside the retention period. If every row is old, the bound is the newest id, so the newest entry is always kept and the next append still links to a real row.
3. Inserts a row in `audit_ledger_retention_checkpoints` with `pruned_through_id` (last deleted id) and `anchor_hash` (that row's `entry_hash`).
4. Sets `verifywise.ledger_retention = 'on'` and deletes ids up to the checkpoint.

The delete trigger (migration `20261011150100`) allows a delete only when the org no longer exists (cascade), or when all of these hold: the flag is on; a checkpoint for the org was written in the same transaction (`created_txid = txid_current()`); `OLD.id <= pruned_through_id`; `OLD.occurred_at < cutoff`; and the cutoff is at least 12 months old, the shortest period an Admin can pick. Everything else raises. This guards against mistakes, not against someone with full database access.

The checkpoint table is append-only: triggers reject UPDATE and DELETE except on organization cascade. The migration's `down()` refuses to run once any checkpoint exists, because dropping the table would lose the prune record and make every pruned ledger fail verification.

`verifyChain` (`utils/auditLedger.utils.ts`) opens one `REPEATABLE READ` read-only transaction, reads the latest checkpoint, and walks the chain by keyset paging inside that snapshot. With a checkpoint it first checks that no row with `id <= pruned_through_id` remains (a legitimate prune deletes them all, so a leftover row means a forged checkpoint hid a deletion from the middle, reported as `compromised` at that row), then starts from `prevHash = anchor_hash`; without one it starts from the genesis hash. So the remaining rows are still checked end to end: the first row must link to the recorded hash of the last deleted row, and every later row must link to its predecessor. Editing a remaining row, or changing the anchor, breaks the match and reports `compromised`. The single snapshot means a prune committing during verification cannot move the anchor under the walk. The result carries `prunedThrough: { id, cutoff }`, and the Audit ledger page shows "Records before <date> removed by retention policy".

What verification cannot prove is the content of deleted rows. The checkpoints record that a prune happened and up to which row, and the self-audit ledger entry records how many rows were removed.

## AI Gateway

Alembic `a0011_retention.py`, on `ai_gateway_guardrail_settings`:

- `spend_log_retention_days INTEGER NOT NULL DEFAULT 90` (CHECK >= 1). The spend purge already read this column, which did not exist before.
- `auto_purge_enabled BOOLEAN NOT NULL DEFAULT false`.
- Indexes `(organization_id, changed_at)` on both gateway change history tables.

Alembic `a0012_agent_control_retention.py` adds `mcp_audit_retention_days INTEGER NULL` (CHECK null or >= 1) to the same table. Null means the organization uses the deployment default `MCP_AUDIT_RETENTION_DAYS` (default 30; 0 or less keeps logs indefinitely). A saved value must be null or between `MCP_AUDIT_RETENTION_MIN_DAYS` (default 7) and 3650. The floor applies to organization-set periods only, never to the deployment default. The daily cleanup (`batch_delete_expired_per_org` in `AIGateway/src/utils/batch_delete.py`) runs one batched delete per table that joins the settings row, so each organization is cut at its own period: its own value raised to the floor (`GREATEST(own, min_days)`, so a value saved before the floor was raised is still cut at the floor), or the deployment default as it is. Approval requests are deleted once decided or expired; pending requests that have not expired are kept. `MCP_AUDIT_RETENTION_MIN_DAYS` is clamped to 1 through 3650 when the gateway starts. In the app, the `agent_control_logs` row of `GET /api/data-retention` has `source: "app"` with `usesDeploymentDefault`, `deploymentDefaultDays` and `minDays`. Its `period` is the effective one the cleanup applies: the organization's own value raised to `minDays`, or the deployment default unchanged. The edit modal pre-fills and compares against that value. A change to or from the deployment default is recorded in the audit ledger with the default's days (`the deployment default (30 days)`, or `(kept indefinitely)`), read from `GET /internal/retention/config` only when the save sets the Agent Control period; if that read fails, the entry names the default without its days.

`upsert_guardrail_settings` (`AIGateway/src/crud/guardrails.py`) is now a partial update: an existing row changes only the keys present in the request, a new row takes defaults for the rest. Saving one value from the Data retention tab no longer resets the others.

Internal endpoints (internal key auth only, `AIGateway/src/routers/retention.py`):

- `GET /internal/retention/config` returns `{ mcp_audit_retention_days, mcp_audit_retention_min_days }`. Express treats a response without the floor as an older gateway and shows the Agent Control row as unavailable.
- `POST /internal/retention/purge` requires `{ "organization_id": N }` (a missing or non-integer id is a 422) and purges that org only (if it has `auto_purge_enabled`), with at most 100 batches of 1,000 rows per log type per call (the manual purge keeps 50). It returns `{ results: [{ organization_id, guardrail_deleted, guardrail_capped, spend_deleted, spend_capped, guardrail_error?, spend_error? }] }`, with an empty list for an org that did not opt in. Each log type is purged and reported on its own, so one failing does not mark the other failed; `*_capped` means the last allowed batch was full. Each batch commits on its own, so when a purge fails partway the crud functions raise `PartialPurgeError` (`AIGateway/src/crud/purge.py`) carrying the rows already deleted, and `*_deleted` reports that count next to `*_error`.

Both retention periods accept whole numbers from 1 to 3650 days (10 years); anything else is a 400 from `upsert_guardrail_settings`. A larger value saved before the cap existed never fails a purge: `retention_cutoff` returns None when the cutoff would fall before the earliest representable date, and the purge deletes nothing.

The Node job reads the opted-in orgs from `ai_gateway_guardrail_settings` (same database; none if the table does not exist) and calls the purge once per org with a 5-minute timeout (`GATEWAY_PURGE_TIMEOUT_MS`), repeating while a log type is capped, up to 5 calls (500 batches per type per org per run). It records one run per org for `ai_gateway_guardrail_logs` and `ai_gateway_spend_logs` with the summed count: `failed` if any call errored for that type (a failed call fails both), `capped` if still capped after the last call, else `success`. One org's failure never affects another, and a gateway failure is logged and never fails the job. Spend purges commit after each batch, like guardrail purges.

Both places that edit these settings, the Data retention tab and **AI Gateway → Settings → Guardrails**, ask for confirmation before a save that turns automatic deletion on, or shortens either period while it is on. The confirmation names both periods and says logs will be deleted permanently every day. The rule (`needsGatewayPurgeConfirmation`) and the text (`GatewayPurgeWarning`) are shared from `Clients/src/presentation/components/GatewayPurgeConfirmation`, which also holds the 1 to 3650 day limits both forms validate against.

The Agent Control row's "Last cleanup" reads "Daily" when the effective period (the organization's own, or the deployment default) is above 0; when records are kept indefinitely or the gateway is unreachable it shows "—".

## Generated bias-audit corpora

`bias_audit_corpora` and `bias_audit_corpus_records` (the LL 144 bias module's generated corpora and their append-only record log) are outside this subsystem and are retained indefinitely. A corpus is synthetic: every record is generated from a fixed job description and holds no real applicant data, so there is nothing personal to expire. They are left out of the retention registry on purpose; deleting the project removes them.

## Tests

Real-DB: `Servers/tests/integration/audit-ledger-retention.test.ts` (prune then verify, trigger rejections, checkpoint immutability) and `tenant-isolation/data-retention.isolation.test.ts`. Unit tests sit beside the utils, controller and job; gateway tests are in `AIGateway/tests/test_retention.py`.
