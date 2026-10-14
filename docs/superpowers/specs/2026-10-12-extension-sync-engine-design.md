# Extension sync engine: design

**Date:** 2026-10-12 (revised the same day after a review against the code)
**Status:** design approved in chat on 2026-10-12; this spec is the written version
**Branch:** `feat/extension-sync-engine`
**Related:** the "Scheduled sync" section of `docs/technical/infrastructure/extensions.md`

## Goal

Move the run lifecycle that Jira Assets built for itself into one engine any extension can use. That lifecycle is: claim, heartbeat, abandoned-run detection, history, schedule, "Sync now" and status. Jira Assets moves onto the engine first, and users must not see a change. The Jira incident sync is built on it next, and MLflow and Azure AI Foundry can gain scheduled sync later by implementing the provider contract.

Success means:

- Jira Assets behaves exactly as before, through both its API and its UI, with the one intended addition listed under decision 9.
- A new extension gets scheduled and on-demand runs, history and status by implementing one provider interface and registering it, with no claim, heartbeat, history or scheduler code of its own.

## Decisions (approved)

1. **Scope: per-org runs only.** These are scheduled runs and on-demand runs. Webhook handling and per-record push jobs, which the incident sync needs, stay inside that extension as ordinary BullMQ jobs.
2. **One claim per (extension, organization) covers every exclusive operation** of that extension, not only syncs. Jira Assets' import, "Remove missing" and single use-case delete take the same claim as its syncs today and must keep doing so.
3. **Two shared tables:** `extension_sync_runs` replaces `jira_assets_sync_history`, and `extension_sync_settings` holds the schedule. Extension-specific configuration stays in each extension's own tables.
4. **Real statuses:** `started`, `completed`, `failed`, `abandoned` and `skipped`. Today "abandoned" and "skipped" are `failed` rows told apart by their message text.
5. **TIMESTAMPTZ** for every timestamp in the new tables.
6. **One tick job and one per-org run job** for all extensions.
7. **Failure backoff** applies to scheduled runs only. There is no auto-disable.
8. **The generic API lives on its own path segment**, `/api/extensions/:key/runs…` and `/:key/schedule`. The existing Jira Assets sync routes stay, served by the engine, with exactly their current response shapes.
9. **Shared UI:** an `ExtensionSyncPanel` component and a `useExtensionSync(key)` hook. The Jira Assets panel switches to them. The one intended visible addition is a "Failing since <date>" line when scheduled runs keep failing. The panel adds no run list.
10. **Not in this work:**
    - moving MLflow and Azure AI Foundry over;
    - webhooks and per-record push jobs;
    - moving Jira's token from CBC (`createSecureValue`) to AES-256-GCM (`encryption.utils.ts`), which needs its own PR before the incident sync shares the Jira connection;
    - dropping the old Jira table and columns, which is a follow-up migration after one release;
    - RLS policies, since RLS enforcement is off by default and background jobs don't set `app.current_org`.

## Current state (develop c5d8f439b)

**Jira Assets** (`Servers/extensions/jira-assets/`):

- **Claiming a run.** `claimSyncRun` takes `pg_advisory_xact_lock(hashtext('jira_assets_sync'), orgId)`. It closes any `started` row whose heartbeat (or start time) is older than 15 minutes (`SYNC_STALE_AFTER_MINUTES`) as `failed` with `ABANDONED_RUN_MESSAGE`. It throws `JiraSyncInProgressError` if a live run remains, and otherwise inserts a `started` row with a UUID `run_token`.
- **Ownership.**
  - `touchHeartbeat` runs every 25 objects and on each page. It matches id, token and `status='started'`, and throws `RunSupersededError` when the claim is lost.
  - Sync row updates guard ownership with an inline SQL fragment against the history table (`SQL_RUN_STILL_OWNED`, plus a share lock on the run row).
  - Removal and single delete finalize *inside* their data transaction, so a lost claim rolls the deletes back.
  - `releaseClaim` deletes a claimed row that did nothing, such as a single delete that finds nothing to delete.
- **History kinds.** `sync_type` is one of `manual`, `scheduled`, `import` or `remove_missing`. Single delete is recorded as `remove_missing`.
- **Runs that can't start.**
  - Pickup (`runQueuedSync`): if a run is live, a manual job writes a closed `failed` row with `SKIPPED_RUN_MESSAGE` and no token. A scheduled job writes nothing. Enablement is not checked at pickup.
  - Not ready: the scheduler skips orgs with no object type or no use cases, and logs nothing. "Sync now" needs a config (404 if missing) and an object type (400). It does not need existing use cases, because the first manual sync is what creates them.
