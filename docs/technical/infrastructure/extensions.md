# Extensions

> Replaces the former plugin system (removed in August 2026). For compliance
> frameworks, see [Compliance Frameworks](../domains/compliance-frameworks.md)
> and [Adding a New Compliance Framework](../guides/adding-new-framework.md).
> Frameworks are not extensions.

## Overview

Extensions are optional integrations that ship inside the VerifyWise codebase.
An Admin turns one on or off for their organization. Nothing is downloaded,
installed or built at runtime. There is no marketplace, no separate repository,
no `template.json` and no install/uninstall step.

Each extension has:

- a **catalog row** in `verifywise.extensions`, seeded by a migration
- an optional **declarative config form** in `verifywise.extension_config_fields`
- a **per-organization state row** in `verifywise.extension_enablements`
- **server code** in `Servers/extensions/<key>/`, mounted at
  `/api/extensions/<key>` behind the `requireExtensionEnabled("<key>")` gate
- **client code** in `Clients/src/presentation/pages/Extensions/<key>/`, shown
  only when `useExtensions().isEnabled("<key>")` is true

```
Browser ──► ExtensionsProvider (GET /api/extensions, once per session)
              │  isEnabled(key) gates tabs, buttons, menu items
              ▼
        /api/extensions            catalog router (list, detail, enable, disable,
                                   configuration, test-connection)
        /api/extensions/<key>/...  per-extension routers
              │  authenticateJWT → requireExtensionEnabled(key)
              ▼
        ExtensionService.getRuntimeConfiguration(key, orgId)  → decrypted config
```

---

## Data model

All three catalog tables are created by
`Servers/database/migrations/20260811102307-extensions-migration.js`.

### `extensions` (catalog, one row per extension)

| Column | Notes |
|--------|-------|
| `key` | Unique. `CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,63}$')` |
| `name`, `display_name`, `description`, `long_description` | Catalog text |
| `version`, `author` | Shown on the card as "`<Category> · v<version>`" |
| `category` | `CHECK` limited to `communication`, `ml_ops`, `data_management`, `version_control`, `monitoring`, `security`, `analytics`. A new category is a schema change. |
| `icon_path` | Path under `Clients/public/assets/extensions/` (set by `20260818124348-extension-icon-paths.js`) |
| `documentation_url`, `support_url` | Optional links |
| `requires_configuration` | Drives the "Configuration required" label and the **Test connection** button |
| `features` (JSONB array), `tags` (TEXT[]) | Catalog metadata |

The catalog is not tenant-scoped. It is the same for every organization.

### `extension_config_fields` (declarative config form)

One row per field. The client renders these with
`Clients/src/presentation/components/ExtensionConfigForm` on the settings page.

| Column | Notes |
|--------|-------|
| `extension_id` | FK → `extensions.id` (CASCADE) |
| `field_key` | `CHECK (field_key ~ '^[a-z_][a-z0-9_]{0,99}$')`, unique per extension |
| `field_type` | `text`, `textarea`, `url`, `email`, `password`, `number`, `boolean`, `select`, `multiselect` |
| `label`, `help_text`, `placeholder`, `display_order` | Presentation |
| `is_required` | Enforced on enable and on configuration update |
| `is_secret` | Value is encrypted at rest and never returned by the API |
| `default_value` | Stored as text |
| `options` (JSONB array) | `[{ label, value }]` for `select` / `multiselect` |
| `validation` (JSONB object) | `minLength`, `maxLength`, `pattern`, `min`, `max` |

Only **MLflow** and **Azure AI Foundry** have config fields today. Slack and
Jira Assets fields were removed by
`20260819105546-remove-dead-extension-config-fields.js` because nothing read
them. Those extensions are configured after enabling, through their own panels.

### `extension_enablements` (per organization)

| Column | Notes |
|--------|-------|
| `organization_id` | FK → `organizations.id` (CASCADE). Unique with `extension_id`. |
| `extension_id` | FK → `extensions.id` (CASCADE) |
| `enabled` | Boolean |
| `configuration` | JSONB object. `is_secret` values are ciphertext. |
| `enabled_at` | `CHECK (NOT enabled OR enabled_at IS NOT NULL)` |
| `enabled_by` | FK → `users.id` (SET NULL) |

A row exists once an organization has enabled the extension at least once.
Disabling does not delete it.

### Extension-owned data tables

These tables exist in every database, whether or not any organization has
enabled the extension. All are tenant-scoped by `organization_id`.

| Extension | Tables |
|-----------|--------|
| slack | `slack_webhooks` (predates extensions) |
| mlflow | `mlflow_model_records` (synced runs; `mlflow_integrations` also predates extensions) |
| azure-ai-foundry | `azure_ai_model_records` |
| model-lifecycle | `model_lifecycle_phases`, `_items`, `_values`, `_item_files`, `_item_people`, `_item_approvals`, `_change_history` |
| jira-assets | `jira_assets_config`, `jira_assets_use_cases`, sequence `jira_use_case_uc_id_seq`; runs and schedule in the shared `extension_sync_runs` / `extension_sync_settings` (the old `jira_assets_sync_history` is kept, unwritten, for one release) |
| jira-incidents | `jira_incidents_config`, `jira_incident_links`, `jira_incident_sync_events`; imported incidents live in the core `ai_incident_managements`; runs and schedule in `extension_sync_runs` / `extension_sync_settings` |
| risk-import, dataset-bulk-upload | None. They write to the core `risks` and `datasets` / `files` tables. |

---

## Server

### Catalog service

`Servers/services/extension/extensionService.ts`, class `ExtensionService`:

| Method | Purpose |
|--------|---------|
| `listAll(orgId, category?)` | Catalog + config fields + this org's state, secrets stripped |
| `getByKey(key, orgId)` | Same, for one extension |
| `enable(key, orgId, userId, configuration)` | Merge with stored config, encrypt secrets, validate, upsert `enabled = true` |
| `disable(key, orgId)` | Set `enabled = false`. 404 if the org never enabled it. |
| `updateConfiguration(key, orgId, configuration)` | Merge, encrypt, validate, save. 404 if the org never enabled it. |
| `getRuntimeConfiguration(key, orgId)` | Full config with secrets **decrypted**, for server-side use only. Returns `{}` if there is no enablement row. |

Each read response (`assemble`) contains the catalog fields, `configFields`,
`enabled`, the redacted `configuration` and the raw `enablement` row.

### Secrets and validation

- On write, `mergeAndEncrypt` keeps only known `field_key`s. Secret values are
  encrypted with `encrypt()` from `Servers/utils/encryption.utils.ts`
  (AES-256-GCM, key from `ENCRYPTION_KEY`; legacy AES-256-CBC values still
  decrypt).
- If a secret field is missing or blank in the payload, the stored ciphertext
  carries over. This is how the UI's "Leave blank to keep the existing value"
  works. Non-secret fields that are missing from the payload are dropped,
  because the caller sends the full non-secret shape each time.
- `validate` enforces `is_required` (a required secret passes if a previous
  value exists), type checks per `field_type`, `options` membership and the
  `validation` rules. It rejects unknown keys.
- On read, `redactSecrets` removes secret keys entirely. Masked values are not
  returned either.
- Per-extension code must read config through `getRuntimeConfiguration`. Never
  return that result to the client.

Jira Assets is the exception. It keeps its connection settings, including its
own encrypted `api_token` (via `Servers/tools/createSecureValue`), in the
`jira_assets_config` table. Its `extension_enablements.configuration` is empty.

### Catalog routes

`Servers/routes/extension.route.ts`, mounted at `/api/extensions`. Controllers
are in `Servers/controllers/extension.ctrl.ts`.

| Method | Path | Roles | Body |
|--------|------|-------|------|
| GET | `/api/extensions` | Any authenticated user | `?category=` optional |
| GET | `/api/extensions/:key` | Any authenticated user | |
| POST | `/api/extensions/:key/enable` | Admin | `{ configuration?: {...} }` |
| POST | `/api/extensions/:key/disable` | Admin | |
| PATCH | `/api/extensions/:key/configuration` | Admin | `{ configuration: {...} }` |
| POST | `/api/extensions/:key/test-connection` | Admin | `{ configuration?: {...} }` |

Keys are checked against `EXTENSION_KEY_PATTERN`, so a malformed key gets a 400.
An unknown key gets a 404 ("Extension not found"). A `ValidationException` gets
a 400.

**Mount order matters.** In `Servers/app.ts` the catalog router is registered
before the seven per-extension routers. Otherwise a per-extension mount such as
`/api/extensions/slack` would catch `GET /api/extensions/slack` and return 403
through the gate. Per-extension sub-paths are all multi-segment (`/models`,
`/oauth/workspaces`, ...), so they never collide with `/:key`.

### Gate middleware

`Servers/middleware/requireExtensionEnabled.middleware.ts`

```ts
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";

router.use(authenticateJWT);
router.use(requireExtensionEnabled("mlflow"));
```

| Condition | Response |
|-----------|----------|
| No `req.organizationId` | 401 "User not authenticated" |
| Key not in the catalog | 404 "Extension '`<key>`' not found in catalog" |
| No enablement row, or `enabled = false` | 403 "Extension '`<key>`' is not enabled for this organization" |
| Lookup error | 500 |

The key → id lookup is cached in process. The catalog only changes through
migrations.

### Test connection

`TEST_CONNECTION_DISPATCH` in `Servers/controllers/extension.ctrl.ts` maps a key
to a runner that returns `{ success, message, testedAt }`:

| Key | Runner |
|-----|--------|
| `mlflow` | Stored runtime config overlaid with the submitted config → `testConnection` in `extensions/mlflow/mlflow.service.ts` |
| `azure-ai-foundry` | Same pattern → `testConnection` in `extensions/azure-ai-foundry/azureAiFoundry.service.ts` |
| `jira-assets` | Submitted config. If no `api_token` is submitted, the stored token comes from `jira_assets_config`. Then `clientFromConfig(...).testConnection()`. |
| `jira-incidents` | `testConnection(orgId, submitted)` in `extensions/jira-incidents/jiraIncidents.config.ts`: submitted fields overlaid on `jira_incidents_config`; a changed site URL or email needs a submitted token; checks `/myself`, then the three project permissions when a project is known. Never throws. |

Any other key returns **200** with `success: false` and "Test connection is not
available for '`<key>`'." It never 404s. Neither Jira extension has a route of
its own for this. A `/test-connection` route under `/api/extensions/<key>`
would be shadowed by the catalog router.

---

## Client

| Piece | Path |
|-------|------|
| Context | `Clients/src/application/contexts/Extensions.context.tsx`: `ExtensionsProvider` (mounted in `App.tsx`) and `useExtensions()` → `{ extensions, loading, error, refetch, enable, disable, updateConfiguration, isEnabled(key), getByKey(key) }` |
| Repository | `Clients/src/application/repository/extension.repository.ts`: `listExtensions`, `getExtensionByKey`, `enableExtension`, `disableExtension`, `updateExtensionConfiguration`, `testExtensionConnection` |
| Types | `Clients/src/domain/types/extensions.ts` |
| Catalog page | `Clients/src/presentation/pages/Extensions/index.tsx`, route `/extensions` |
| Settings page | `Clients/src/presentation/pages/Extensions/Settings/index.tsx`, route `/extensions/:key/settings` |
| Generic config form | `Clients/src/presentation/components/ExtensionConfigForm` |
| Per-extension UI | `Clients/src/presentation/pages/Extensions/<key>/` |
| Header entry point | `Clients/src/presentation/components/Layout/DashboardActionButtons.tsx` (disabled for non-Admins) |
| Icons | `Clients/public/assets/extensions/<key>.svg` (Azure uses `.jpg`) |

The provider fetches `/api/extensions` once the user has a token and an
organization, and clears it on logout. Mutations update the local cache, so
gated UI re-renders straight away.

Both pages redirect non-Admins to `/` (`userRoleName !== "Admin"`). The old
`/plugins` route has no redirect.

**Catalog card buttons** (`Extensions/index.tsx`): **Enable** when there are no
pre-enable fields; **Configure to enable** when there are; **Configure** when
enabled and the extension has a settings surface; **Disable** when enabled. A
settings surface is either config fields or membership in
`KEYS_WITH_POST_ENABLE_UI` (`slack`, `model-lifecycle`, `jira-assets`,
`jira-incidents`).