- **Due rule:** `last_run = GREATEST(config.last_sync_at, MAX(started_at) of manual/scheduled rows with a token)`. A run is due when `sync_interval_hours` has elapsed since `last_run`. Failures also write `last_sync_at`, so an interval change applies immediately.
- **Config fields.** `last_sync_at`, `last_sync_status` (`'success'` or `'failed'`) and `last_sync_message` live on `jira_assets_config`. They are written only by finished manual or scheduled runs; abandoned closes and skipped rows don't touch them. `GET /config` returns them, and the panel's "Last sync" line reads them on load.
- **Status and history.**
  - `GET /sync/status` returns `data: null` when Jira isn't configured. It returns `queued: null` when the queue doesn't answer.
  - `latest_run` and `previousRunId` consider only manual and scheduled rows. `latest_run.code` is `"abandoned"` or `"skipped"` (`JIRA_RUN_CODES`).
  - The panel shows `latest_run.error_message` for any run that didn't complete.
  - `GET /sync/history` returns `SELECT *`, capped at 200 rows.
- **`PATCH /config/sync`.** It sets `sync_enabled` and `sync_interval_hours`, returns 404 when Jira isn't configured, and writes an event-log entry (`logSuccess`). It writes no audit-ledger entry.
- **Jobs.** The check job `jira_assets_scheduled_sync_check` runs every 5 minutes. The per-org job is `jira_assets_sync_run`, with jobId `jira-assets-sync-<orgId>`. Both run on the `automation-actions` queue. An unknown job name makes the worker throw "No handler found".
- **UI.** The panel polls `/sync/status` every 3 seconds. `runOutcome.ts` checks the `abandoned` code; skips show their message.

**Routing.** `/api/extensions` is mounted before the per-extension routers. MLflow (`mlflow.route.ts`) and Azure AI Foundry (`azureAiFoundry.route.ts`) each serve their own `POST /sync`.

**Tenant isolation.** The Jira tables sit on the audit allow-list in `Servers/scripts/auditTenantIsolationCoverage.ts`, not in the registry.

## Design

### 1. Tables (one new migration, one transaction, `verifywise.` prefix in DDL)

`extension_sync_settings` has one row per organization and extension with a schedule:

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| organization_id | INT NOT NULL → organizations ON DELETE CASCADE | |
| extension_key | VARCHAR(64) NOT NULL | `extensions.key` |
| enabled | BOOLEAN NOT NULL DEFAULT false | |
| interval_hours | INT NOT NULL DEFAULT 24, CHECK 1..168 | |
| consecutive_failures | INT NOT NULL DEFAULT 0 | scheduled failures since the last success |
| failing_since | TIMESTAMPTZ NULL | start of the first failure in the current streak |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| | UNIQUE (organization_id, extension_key) | |

`extension_sync_runs` has one row per claimed run or recorded skip:

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | copied ids are preserved (see section 2) |
| organization_id | INT NOT NULL → organizations ON DELETE CASCADE | |
| extension_key | VARCHAR(64) NOT NULL | |
| kind | VARCHAR(32) NOT NULL | a kind the provider declares |
| status | VARCHAR(16) NOT NULL CHECK IN (`started`,`completed`,`failed`,`abandoned`,`skipped`) | |
| code | VARCHAR(64) NULL | machine code: `abandoned`, `skipped`, or a provider code |
| counts | JSONB NOT NULL DEFAULT '{}' | provider-defined |
| message | TEXT NULL | |
| run_token | VARCHAR(64) NULL | null on skipped rows |
| triggered_by | INT NULL → users ON DELETE SET NULL | |
| started_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| heartbeat_at | TIMESTAMPTZ NULL | |
| completed_at | TIMESTAMPTZ NULL | |

Indexes:

- `(organization_id, extension_key, started_at DESC)`.
- A partial unique index on `(organization_id, extension_key) WHERE status = 'started'`, created *after* the data copy in section 2.

### 2. Moving Jira Assets data (same migration)