**Settings page** (`Extensions/Settings/index.tsx`): a **Configuration** card
when `configFields.length > 0`. Then the extension's own panel for `slack`
(`SlackConfiguration`), `model-lifecycle` (`ModelLifecycleConfig`),
`jira-assets` (`JiraAssetsConfiguration`) or `jira-incidents`
(`JiraIncidentsConfiguration`). Then the **Enable**/**Disable**,
**Save configuration** and **Test connection** actions. **Test connection**
appears for any enabled extension with `requires_configuration = true`. For
Slack and Model Lifecycle it therefore shows the "not available" message. For
Jira incidents it tests the saved connection (the panel has its own **Test
connection** for unsaved values).

---

## The eight extensions

| Key | Category | Config fields | Server dir | Client dir | Where it surfaces |
|-----|----------|---------------|------------|------------|-------------------|
| `slack` | communication | none (post-enable panel) | `Servers/extensions/slack/` (reuses `controllers/slackWebhook.ctrl.ts`) | `Extensions/slack/` | Settings page panel: **Add to Slack** OAuth, workspace table, notification routing |
| `mlflow` | ml_ops | `tracking_server_url` (url, required), `auth_method` (select none/basic/token, default none), `username`, `password` (secret), `api_token` (secret), `timeout` (number 1–600, default 30; per-request) | `Servers/extensions/mlflow/` | `Extensions/mlflow/` (`MLFlowTab`) | Model inventory **MLFlow** tab with manual **Sync** |
| `azure-ai-foundry` | ml_ops | `project_endpoint` (url, required), `api_key` (secret, required), `subscription_id`, `resource_group`, `resource_name` (optional) | `Servers/extensions/azure-ai-foundry/` | `Extensions/azure-ai-foundry/` (`AzureAIFoundryTab`) | Model inventory **Azure AI Foundry** tab with **Sync**; Agent discovery (`AgentTable`) |
| `model-lifecycle` | ml_ops | none (post-enable panel) | `Servers/extensions/model-lifecycle/` | `Extensions/model-lifecycle/` | **View lifecycle** in Model inventory rows; model lifecycle detail page |
| `risk-import` | data_management | none | `Servers/extensions/risk-import/` | `Extensions/risk-import/` | Risk management → **Import from Excel** |
| `jira-assets` | data_management | none (post-enable panel, stored in `jira_assets_config`) | `Servers/extensions/jira-assets/` | `Extensions/jira-assets/` | Imported use cases; Jira use-case views in `ProjectView/V1.0ProjectView` |
| `jira-incidents` | data_management | none (post-enable panel, stored in `jira_incidents_config`) | `Servers/extensions/jira-incidents/` | `Extensions/jira-incidents/` | Imported incidents; a Jira chip on the incidents table and the incident header (`components/JiraIssueChip`) |
| `dataset-bulk-upload` | data_management | none | `Servers/extensions/dataset-bulk-upload/` | `Extensions/dataset-bulk-upload/` | Datasets → **Bulk upload** |

Client dirs are relative to `Clients/src/presentation/pages/`.

### Per-extension routes

Every router begins with `authenticateJWT` and then
`requireExtensionEnabled("<key>")`. Role checks beyond that are listed. Where
none is listed, any authenticated user in an organization with the extension
enabled can call the route.

| Base path | Routes | Extra roles |
|-----------|--------|-------------|
| `/api/extensions/slack` | `GET/POST /oauth/workspaces`, `GET/PATCH/DELETE /oauth/workspaces/:id`, `POST /oauth/workspaces/:id/send` | `POST /oauth/workspaces` rate-limited (`slackWorkspaceCreateLimiter`, 10/hour) |
| `/api/extensions/mlflow` | `GET /models`, `GET /models/:modelId`, `POST /sync` | |
| `/api/extensions/azure-ai-foundry` | `GET /models`, `GET /models/:deploymentId`, `POST /sync`, `GET /discover` | |
| `/api/extensions/model-lifecycle` | `GET /config`; phases CRUD and reorder; items CRUD and reorder; `GET /models/:id/lifecycle`, `/progress`; item values, files, people and approvals under `/models/:id/lifecycle/items/:itemId/...` `POST .../items/:itemId/files` links only a file of the caller's organization (404 otherwise). | `DELETE .../items/:itemId/files/:fileId` only unlinks: the `files` row stays in the File Manager. Deleting a phase or item also keeps its files. 404 when the item has no link to the file, 400 when an id is not a positive integer up to 2147483647. |
| `/api/extensions/risk-import` | `GET /template`, `POST /import` | Admin, Editor |
| `/api/extensions/jira-assets` | `GET/POST /config`, `PATCH /config/sync`, `PATCH /config/selection`, `GET /vw-attributes`, schema and object-type discovery (`GET /object-types/:id/objects?startAt=` is one page of up to 1000 for the import picker), `POST /import`, `POST /sync` (202, queued for the worker), `GET /sync/status`, `GET /sync/history`, `GET /use-cases`, `POST /use-cases/remove-missing`, `GET/DELETE /use-cases/:id`, `GET /projects/:projectId/custom-frameworks-progress` | `extension.admin` (Admin) on `POST /config`, `PATCH /config/sync`, `PATCH /config/selection`, `POST /import`, `POST /sync`, `POST /use-cases/remove-missing`, `DELETE /use-cases/:id`. Errors: 400 bad input, 404 not configured, 409 a run is live or a sync job is waiting, 502 Jira or network failure (reason in `error`), 503 the job queue did not answer. |
| `/api/extensions/jira-incidents` | `GET/PUT /config`, `GET /jira/projects`, `GET /jira/issue-types?project=`, `GET /jira/statuses?project=&issue_type=` (with `default_map_in` / `default_map_out`), `GET /jira/priorities` (with `default_severity_map`), `GET /jira/labels?query=`, `GET /events?limit=` (1–200, default 50), `GET /links?incident_ids=` (at most 500) | `extension.admin` (Admin) on every route, reads included, **except `GET /links`**: it is registered before the extension gate, open to any member, and returns `[]` when the extension is disabled. Errors: 400 bad input or "Connect to Jira first" on the pickers, 502 Jira's answer (401 from Jira included) or a network failure. |
| `/api/extensions/dataset-bulk-upload` | `POST /upload` (multipart, one file per request, 30 MB, CSV/XLS/XLSX; 413/415 on error) | Admin, Editor |

The full list is in `Servers/swagger.yaml` under `/extensions/...`.

### Environment variables

Only Slack needs deployment-level settings: `SLACK_CLIENT_ID`,
`SLACK_CLIENT_SECRET` and `SLACK_API_URL` on the server, and
`VITE_SLACK_CLIENT_ID` and `VITE_SLACK_URL` on the client. The other
extensions are configured per organization in the UI.

Jira incidents reads `FRONTEND_URL` to build the remote link it adds to each
imported Jira issue (skipped, with one warning per run, when unset), and
`JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL=true` lets the site URL be
`http(s)://localhost` or `127.0.0.1` for the local mock. That override only
counts when `NODE_ENV` is `development` or `test`; set anywhere else, the
server logs a warning at startup (`warnIfLocalOverrideIgnored`, `index.ts`)
and ignores it.

---

## Enable and disable semantics

- **Enable** upserts the enablement row with `enabled = true`, `enabled_at`
  and `enabled_by`. Any submitted `configuration` is merged into the stored
  config and validated. Re-enabling keeps earlier config values.
- **Disable** sets `enabled = false`. Configuration, secrets and all
  extension-owned data (synced models, lifecycle phases, Jira use cases, Slack
  webhooks) are **kept**. Re-enabling restores access to them. The UI shows no
  confirmation dialog.
- **There is no uninstall** and no way to purge an extension's data from the
  UI or API.
- While disabled, the gate returns 403 on every `/api/extensions/<key>/...`
  route and the client hides the extension's entry points.
- MLflow and Azure AI Foundry sync is manual only. Jira Assets also refreshes
  its imported use cases on the configured interval (see
  [Scheduled sync](#scheduled-sync)). The scheduler skips organizations where
  the extension is disabled. No Jira Assets sync ever deletes a use case:
  objects gone from Jira are flagged, and an Admin removes them explicitly.

---

## Scheduled sync

Runs of an extension (scheduled syncs, "Sync now", and any other exclusive
operation such as an import) go through the **sync engine** in
`Servers/extensions/sync-engine/`. Its providers are Jira Assets and Jira
incidents ([below](#jira-incidents)). MLflow and Azure AI Foundry still sync on
their own `POST /sync` routes.

**No sync deletes anything.** Neither a manual nor a scheduled sync removes a
project, a use case or an incident; Jira incidents marks a link
`deleted_in_jira` and leaves the incident alone. A linked object Jira no longer returns is
flagged instead (`jira_assets_use_cases.missing_in_jira_since`). An Admin
removes flagged use cases explicitly from the panel (see
[Removing missing use cases](#removing-missing-use-cases)).

### Tables

- `extension_sync_runs`: one row per claimed run or recorded skip, for every
  extension: `kind` (a kind the provider declares), `status` (`started`,
  `completed`, `failed`, `abandoned`, `skipped`), `code` (`abandoned`,
  `skipped` or a provider code), `counts` (JSONB, provider-defined),
  `message` (cut to 2,000 characters), `run_token`, `triggered_by`, and
  TIMESTAMPTZ `started_at`, `heartbeat_at`, `completed_at`. A partial unique
  index allows one `started` row per organization and extension.
- `extension_sync_settings`: one row per organization and extension with a
  schedule: `enabled`, `interval_hours` (1 to 168), `consecutive_failures`,
  `failing_since`, and `updated_by` (who last changed the schedule; null for
  rows copied by the migration and for system changes).

Both cascade with the organization. Migration
`20261013105301-extension-sync-engine.js` created them and copied Jira Assets'
schedule and history (ids kept). `node scripts/checkExtensionSyncMigration.js`
and `node scripts/checkExtensionSyncEngineSql.js` check the migration and the
engine's SQL on a throwaway Postgres. They need `initdb`/`pg_ctl` on the PATH
and are not run by `npm run test` or CI (Jest mocks sequelize), so run both by
hand after any change to `sql.ts` or the migration.

### The provider contract

```ts
interface SyncProvider {
  key: string;                    // extensions.key, /^[a-z0-9-]+$/
  displayName?: string;           // name in event-log text ("Jira Assets"); the key when absent
  kinds: readonly string[];       // every exclusive operation; must include "manual"
  scheduledKind?: string;         // the kind the tick queues; no schedule if absent
  runDeadlineMs?: number;         // ctx.signal deadline (default 10 minutes)
  readiness(orgId, kind): Promise<{ ready: true } | { ready: false; status: 400 | 404; reason: string }>;
  canSchedule?(orgId): Promise<Readiness>;   // may refuse PATCH /:key/schedule
  run(ctx: RunContext): Promise<RunResult | void>;  // void when it finalized itself
}
```

`RunContext` gives a run `orgId`, `runId`, `kind`, `payload`, `triggeredBy`,
`heartbeat(t?)` (throws `RunSupersededError` once the claim is lost; without
`t` it runs in its own short transaction with a 10-second `lock_timeout`),
`sqlOwnsRun(alias?)` (a SQL boolean that share-locks the run's row, for guarded
writes), `assertOwned(t)`, `finalize(result, t?)`, `release(t?)` and `signal`
(aborted at the deadline). `RunResult` is `{ counts, message?, code? }`.

Inside a transaction that used `sqlOwnsRun` or `assertOwned`, pass that
transaction to `heartbeat`, `finalize` and `release`. Called without it, they
wait on the share lock the transaction itself holds.

### Claims

`claimRun(key, orgId, kind, triggeredBy)` runs in one transaction:
`pg_advisory_xact_lock(hashtext('ext_sync:' || key), orgId)`; close `started`
rows with no heartbeat for 15 minutes as `abandoned` (code `abandoned`); throw
`SyncInProgressError` if a live run remains; otherwise insert a `started` row
with a random token. Every heartbeat and finalize matches id, org, extension,
token and `started`, so a duplicate job delivery cannot co-own a run. One claim
per (extension, organization) covers every kind, so a Jira import and a Jira
sync never overlap.

- `runClaimed(provider, ctx)` (the worker) finalizes a returned result. A
  thrown error closes the run as `failed` with its message and its `code` if it
  has one. A `RunSupersededError` writes nothing.
- `withClaim(key, orgId, kind, triggeredBy, fn, { releaseOn })` is for
  exclusive operations outside syncs. It claims, calls `fn(ctx)`, and then
  finalizes `fn`'s result, or releases the claim when there is no result or
  `releaseOn(err)` matches. Other errors fail the run. An operation that needs
  rollback safety calls `ctx.finalize(result, t)` or `ctx.release(t)` inside
  its own data transaction.

### Schedule, backoff and the tick

`extension_sync_tick` (`scheduleExtensionSyncTick`, every 5 minutes,
non-obliterating, registered in `addAllJobs()`) first closes every org's stale
`started` runs of each provider with a schedule (`closeStaleRunsForProvider`,
each org under its own advisory lock), so an abandoned scheduled run raises the
backoff before the due check; then it runs `DUE_RUNS_SQL` once per provider. It
selects settings rows that are enabled, whose
extension is enabled for the org (jobs bypass `requireExtensionEnabled`, so the
join is the enablement check), with no live run, and whose due time has passed:
`last_run` is the newest `started_at` of a manual or scheduled run that was not
skipped (history copied from `jira_assets_sync_history` has no `run_token` and
still counts), and the org is due when `last_run` is null or
`now() >= last_run + GREATEST(interval_hours, backoff(consecutive_failures))`
hours. `backoff(n)` is 0, then 1, 2, 4, 8, 16, and 24 hours; the exponent is
clamped, so a long streak cannot overflow. An interval change applies on the
next tick. A due org that is not ready (`readiness(orgId, scheduledKind)`)
records and logs nothing.

A scheduled run that fails, or is closed as abandoned, adds one to
`consecutive_failures` and, on the first failure of a streak, sets
`failing_since` to that run's start. Any completed manual or scheduled run
clears both. There is no auto-disable; turning automatic sync off keeps the
streak, but the panel shows "Failing since" only while it is on.

Behaviour change from the Jira-only scheduler: `last_run` is now the newest
run's start; it used to be bounded by `last_sync_at`, the finish. Scheduled
runs can move earlier by up to one run's duration.

### Jobs

`extension_sync_run` carries `{ key, orgId, kind, triggeredBy, payload }`
under jobId `ext-sync-<key>-<orgId>`, with one attempt, removed on complete and
on fail. `enqueueExtensionSyncRun` adds nothing when a job for the pair is
already waiting (`queued: false`); a queue call made for an HTTP request gives
up after 5 seconds with `BackgroundJobsUnavailableError` (503). The worker
(`runExtensionSyncJob`) validates the payload and claims at pickup. If a run is
live, a manual job records a `skipped` row (no token, "Another sync or import
was running, so this sync did not start.") and a scheduled job records nothing.
Enablement is not checked at pickup.

The worker also accepts the old Jira job names for one release:
`jira_assets_scheduled_sync_check` runs the tick and `jira_assets_sync_run` runs
the engine's job. **Deploy the API and the worker together**: during a mixed
old/new rollout the old and new code use different locks and tables and would
not exclude each other.

Two effects of the deploy itself:

- `Servers/start.sh` starts the worker before migrations run. A job queued just
  before the deploy and picked up before the new tables exist fails once
  (`attempts: 1`) and is dropped. A scheduled run is simply queued again by the
  next tick; a "Sync now" clicked in that window has to be clicked again.
- A Jira Assets run that was going when the old worker stopped is copied as a
  live `started` run. Until it is closed as `abandoned`, up to 15 minutes later,
  "Sync now", import and removal answer 409. If it was a scheduled run, that
  close counts as one scheduled failure, so "Failing since" can appear once.

### Routes

Generic routes (`Servers/routes/extensionRuns.route.ts`, mounted at
`/api/extensions`) use `authenticateJWT` and `requireExtensionEnabledFromParam`;
writes need `extension.admin`. A key without a sync provider falls through to
the per-extension routers.

- `POST /:key/runs`: a manual run. 202 `{ jobId, previousRunId }`; the
  readiness status (400 or 404) with its reason; 409 if a run is live or a job
  is waiting; 503 if the queue does not answer.
- `GET /:key/runs/status`: `{ schedule, running, queued, latest_run,
  last_finished_run }`. `latest_run` is the newest manual or scheduled run
  (`{ id, kind, status, code, counts, message, started_at, completed_at,
  is_live }`); `last_finished_run` is the newest one that completed or failed;
  `queued` is null when the queue does not answer.
- `GET /:key/runs?limit=`: default 20, maximum 200.
- `PATCH /:key/schedule`: `{ enabled?, interval_hours? }`, 1 to 168; the
  provider may refuse with its status; the change goes to the event log.

The old Jira Assets routes stay for one release, served by the engine with
their exact response shapes, and are deprecated (recorded here and in the
controller comments; the generated swagger has no deprecation marker):
`POST /sync`,
`GET /sync/status` (`data: null` when Jira is not configured), `GET
/sync/history` and `PATCH /config/sync`. `GET /config` derives `sync_enabled`,
`sync_interval_hours` and `last_sync_*` from the engine (`last_sync_*` is the
newest finished manual or scheduled run that completed or failed).

### The panel

`ExtensionSyncPanel` (`Clients/src/presentation/components/ExtensionSyncPanel/`)
and `useExtensionSync(key)` (`Clients/src/application/hooks/`) give any
provider the sync section: the automatic sync toggle and interval, "Sync now",
the last finished sync, the running state (a run going or a job queued), the
outcome messages, and "Failing since <date>" while automatic sync is on and
scheduled runs keep failing.
The status query refreshes every 3 seconds while a run is running or queued.
`showSyncNow` and `syncNowDisabled` keep the page's own rules for the button;
with `persistSchedule={false}` (before a connection is saved) schedule changes
stay a draft that the page sends with its own save (`onScheduleChange`).
"Sync now" polls the status every 3 seconds, for up to 20 minutes, and stops
at the first of:

- a run newer than `previousRunId` has finished: its counts, or its message
  (`skipped` runs say why they did not start);
- that newer run stopped heart-beating, or was closed as `abandoned`: "The sync
  stopped responding. Try again.";
- nothing queued or running and no newer run for three polls: "The sync did
  not start. Try again."

### Jira Assets on the engine

`jiraAssetsSyncProvider` declares the kinds `manual`, `scheduled`, `import`
and `remove_missing` (single delete is recorded as `remove_missing`).
Readiness: `manual` needs a config (404) and an object type (400), not
existing use cases; `scheduled` also needs at least one use case; `import`
needs a config; `remove_missing` needs nothing. The run body is `runJiraSync`.
Import, remove-missing and single delete use `withClaim`; removal and delete
finalize or release inside their data transaction.

**What a sync does** (`runJiraSync`):

- **Scheduled** (`triggered_by = NULL`) is refresh-only. It updates the
  project and link row of every linked object Jira returns, and creates
  nothing.
- **Manual** ("Sync now") also creates use cases for new objects of the
  selected type, owned by the user who clicked.
- **Flags:**
  - Both clear `missing_in_jira_since` on every object Jira returns.
  - After a walk that was complete and returned at least one object, both set
    the flag on linked objects that were not returned. An existing flag keeps
    its earlier date.
  - The flag is set only on links whose stored object type
    (`data.objectType.id`) is the type that was just walked. The query checks
    this again in SQL. A link from another or an unknown type is never flagged
    by that walk, and is left exactly as it was. Switching the selected type
    therefore never flags the old type's use cases.
  - Every per-object write happens only while the run still owns its claim.
    The link update (which clears any missing flag) and the project update are
    guarded by `ctx.sqlOwnsRun()`, which share-locks the run's own `started`
    row, so a claim closing the run as abandoned must wait for the statement.
    If the run no longer owns its claim, nothing is written and the run stops
    with `RunSupersededError`. A new use case is created in a transaction that
    first calls `ctx.assertOwned(t)`. Setting flags carries the same guard.
  - After an incomplete or empty walk, no flag is set. A false "complete"
    would only mis-flag, which the next complete sync clears.
- The run's note (`message` on the completed run) lists the missing objects.
  It also says whether they were flagged, or why not. The run's counts are
  `fetched`, `created`, `updated`, `deleted` (always 0 for a sync), `missing`
  and `newly_missing`.

**Pagination, timeouts, deadline.** `JiraAssetsClient.getAllObjects` follows
the Assets API pages. Completeness now only decides whether flags may be set.

- **Cloud:** `POST object/aql?startAt=&maxResults=`. Only `isLast === true`
  proves the end, because `total` can be capped. The walk advances by the
  number of rows returned.
- **Data Center:** `GET iql/objects?...&page=&resultPerPage=`. The server may
  cap `resultPerPage`, so a short page alone proves nothing, and `pageSize`
  (the page count) is never used: a capping server may compute it from the
  size that was asked for. The walk is complete on an empty page, on
  `isLast === true`, or on as many distinct objects as `totalFilterCount`
  (on a short or repeated page only, since a count reached on a full page
  could be capped). A repeated page (some servers answer past the end with
  their last page) with none of these ends the walk incomplete. The accepted
  trade-off: a server that reports only `pageSize` and repeats its last page
  past the end never gets a complete walk, so its syncs refresh what they see
  but never flag anything as missing in Jira.

Every request has a 30-second timeout. The worker's walk has a 10-minute
deadline (`WORKER_SYNC_DEADLINE_MS`). When it passes, the run fails with
nothing changed. Every request, connection or body-read failure becomes
`JiraUpstreamError`. An error thrown by the sync's per-page heartbeat (a lost
claim) propagates as itself and is not reported as a deadline stop. The
import picker (`GET /object-types/:id/objects?startAt=`) returns one page of up
to 1000 as `{ objects, hasMore, nextStartAt }`, with **Load more** in the
panel. `POST /import` takes at most 100 `object_ids` per request
(`IMPORT_MAX_OBJECTS`, 400 above that), because it runs inside the request and
fetches each object from Jira in turn. The panel sends a bigger selection as
sequential batches of 100.

The import result carries `errors` for objects that could not be imported,
and `failed_ids` with their ids, so the panel can keep exactly those objects
selected for a retry.
An import that loses its claim returns 409 with
`{ message, code: "import_interrupted", imported, skipped }`.

**Claims, tokens, heartbeats.** Every Jira Assets run takes the engine claim
(see [Claims](#claims)). A run heartbeats after every fetched page, every 25
objects and before setting flags; a heartbeat that matches no row, or a
database error, stops it with no further writes. The earlier Jira-only
migrations (`20261012003957-jira-assets-sync-heartbeat.js`,
`20261012062548-jira-assets-missing-flag-and-run-token.js`) shaped the old
history table that `20261013105301-extension-sync-engine.js` copied.

**Removing missing use cases.** <a id="removing-missing-use-cases"></a> The
panel lists the flagged use cases under "Missing in Jira", with key, name and
the date they were flagged. The use case's overview shows a "Missing in Jira"
chip.

Each row has a checkbox, all unchecked by default, plus a select-all. An Admin
ticks the use cases to delete and clicks **Remove selected use cases (N)**.
They confirm in a `StandardModal` that shows the count and the list, and that
says the projects and their data will be deleted. The panel then calls
`POST /use-cases/remove-missing` with `{ use_case_ids }`, exactly the selected
ids. A request may name up to 1000 ids (`REMOVE_MISSING_MAX_IDS`) but cover
at most 100 use cases (`REMOVE_MISSING_MAX_PROJECTS`, the same number as the
import limit): the cost of a removal is one project deletion per use case. A
request covering exactly one use case is exempt from the id cap, up to 25,000
ids (`REMOVE_MISSING_SINGLE_USE_CASE_MAX_IDS`, the most objects a sync
walks), so a use case with many links can always be removed. The rule is
checked before claiming and again on the locked rows; a request that breaks
it is a 400 and leaves no run in the history. The panel groups the selected
ids by use case (`planBatches`), so every link of one use case goes in the
same request, and packs the groups into sequential requests of up to 100 ids;
a single use case with more than 100 links goes alone. It shows "Removing use
cases 101–200 / 250" and reports how many were removed. A batch rejected as
invalid (400) is reported ("Use cases not removed") and stays selected, and
the next batches still go; a 409 (sync running, removal interrupted) or any
other error stops the run. Import
batches the same way ("Importing objects …"), 100 objects per request;
objects a batch reports as failed make the outcome a warning with a "not
imported" count.

A removal reports each skipped id with a reason (`skipped_items`):
`no_longer_missing` and `not_found` leave the list on reload, and
`has_live_links` (still linked to an object Jira returns) has its own
message; all three are deselected. `other_links_not_selected` (other missing
items of the same use case were not ticked) and `changed` stay selected, with
a message saying why; so does a reason the panel does not know. "Use cases
removed" counts projects; "Jira links removed" is shown next to it when it
differs. Links cleaned up are counted separately ("Links cleaned up"). A
delete that failed shows the server's message, which names the use case by
the requested link's title and Jira key. Failed and unsent ids stay selected,
so a retry is one click.

After an import the panel reloads the imported use cases and applies
`finishImport`'s updaters with that fresh list to the latest state (a "Load
more" or toggle made meanwhile is kept): imported objects leave the picker
and the selection, and nothing else is dropped. A "Load more" page is
filtered against the imported ids known when it lands (`appendPage`, with the
ids set where the imported list is fetched), so one still in flight during an
import cannot bring imported objects back. Picker requests run through
`runPickerRequest` with a generation (`createRequestGate`): a reset, an
object-type change or a fresh load starts a new one, a response from an older
one is dropped (objects and paging alike), and the loading flag is always
cleared (a reset clears it, and so does a failed load). A refresh reloads as
many pages as were loaded before, up to 5 (`loadPages`,
`MAX_REFRESH_PAGES`), de-duplicating objects by id and stopping if the next
offset is missing or does not move forward. Ticks on objects in the reloaded
pages are kept; the stored selection is pruned to the reloaded list in the
same step, so past 5 pages ticks on objects beyond them are dropped. A reset
or type change clears the selection. The effective selection is also derived at render
(`keepShown`), so nothing selected is ever hidden. The outcome is shown last.
All of this lives in `jira-assets/batching.ts`.

`removeMissingUseCases` (through `deleteUseCasesUnderClaim`):

1. takes the same claim, so it cannot race a sync or import (409)
2. reads the listed links, unlocked, for their project ids; locks those
   projects in this organization in one statement (`ORDER BY id FOR UPDATE`),
   which also classifies them as in this organization or not; then locks the
   listed links, then every link of a locked project (two queries, each
   ordered by id), and decides each listed id from those locked rows.
3. for each project in this organization, deletes it once only when every
   link of it is in the request and flagged missing. A project that also
   backs a link Jira still returns is skipped (`has_live_links`); one with
   flagged links that are not in the request is skipped
   (`other_links_not_selected`). Nothing the admin did not tick is ever
   removed by cascade. Otherwise the project goes through
   `deleteProjectWithSideEffects` (see below): approval withdrawal, change
   history, `deleteProjectByIdQuery` (files, risks, members, per-framework
   rows, custom-field values). Its links go with it (cascade): two selected
   links to one project make one removed use case and two `links_removed`. A
   locked project that fails to delete throws `JiraUseCaseDeleteFailedError`,
   which names the use case by the requested link's title and Jira key; the
   whole removal rolls back and the route returns 500 with that message. The
   `project_deleted` automation is queued after the transaction commits
   (`enqueueAutomationAfterCommit`), so a rolled-back removal fires none.
4. for a link with no project, or whose project is not in this organization
   (another organization's, or a bad id), deletes only the link row: no
   project is touched, no change history is written and no automation fires.
   It is reported as `unlinked`, not as a removed use case. Without this,
   such a link could never leave the "Missing in Jira" list. The database
   now enforces same-organization links (see below), so in practice this
   only handles links with a NULL `project_id`; the cross-organization check
   is unreachable and stays only until that migration's rollback window has
   passed.
5. records the run (`counts.deleted` = use cases, that is projects,
   removed; a note counts the links cleaned up)

Steps 2 to 4 run in one transaction, which first share-locks the run's own
row so no other claim can close it mid-way.

Deleting a project: every path goes through `deleteProjectWithSideEffects`
(`Servers/utils/projectDeletion.utils.ts`), which runs, in this order: lock
the project row (`lockProjectForDelete`, unless the caller already holds
it; if there is no such project it stops there and touches nothing else),
withdraw a pending approval request, record the deletion in the change
history, then `deleteProjectByIdQuery` (which takes the lock again as its
first statement, a no-op within the transaction). The core "Delete use case" calls it
first thing in its transaction; the Jira flow locks its projects before any
link row and passes `alreadyLocked`; the demo-data driver locks each project
before deleting its NIST data and skips the approval and history steps. So
every path takes a project's lock before anything that references it, a
Jira removal and a core "Delete use case" on the same project wait for each
other instead of deadlocking, and the order cannot drift between callers.

`DELETE /use-cases/:id` deletes one imported use case through the same
`deleteUseCasesUnderClaim` flow (409 while a sync, import or removal runs; its
run is `'remove_missing'` with `counts.deleted = 1`; 409
`removal_interrupted` if it lost its claim). It is an explicit action on the
project, so the project goes with all its links, and the response reports
them (`{ success, unlinked, links_removed }`). The requested project itself
is locked, so a link that changed between the unlocked read and the lock is
still found. A project that is not linked in
`jira_assets_use_cases` is 404 from an unlocked check before claiming, so it
never takes or waits on the claim (404, not 409, during a sync). If the link
vanished between that check and the locked one under the claim, the
transaction rolls back and the claimed run is deleted, so nothing is
recorded. A link whose project is not in this organization has only its link
row deleted and returns 200 with `unlinked: true`.

**Same-organization links (database).** `jira_assets_use_cases.project_id`
references `projects` through a composite foreign key,
`(project_id, organization_id) REFERENCES projects (id, organization_id) ON
DELETE CASCADE` (`projects` has `UNIQUE (id, organization_id)` as its
target), so a link can only point at a project in its own organization; a
NULL `project_id` is allowed. The app only ever creates a link together with
its project, in one transaction, and never changes `project_id` afterwards.
Migration `20261012165625-jira-assets-link-same-org-fk.js` added the key. It
first copied existing links whose project was missing or in another
organization into `jira_assets_use_cases_fk_cleanup_backup` and deleted them,
logging the count; no project was touched, and their Jira objects can be
imported again. The backup is a plain migration backup created `LIKE` the
live table (every column with its real type, whatever the install has, but
no defaults, so it is not tied to the live id sequence), plus `cleaned_at`;
it has no foreign keys. Rows are copied by column name, and an existing
backup whose column set differs from the live table's stops the migration
with a clear message. The migration reuses an existing equivalent unique
index on `projects (id, organization_id)` (valid, immediate, non-partial, key
columns only) if there is one, otherwise it creates the generically named
`projects_id_organization_id_key`, shared infrastructure that other
composite FKs to `projects (id, organization_id)` can use, then adds the FK
`NOT VALID` in the same short transaction as the cleanup (so no unchecked link
can be written in between) and validates it in a later transaction. The old
single-column FK is kept: dropping any FK from this table to `projects` takes
`ACCESS EXCLUSIVE` on `projects`, which the migration avoids; it is redundant
with the composite one and harmless. The old `project_id` index is replaced
by one on `(project_id, organization_id)`.

Locks and deploy: `Servers/start.sh` runs migrations on every API boot while
the worker and older API replicas keep serving, so `up()` runs under live
traffic as five short transactions, each with a 5 s `lock_timeout` and
`row_security = off` wherever it reads `projects` (an RLS policy that would
apply then raises an error instead of hiding projects and making every link
look orphaned). A busy lock rolls the step back and it is retried, up to 12
times with a short backoff (about 1.5 minutes at worst); every step is
idempotent, so a failed `up()` is re-run on the next boot. Only step 3 locks
two tables, link table first (as the sync does) and then `projects` with
`NOWAIT`, so it never waits while holding a lock and cannot deadlock with a
sync or a removal. Which writes pause (reads never pause except in step 5;
`organizations` is never locked):
1. unique index on `projects (id, organization_id)`, if none is equivalent:
   plain `CREATE UNIQUE INDEX` (`SHARE`), so writes to `projects` pause for
   one build pass over `projects`. Not `CONCURRENTLY`, as elsewhere: at
   container start it would wait on every older transaction, and a failed
   build leaves an invalid index;
2. index on the link table (`SHARE`): link writes pause for its build;
3. `SHARE ROW EXCLUSIVE` on both tables for the cleanup `DELETE` plus adding
   the FK `NOT VALID`: writes to both pause for that transaction only;
4. `VALIDATE CONSTRAINT` (skipped if `pg_constraint.convalidated`):
   `SHARE UPDATE EXCLUSIVE` on the link table and `ROW SHARE` on `projects`,
   so no writes pause while it scans the links;
5. dropping the old index: `ACCESS EXCLUSIVE` on the link table (reads too)
   for the catalog change only.
`down()` drops the composite FK, which needs `ACCESS
EXCLUSIVE` on `projects` (link table first, then `projects` with `NOWAIT`,
retried as above), and its index,
leaves the unique index on `projects (id, organization_id)` in place,
recreates the old index, and puts the backed-up links
back where the single-column FK allows it (organization and project still
exist; a link re-imported since wins). Restored rows leave the backup; the
backup table is dropped only when it is empty, otherwise it is kept and the
remaining count is logged. The id sequence is never moved backwards.

A use case a sync found again in the
meantime is no longer flagged and is skipped. The response is
`{ removed, links_removed, unlinked, skipped, skipped_items }`: `removed`
counts use cases (projects) deleted, `links_removed` the links that went with
them, and `skipped_items` is `[{ id, reason }]`. If the removal loses its claim before it finishes, the
transaction rolls back and the route returns 409 with
`{ message: "The removal was interrupted; nothing was removed. Try again.",
code: "removal_interrupted" }`. The panel switches on `code`, never on the
message text.

**Settings and validation.**

- `PATCH /api/extensions/:key/schedule` changes only `enabled` and/or
  `interval_hours` (whole hours, 1 to 168; a numeric string is accepted).
- `POST /config` still accepts `sync_enabled` / `sync_interval_hours` and
  writes the ones it carries to the engine schedule, in the same transaction
  as the connection; a field it leaves out keeps its stored value.
- `PATCH /config/selection` changes only `selected_schema_id` and/or
  `selected_object_type_id`.

The panel saves schedule changes one request at a time, keeps the newest
result, and reverts with an error if a save failed. The sync controls and the
remove button are disabled for non-Admins.

**Adding a provider:**

1. Implement `SyncProvider` in the extension's folder: declare every exclusive
   operation as a kind (including `"manual"`), set `scheduledKind` if the
   extension syncs on a schedule, and write `readiness` per kind.
2. In `run(ctx)`, heartbeat while working, guard writes with
   `ctx.sqlOwnsRun()` or `ctx.assertOwned(t)`, honour `ctx.signal`, and return
   `{ counts, message }`; throw on failure. Never delete on a sync: flag
   instead, set flags only after a complete walk, and leave removal to an
   explicit, confirmed Admin action.
3. Run other exclusive operations through `withClaim`.
4. Add the provider to `SYNC_PROVIDERS` in
   `Servers/extensions/sync-engine/providers.ts`.
5. Render `<ExtensionSyncPanel extensionKey="<key>" canManage={…} />` in the
   extension's settings panel, and set `displayName` for event-log text.
6. Add tests like `extensions/jira-assets/__tests__/` (run body on a context
   from `createRunContext`, readiness per kind).

### Jira incidents

Imports new issues from one Jira Cloud project and issue type (optionally one
label) as VerifyWise incidents, then keeps **status only** in sync both ways.
It never creates Jira issues and never copies later changes to other fields.
The incident side (tables, creation path, status rules, deletes) is in
[incidents.md](../domains/incidents.md#imported-incidents-jira-incidents-extension).

**Connection.** A Jira Cloud site (`https://<name>.atlassian.net`, normalised
by `siteUrl.ts`), a service account email and a classic API token sent as Basic
auth to the site URL; scoped tokens are not supported. The token is encrypted
at rest, never returned (`has_api_token` only) and must be re-entered when the
site URL or email changes. Saving checks the credentials with `/myself` and
stores the service account's id and time zone; JQL dates are written in that
time zone. Every request goes through `safeFetch` with a per-request timeout.

**Readiness** (`readinessOf`): connection, project, issue type, every Jira
status mapped in, every VerifyWise status mapped out (a value or "Don't change
Jira"), the severity map, and the use case, type and reporter defaults. The
first save that makes it ready sets `import_from` to now (only issues created
after that are imported) and creates an hourly schedule with `INSERT … ON
CONFLICT DO NOTHING`, so an admin's own schedule is never overwritten.

**A run** (`jiraIncidents.sync.ts`): readiness; then the project must still be
readable, or the run fails with "VerifyWise can no longer read Jira project
<key>" before any link is touched (otherwise every issue would look deleted);
then import (JQL from `max(import_from, last_checked_at − 10 min)`, issues with
a link are skipped), then status sync (settled closed links are re-read at
most once a day on scheduled runs, every time on manual ones; one heartbeat
per batch of 50), then a retry of up to 20 pending remote links. A rejected token fails the run so the
engine's backoff applies. A rate limit allows one `Retry-After` wait of at most
10 seconds per run, then ends the run early but successfully; so does the
10-minute deadline. `last_checked_at` only moves when the import window
finished. Counts: `imported`, `status_from_jira`, `status_to_jira`,
`conflicts`, `errors`, `deleted_in_jira`.

**Code map.** `jiraIncidents.client.ts` (Jira REST), `jiraIncidents.config.ts`
(config, readiness, test connection), `jiraIncidents.import.ts`,
`jiraIncidents.statusSync.ts`, `decide.ts` (the decision table), `mapping.ts`
(defaults by status category and priority name), `adf.ts`, `jql.ts`,
`jiraIncidents.store.ts` (links and events), `jiraIncidents.ctrl.ts` /
`.route.ts`. Client: `Extensions/jira-incidents/` (settings page, form state,
sync activity), `application/repository/jiraIncidents.repository.ts`,
`application/hooks/useJiraIncidentLinks.ts`, `components/JiraIssueChip`.

**Access.** Everything is Admin only, reads included, because it holds
connection details and mappings. The exception is `GET /links`, behind the
incident chips: open to any member and `[]` when the extension is off.

**Local testing.** `Servers/tests/mocks/jiraCloud/` is a simulated Jira Cloud
(see its `README.md`; `npx ts-node --transpile-only
tests/mocks/jiraCloud/start.ts --port 4010`). Point the site URL at it with
`JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL=true` in development or test.

## Adding a new extension

Base it on `mlflow` if the extension has config fields and a connection test,
or on `risk-import` if it needs neither.

1. **Migration.** Create it with a `date`-generated timestamp (see
   `Servers/CLAUDE.md`). It should:
   - insert the `extensions` row. The key must match
     `^[a-z0-9][a-z0-9-]{0,63}$` and the category must be one of the allowed
     values.
   - insert `extension_config_fields` rows, if any. Set `is_secret: true` on
     credentials.
   - create any data tables with `organization_id` and FKs.

   Copy the insert logic in `20260811102307-extensions-migration.js`
   (`EXTENSIONS_SEED`, `CONFIG_FIELDS_BY_KEY`, and the `toPgTextArray` helper for
   `tags`).
2. **Icon.** Add it to `Clients/public/assets/extensions/` and set `icon_path`
   in the migration.
3. **Server code** in `Servers/extensions/<key>/`:
   - `<name>.route.ts` with `router.use(authenticateJWT)` and
     `router.use(requireExtensionEnabled("<key>"))`, plus `authorize([...])`
     where roles matter
   - `<name>.ctrl.ts` and `<name>.service.ts`. Read config with
     `ExtensionService.getRuntimeConfiguration("<key>", organizationId)`. All
     queries filter on `organization_id`.
4. **Mount** the router in `Servers/app.ts` at `/api/extensions/<key>`, after
   the `/api/extensions` catalog router. Use multi-segment sub-paths only.
5. **Connection test (optional).** Add a `TEST_CONNECTION_DISPATCH` entry in
   `Servers/controllers/extension.ctrl.ts`.
6. **Client UI** in `Clients/src/presentation/pages/Extensions/<key>/`:
   - Gate every entry point (tab, button, menu item) with
     `useExtensions().isEnabled("<key>")`.
   - If the extension has a post-enable settings panel, add its key to
     `KEYS_WITH_POST_ENABLE_UI` in `Extensions/index.tsx` and render the panel
     in `Extensions/Settings/index.tsx` next to the Slack, Model Lifecycle and
     Jira panels.
   - Pre-enable config fields need no client code. `ExtensionConfigForm`
     renders them.
7. **Tenant tables.** Register new tables in `Servers/scripts/migrationConfig.ts`
   and in the tenant-isolation audit (`Servers/scripts/auditTenantIsolationCoverage.ts`).
   CI fails for org-scoped tables it doesn't know about.
8. **API docs.** In `Servers/`, run `npm run generate:swagger`. It reads
   `app.ts` and the route files under `routes/` and `extensions/`, and merges
   the new endpoints into `swagger.yaml`. Add descriptions to those entries,
   then run `npm run generate:endpoints` to refresh
   `docs/api-docs/src/config/endpoints.ts`.
9. **User guide.** Add an article under `shared/user-guide-content/`.

---

## Migration from the plugin system (Aug 2026)

The old system loaded plugins at runtime from a separate plugin repository. It
had a marketplace, install/uninstall, `template.json` UI bundles and
`Servers/temp/plugins`. Two PRs replaced it:

- **Frameworks became core (PR #4443).** The 21 framework plugins (SOC 2, GDPR,
  HIPAA, ...) are declared in `Servers/structures/` and get real per-framework
  tables (framework ids 5–25). This was done by migrations
  `20260805125946-create-framework-struct-tables.js` and
  `20260805130326-create-framework-impl-tables.js`.
  `20260805131033-migrate-framework-data.js` copied implementation rows, risk
  links and evidence links from the legacy `custom_framework_*` tables.
  `20260807142621-fix-legacy-file-entity-links.js` repaired the old
  `file_entity_links`. The legacy tables were **not** dropped.
- **Integration plugins became extensions (PR #4512).**
  `20260811102307-extensions-migration.js` created the three catalog tables
  and seeded the seven extensions. It copied each `plugin_installations` row
  into `extension_enablements`, joined on `plugin_key = extensions.key`
  (`status = 'installed'` → `enabled = true`, configuration copied as-is).
  Then it **dropped** `plugin_installations`. Rows with unknown keys were
  logged and skipped. The same migration creates the Azure, Model Lifecycle
  and Jira data tables that the plugins used to create in their install hooks.

Removed: `/api/plugins/*` (marketplace, install, installations, UI bundle
serving), `plugin.route.ts`, `pluginGuard.middleware.ts` / `requirePlugin`,
`PluginSlot` and the `/plugins` page, `Servers/temp/plugins`, the
`build:framework-plugins` step, and the external plugin repository dependency.

## Known leftovers

These exist in the code today. They are recorded here so they are not mistaken
for live features.

- `Servers/database/seeds/plugins/manifests.json` is unused.
- `Clients/e2e/plugins.spec.ts` is skipped (`test.describe.skip`).
- `Servers/docs/api/files-plugins-shadow-pmm-openapi.yaml` keeps its old file
  name but now documents the `/extensions` catalog paths.
- The legacy `/api/slackWebhooks` router is still mounted in `Servers/app.ts`
  and is **not** behind the extension gate. It shares handlers with
  `/api/extensions/slack/oauth/workspaces`.
- Slack notification delivery (`Servers/services/slack/`) reads
  `slack_webhooks` directly and does not check whether the extension is
  enabled.
- The legacy `custom_framework_*` tables remain.
  `GET /api/extensions/jira-assets/projects/:projectId/custom-frameworks-progress`
  (`jiraAssets.service.ts`) still reads them.
- No scheduler exists for MLflow or Azure AI Foundry sync.
- The Frameworks page **Settings** tab
  (`Clients/src/presentation/pages/Framework/Settings`) only lists ISO 27001,
  ISO 42001 and NIST AI RMF. The bundled organizational frameworks are added
  through **Manage frameworks → Add/remove frameworks**.

## Related documentation

- [Compliance Frameworks](../domains/compliance-frameworks.md)
- [Adding a New Compliance Framework](../guides/adding-new-framework.md)
- [External Integrations](./integrations.md)
- [API Endpoints](../api/endpoints.md)
- [Middleware](../../claude/middleware.md)