1. **Settings.** Insert `jira_assets_config.sync_enabled` and `sync_interval_hours` into `extension_sync_settings` with `extension_key = 'jira-assets'`.
2. **History, keeping ids.** Copy `jira_assets_sync_history` into `extension_sync_runs`, keeping each row's `id`. Then `setval` the sequence to the maximum id, so `previousRunId` stays comparable. Naive UTC timestamps become `col AT TIME ZONE 'UTC'`, `sync_type` becomes `kind`, and statuses map as follows:

   | Old row | New row |
   |---|---|
   | `completed` | `completed` |
   | `failed` with `ABANDONED_RUN_MESSAGE` | `abandoned`, code `abandoned` |
   | `failed` with `SKIPPED_RUN_MESSAGE` | `skipped`, code `skipped` |
   | any other `failed` | `failed` |
   | `started`, newest per org, live by the 15-minute rule | `started` |
   | any other `started` | `abandoned`, code `abandoned`, `completed_at = now()` |

   The last two rows mean the partial unique index can never fail on copied data. Counts move into `counts` as `{fetched, created, updated, deleted}`, and `error_message` moves into `message`.
3. **Index.** Create the partial unique index.
4. **Old columns.** `jira_assets_config.last_sync_*`, `sync_enabled`, `sync_interval_hours` and the old history table are left in place but no longer written.
5. **`down()`.** Drops the two new tables. The old data is untouched, so a rollback restores the old behaviour, minus any runs made since.

### 3. Engine module: `Servers/extensions/sync-engine/`

```ts
interface SyncProvider {
  key: string;                       // extensions.key; must match /^[a-z0-9-]+$/
  kinds: readonly string[];          // every exclusive operation
  scheduledKind?: string;            // kind the tick enqueues; no schedule if absent
  // kinds that count as "last run" (due rule) and as latest_run / previousRunId: [scheduledKind, "manual"]
  readiness(orgId: number, kind: string): Promise<{ ready: true } | { ready: false; status: 400 | 404; reason: string }>;
  run(ctx: RunContext): Promise<RunResult | void>;   // void when the provider finalized itself
}

interface RunContext {
  orgId: number; runId: number; kind: string; payload: unknown; triggeredBy: number | null;
  heartbeat(): Promise<void>;                              // throws RunSupersededError when the claim is lost
  sqlOwnsRun(alias?: string): string;                      // SQL fragment proving ownership of this run, for use in provider writes
  assertOwned(t: Transaction): Promise<void>;              // FOR SHARE on the run row inside the caller's transaction
  finalize(result: RunResult, t?: Transaction): Promise<void>;  // inside the caller's transaction when given
  release(t?: Transaction): Promise<void>;                 // delete a claim that did nothing (no history row)
  signal: AbortSignal;                                     // aborted at the run deadline
}

interface RunResult { counts: Record<string, number>; message?: string; code?: string }
```

**Registry.** `registerSyncProvider(provider)` validates the key and is called from each extension's module index. Looking up an unknown key throws.

**`claimRun(key, orgId, kind, triggeredBy)`.** This runs in one transaction:

- takes `pg_advisory_xact_lock(hashtext('ext_sync:' || key), orgId)`;
- closes stale `started` rows as `abandoned` with code `abandoned`, using `STALE_AFTER_MINUTES = 15`;
- throws `SyncInProgressError` if a live run remains;
- otherwise inserts a `started` row with a UUID token.

**`runClaimed`.** It calls `provider.run(ctx)`. If the provider returns a result rather than finalizing itself, the engine finalizes on id and token. A thrown error finalizes the run as `failed`, with the message truncated to 2,000 characters and the error's `code` if it has one. A `RunSupersededError` writes nothing.

**`withClaim(key, orgId, kind, fn)`.** This is for exclusive operations outside syncs: Jira's import, remove-missing and single delete. It claims, gives `fn` the same `RunContext`, and finalizes or releases. A provider that needs rollback safety calls `ctx.finalize(result, t)` or `ctx.release(t)` inside its own data transaction, as removal and delete do today.

**Schedule bookkeeping:**

- A scheduled run that ends `failed`, or a scheduled run closed as `abandoned`, increments `consecutive_failures`. On the first failure in a streak it also sets `failing_since` to that run's `started_at`.
- Any `completed` run of a status kind (scheduled or manual) resets both columns.

**Due query.** One cross-org query, run by the tick, selects settings rows where all of these hold:

- `enabled`, joined to `extensions` and `extension_enablements` (`enabled = TRUE`);
- no live run;
- the due time has passed, where:
  - `last_run` = `MAX(started_at)` of that extension and org's runs of a status kind with a non-null token;
  - due when `last_run` is null, or `now() >= last_run + GREATEST(interval_hours, backoff(consecutive_failures))` hours;
  - `backoff(n)` = 0 for n = 0, otherwise `LEAST(2^(n-1), 24)`.

  Because nothing about the schedule is stored ahead of time, an interval change applies on the next tick.

**Readiness.** For every due org the tick calls `readiness(orgId, scheduledKind)`. A not-ready org records nothing and logs nothing, as today. Manual runs call `readiness(orgId, "manual")` at the API and return its `status` and `reason`.

**Behaviour change, called out.** `last_run` is now the newest run's *start* time. Today it is also bounded by `last_sync_at`, which is the *finish* time. Scheduled runs can therefore move earlier by up to one run's duration.

### 4. Jobs

- **`extension_sync_tick`.** Runs every 5 minutes via `upsertJobScheduler`. It is non-obliterating and registered after the obliterating schedulers in `Servers/jobs/producer.ts`. Startup calls `removeJobScheduler("jira_assets_scheduled_sync_check")`.
- **`extension_sync_run`.**
  - Payload `{ key, orgId, kind, triggeredBy, payload }`, jobId `ext-sync-<key>-<orgId>`, `attempts: 1`, removed on complete and on fail.
  - Enqueueing keeps today's rules: a 5-second queue timeout (`BackgroundJobsUnavailableError` → 503), and `queued: false` when a job is already pending.
  - At pickup, if a run is live, a manual job records a `skipped` row (code `skipped`, message `SKIPPED_RUN_MESSAGE`, no token), and a scheduled job records nothing. Enablement is not checked at pickup, the same as today.
- **Old job names, for one release.** The worker still accepts `jira_assets_scheduled_sync_check` and `jira_assets_sync_run`, and routes both to the engine. Jobs queued before the deploy therefore don't fail with "No handler found".
- **Deployment.** The API and the worker must be deployed together. During a mixed old/new rollout, the old and new code use different locks and tables and would not exclude each other. The release note says so.

### 5. API

**Generic routes** (`Servers/routes/extensionRuns.route.ts`, mounted under `/api/extensions`):

- **Gating.** All routes use `authenticateJWT` and a key-aware `requireExtensionEnabled`. Writes also need `authorize("extension.admin")`. A key with no registered sync provider calls `next()`, so it never shadows extension routers.
- **`POST /:key/runs`.** Starts an on-demand `manual` run.
  - 202 `{ jobId, previousRunId }`
  - 409 if a run is live
  - readiness `status` (400 or 404) with its `reason`
  - 503 if the queue is unavailable
- **`GET /:key/runs/status`.** Returns `{ schedule: { enabled, interval_hours, consecutive_failures, failing_since } | null, running, queued, latest_run }`.
  - `latest_run` is `{ id, kind, status, code, counts, message, started_at, completed_at, is_live }`, chosen from status kinds only.
  - `queued` is null when the queue doesn't answer.
- **`GET /:key/runs?limit=`.** Default 20, maximum 200.
- **`PATCH /:key/schedule`.** Takes `{ enabled?, interval_hours? }` and validates 1–168.
  - The provider may refuse with its readiness `status`. Jira returns 404 when not configured, as today.
  - The change is written to the event log, as today. There is no audit-ledger entry.

**Existing Jira Assets routes.** These stay at the same URLs with the same responses, now served by the engine:

| Route | Served as |
|---|---|
| `POST /api/extensions/jira-assets/sync` | the engine's manual run |
| `GET /sync/status` | the old shape (mapping below), and `data: null` when Jira isn't configured |
| `GET /sync/history` | old-shape rows, capped at 200 |
| `PATCH /config/sync` | the engine's schedule |
| `GET /config` | `last_sync_*` now derived from the engine (mapping below) |

The old-shape mapping:

- `sync_type` = `kind`.
- `objects_*` come from `counts`.
- `error_message` = `message`.
- `status`: `completed` → `completed`; `failed`, `abandoned` or `skipped` → `failed`.
- `code`: `"abandoned"` or `"skipped"`. Abandoned rows carry `ABANDONED_RUN_MESSAGE`, and skipped rows carry `SKIPPED_RUN_MESSAGE`.
- `last_sync_at`, `last_sync_status` (`'success'` or `'failed'`) and `last_sync_message` come from the newest *finished* manual or scheduled run whose status is `completed` or `failed`. Abandoned and skipped rows are ignored, as today.
- `sync_enabled` and `sync_interval_hours` come from `extension_sync_settings`.

The client moves to the generic routes through the shared panel's hook. These routes stay for API compatibility and are marked deprecated in swagger. Removing them is a follow-up after one release.

### 6. UI

- **`useExtensionSync(key)`** (`Clients/src/application/hooks/`) handles the status query, the schedule mutation and "Sync now". It takes over the polling logic from the Jira panel: every 3 seconds, up to 20 minutes, stopping after 3 idle polls with nothing queued, nothing running and no newer run. In this release it calls the generic routes.
- **`ExtensionSyncPanel`** (`Clients/src/presentation/components/ExtensionSyncPanel/`) reproduces today's Jira sync section:
  - the scheduled-sync toggle;
  - the interval field;
  - "Sync now" (`CustomizableButton`);
  - the "Last sync" line and running state;
  - outcome messages.

  It adds "Failing since <date>" when `consecutive_failures > 0`. All copy is sentence case, with de/fr/es translations.
- **Jira Assets panel.** It renders `<ExtensionSyncPanel extensionKey="jira-assets" />` in place of its sync section. `runOutcome.ts` reads `status` and `code` (`abandoned` and `skipped`) from the generic status, so outcomes look the same as today.

### 7. Jira Assets on the engine

`jiraAssetsSyncProvider` declares:

- **Kinds:** `manual`, `scheduled`, `import` and `remove_missing`. Single delete keeps using the `remove_missing` kind, as today. `scheduledKind` is `"scheduled"`.
- **`readiness(orgId, kind)`:**
  - `manual`: 404 without a config, 400 without an object type.
  - `scheduled`: not ready without an object type or without use cases.
  - `import` and `remove_missing`: the checks their routes make today.
- **`run`:** today's `runClaimedSync` body. `touchHeartbeat` becomes `ctx.heartbeat()`, and `SQL_RUN_STILL_OWNED` / the inline history-table fragments become `ctx.sqlOwnsRun()`.

Import, remove-missing and single delete use `withClaim`, finalizing or releasing inside their data transactions as today. Their locking (projects before links) and the rule that only fully selected projects are deleted are unchanged.

The Jira-specific claim, heartbeat, finalize, scheduler, check job and per-org job handler are removed, apart from the old job-name routing in section 4. Code that stops using `scheduledSync.utils.ts` drops its import, and the file is deleted if nothing else uses it.

## Errors and edge cases

- **Run in flight during the deploy.** Its row is copied as `started` with its token. The old worker is gone, so the row goes stale and the next claim closes it as `abandoned` after 15 minutes.
- **Two ticks at once.** The advisory lock and the partial unique index make the second claim fail. A scheduled skip records nothing.
- **Provider throws without a code.** The run is `failed`, `message` is the truncated `error.message`, and `code` is null.
- **Clock skew.** The database writes every timestamp (`now()`).
- **Organization deleted.** Both tables cascade.

## Testing

- **Engine unit tests:**
  - claim, stale close and live conflict;
  - heartbeat and superseded runs;
  - finalize and release, inside and outside a caller transaction;
  - wrong-token finalize writes nothing;
  - the backoff formula and the due query (a SQL-shape test plus a throwaway Postgres check);
  - an interval change while backed off;
  - an abandoned scheduled run counts as a failure;
  - skip rules at pickup;
  - unknown keys call `next()`.
- **Migration:** a throwaway Postgres check of the history and status mapping, including several `started` rows per org and null-token rows, plus the id and sequence, the settings copy, `down()`, and `up()` again.
- **Jira provider:**
  - the existing Jira Assets suites keep passing, adapted to the engine;
  - old-route response shapes match today's, as snapshot-style assertions;
  - `GET /config` `last_sync_*` derivation;
  - the old job names route to the engine.
- **Tenant isolation:** registry entries for both tables, plus a hand-written `extensionRuns.isolation.test.ts`, since the CRUD matrix is id-based and these routes are keyed by `:key`.
- **Client:**
  - `useExtensionSync` polling;
  - `ExtensionSyncPanel` states (idle, running, failing since, skipped, abandoned);
  - the Jira panel renders the shared panel.

## Docs

- Update the "Scheduled sync" section of `docs/technical/infrastructure/extensions.md`: the engine, the provider contract, and how to add a provider.
- Update the "Last Updated" dates on any CLAUDE.md that is touched.
- Regenerate `Servers/swagger.yaml` and the endpoint registry (`generate:swagger`, `generate:endpoints`).
