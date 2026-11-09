# Jira incidents extension: design

> 2026-10-14 · Status: approved in conversation, awaiting written-spec review · Branch `feature/jira-incidents`
> Background research: `docs/research/jira-incident-sync.md` (2026-10-12). Where this spec and that document differ, this spec wins: the 2026-10-13 scope decisions replaced its webhook, outbound-creation, per-field-direction and comments designs.

## 1. Goal

A customer logs AI incidents in Jira. Those issues should appear in VerifyWise as incidents, and their status should stay in step in both directions afterwards.

**Success means:**

- A new Jira issue that matches the admin's choices appears in VerifyWise as an incident within one sync, with summary, description and severity filled in.
- A status change on either side reaches the other side within one sync.
- When both sides change status between two syncs, the later change wins, and the other one is visible (log entry and a badge), never silent.
- No sync ever deletes an incident.

## 2. Scope

### In scope (v1)

- Jira Cloud only. Connection through a dedicated service account's email and API token. Admin-only configuration. Works for SaaS and self-hosted VerifyWise.
- Polling only, on the shared extension sync engine: every 1 to 168 hours (default 1), plus "Sync now". No engine change.
- Inbound only: incidents start in Jira. VerifyWise never creates Jira issues. The settings page says so.
- On import: summary, description and priority (as severity) are copied. Required VerifyWise fields come from admin-set defaults.
- After import, only status syncs, in both directions. Later Jira edits to any other field are ignored.
- Only issues created after the extension was first configured are imported (no backfill).
- Issue selection with simple pickers: project, issue type, optional label. No raw JQL.
- A simulated Jira Cloud server for automated tests and local manual runs (§10).

### Out of scope (v1)

Webhooks; Jira Data Center; VerifyWise → Jira issue creation; comments; attachments; syncing fields other than status after import; matching Jira fields to incident fields by name (incidents have no custom fields, see `Servers/utils/customField.utils.ts:31-45`); backfill of older issues; multiple projects per organization; user (assignee) mapping; OAuth; a shared connection with Jira Assets.

## 3. Architecture

A new built-in extension, `jira-incidents`, following `docs/technical/infrastructure/extensions.md` ("Adding a new extension", nine steps).

- **Catalog:** seeded by a migration like the other built-ins (`20260811102307-extensions-migration.js` pattern), category `data_management`, `requires_configuration` true, icon at `Clients/public/assets/extensions/jira-incidents.svg`.
- **Server:** `Servers/extensions/jira-incidents/` with its own router mounted at `/api/extensions/jira-incidents` (after the catalog and sync-engine routers in `Servers/app.ts`). `router.use(authenticateJWT)`, `router.use(requireExtensionEnabled("jira-incidents"))`, and **every** route, reads included, requires `authorize("extension.admin")`. (Jira Assets allows any member to read; this extension's settings hold connection details and mappings, so they are admin-only.)
- **Sync engine provider:** `jiraIncidentsSyncProvider`, added to `SYNC_PROVIDERS` in `Servers/extensions/sync-engine/providers.ts:6`. Kinds `manual` and `scheduled`, `scheduledKind: "scheduled"`. Scheduling, claim and lock, heartbeat, abandoned-run detection, failure backoff, "Sync now", and status all come from the engine (`types.ts:60-76`). When the configuration first becomes complete (the moment `import_from` is set, §5.6), the extension creates its `extension_sync_settings` row as enabled, every 1 hour, unless a row already exists. After that the admin changes it in the shared panel.
- **Jira client:** a new `JiraIncidentsClient` in the extension folder. It reuses the shared pieces only: the Basic `email:token` header, `safeFetch` / `assertSafeOutboundUrl` (`Servers/utils/safeOutboundUrl.ts`), `requestSignal` / `describeFetchError` (`Servers/utils/outboundFetch.utils.ts`). It does not reuse `JiraAssetsClient`, which targets the Assets API (`api.atlassian.com/jsm/assets/...`).
- **Frontend:** `Clients/src/presentation/pages/Extensions/jira-incidents/`, added to `KEYS_WITH_POST_ENABLE_UI` (`Extensions/index.tsx:48`) and rendered from `Extensions/Settings/index.tsx`. Uses the shared `ExtensionSyncPanel` and `useExtensionSync`.

## 4. Data model

Three new tables. All carry `organization_id`, use unqualified names with `WHERE organization_id = :organizationId` in application SQL, and are registered in `Servers/scripts/migrationConfig.ts` and the tenant-isolation registry/audit (`auditTenantIsolationCoverage.ts`). Timestamps are `TIMESTAMPTZ`.

### 4.1 `jira_incidents_config` (one row per organization, `UNIQUE (organization_id)`)

| Column | Meaning |
|---|---|
| `site_url` | `https://<site>.atlassian.net`, normalised (lower-case host, no path, no trailing slash) |
| `email` | service account email |
| `api_token_encrypted` | encrypted with `encrypt()` from `Servers/utils/encryption.utils.ts` (AES-256-GCM). Never returned by the API; the client sees `has_api_token` |
| `service_account_id` | the account's Jira `accountId`, from `GET /rest/api/3/myself` at connection test |
| `service_account_time_zone` | the account's `timeZone` from the same call; JQL date literals are read in this zone (§6.1) |
| `project_id`, `project_key` | chosen Jira project (`project_id` is the stable id; key kept for display and JQL) |
| `issue_type_id` | chosen issue type |
| `label` | optional label filter, nullable |
| `status_map_in` | JSONB: Jira status id → VerifyWise status |
| `status_map_out` | JSONB: VerifyWise status → Jira status id |
| `severity_map` | JSONB: Jira priority id → VerifyWise severity |
| `default_project_id` | use case for imported incidents (FK `projects`, same organization); also fills `ai_project` with the use case name |
| `default_type` | incident type (one of the 7 `type` enum values) |
| `default_reporter` | reporter text |
| `import_from` | the import cut-off: set once, the first time the configuration becomes complete; never moved |
| `last_checked_at` | end of the last successful import window |
| `created_at`, `updated_at`, `updated_by` | |

### 4.2 `jira_incident_links` (one row per imported issue)

| Column | Meaning |
|---|---|
| `incident_id` | FK `ai_incident_managements(id)` `ON DELETE SET NULL` |
| `jira_issue_id` | Jira's stable issue id (survives moves between projects) |
| `jira_issue_key` | display key, e.g. `SEC-42`; refreshed on every status read |
| `jira_url` | browse link |
| `last_jira_status_id` | Jira status at the last sync |
| `last_vw_status` | VerifyWise status at the last sync |
| `last_synced_at` | |
| `state` | `ok` · `error` · `conflict` · `deleted_in_jira` · `deleted_in_verifywise` |
| `state_reason` | plain-language reason for `error` and `conflict` |
| `created_at`, `updated_at` | |

Constraints: `UNIQUE (organization_id, jira_issue_id)`; partial `UNIQUE (organization_id, incident_id) WHERE incident_id IS NOT NULL`; composite FK so an incident and its link share an organization (the Jira Assets composite-FK pattern).

When an incident is deleted, the incident delete path (`deleteIncidentByIdQuery`) sets its link's `state` to `deleted_in_verifywise` in the same transaction, and the foreign key sets `incident_id` to null. The row stays, so the issue is never imported again. No database trigger is used.

Archived incidents are skipped by the status sync; unarchiving one resumes it at the next run.

### 4.3 `jira_incident_sync_events` (activity log)

`id`, `organization_id`, `link_id` (nullable), `run_id` (FK `extension_sync_runs`, nullable), `kind` (`imported` · `status_from_jira` · `status_to_jira` · `conflict` · `error` · `deleted_in_jira`), `detail` JSONB (old and new values, losing value for conflicts, error reason), `created_at`.

It records system changes to incidents, so it is treated as an audit record: the table is added to `AUDIT_RECORD_TABLES` (`Servers/utils/dataRetention.utils.ts`) and follows the organization's audit records period on Settings → Data retention (default keep indefinitely). No new retention setting is added. Volume is small: one row per import, status change, conflict or new error.

### 4.4 Changes to existing tables and code

- **No new incident columns.** The link table carries everything Jira-specific.
- **Incident creation gains a system path.** `recordIncidentCreation` / `recordEntityCreation` (`changeHistory.base.utils.ts:436`) take a `changedBySystem` option, mirroring `updateIncident`'s, so an imported incident's history shows "System" (rendered as "Jira sync" where the history UI shows a source). A small `createIncidentForImport` service function wraps `createNewIncidentQuery` + system history + the high-severity workflow trigger, so the importer does not depend on the HTTP controller.
- **Automation enqueue after commit.** `createNewIncidentQuery` enqueues the `incident_added` automation inside the transaction (`incidentManagement.utils.ts:159-201`). The import path must not send an email for an incident whose transaction rolls back, so the enqueue moves to an after-commit hook (as `updateIncident` already does). This applies to every caller.

## 5. Settings and mappings

### 5.1 Connection

- The admin enters site URL, service account email and API token, then **Test connection**.
- Token type: a classic Atlassian API token, sent as Basic `email:token` to the site URL. Scoped API tokens, which Atlassian routes through `api.atlassian.com/ex/jira/<cloudId>`, are not supported in v1; the help text says which kind to create. (Confirm against the Atlassian authentication reference during planning.) Atlassian API tokens can expire, so a 401 is reported as "Jira rejected the API token. It may have expired or been revoked."
- The test calls `GET /rest/api/3/myself` (stores `accountId`) and checks the account can browse the project and transition and link its issues (`GET /rest/api/3/mypermissions` with `BROWSE_PROJECTS`, `TRANSITION_ISSUES`, `LINK_ISSUES`; exact permission keys confirmed against the Atlassian REST reference during planning). Each missing permission is named in the result.
- Site URL rule: `https` and a host ending in `.atlassian.net`. Anything else is rejected with a plain message. See §10 for the development-only override.

### 5.2 Issue selection

Pickers filled from Jira: project (`GET /rest/api/3/project/search`), issue type for that project, optional label (free text with suggestions). Changing them later affects new imports only; existing links keep syncing.

### 5.3 Status mapping

Two tables, filled from the project's workflow statuses (`GET /rest/api/3/project/{projectIdOrKey}/statuses`, for the chosen issue type):

- **Jira → VerifyWise:** every Jira status maps to one VerifyWise status. Default by status category: To Do → Open, In Progress → Investigating, Done → Closed.
- **VerifyWise → Jira:** each of the six VerifyWise statuses maps to one Jira status, or to "Don't change Jira". Defaults: Open → first To Do status, Investigating → first In Progress status, Closed → first Done status; Mitigated, Suspended and Emergency action → "Don't change Jira".

A status added to the Jira workflow later is unmapped until the admin maps it (§7).

### 5.4 Severity mapping

Every Jira priority (`GET /rest/api/3/priority`) maps to Minor, Serious or Very serious. Defaults by name: Highest, High → Very serious; Medium → Serious; Low, Lowest → Minor; any other priority → Serious. An issue without a priority gets Serious.

### 5.5 Defaults

Use case, incident type and reporter. All three are required before the configuration counts as complete.

### 5.6 Readiness

The provider's `readiness()` returns not-ready, with the missing item named, until connection, project, issue type, all three mappings (every Jira status mapped in), and defaults are set. The first time it becomes ready, `import_from` is set to now.

## 6. A sync run

Each run: readiness check → import → status sync → result. A run keeps a heartbeat through the engine context and stops cleanly at the engine's deadline (`runDeadlineMs`), recording what it did.

### 6.1 Import

1. Search `POST /rest/api/3/search/jql`, paged by `nextPageToken`:
   `project = <project_id> AND issuetype = <issue_type_id> [AND labels = "<label>"] AND created >= "<cut-off>" ORDER BY created ASC`, requesting only the fields used (summary, description, priority, status, created).
   - The cut-off is `max(import_from, last_checked_at − 10 minutes)`, formatted as `yyyy-MM-dd HH:mm` **in `service_account_time_zone`** and rounded down to the minute, because Jira reads JQL dates in the searching user's time zone at minute precision. The 10-minute overlap covers rounding and Jira's indexing delay; step 2 makes the overlap safe.
   - The label is quoted and escaped for JQL; project and issue type are passed as ids, never as user text.
   - Each result's `created` time is also compared with `import_from` in code, so an issue created before the cut-off is never imported even if the JQL window is wider.
2. Skip any issue that already has a link row (any state).
3. For each new issue, in its own transaction:
   - **description** = summary, a blank line, then the Jira description converted from ADF to plain text; cut to 32,767 characters. If the result is shorter than 5 characters, it is padded with the issue key (the incident minimum is 5).
   - **severity** from `severity_map`; **status** from `status_map_in` of the issue's current status.
   - **project_id** and **ai_project** from the default use case; **type** and **reporter** from defaults.
   - **occurred_date** and **date_detected** = the issue's created date; **categories_of_harm** = `[]`; **approval_status** = Pending.
   - Created through `createIncidentForImport` (§4.4): change history as system; `incident_added` automation after commit; the incident response workflow when severity is Very serious.
   - Insert the link row (`state = ok`, `last_jira_status_id`, `last_vw_status`), and an `imported` event.
4. After commit, add a remote link to the Jira issue (`POST /rest/api/3/issue/{id}/remotelink`, `globalId = verifywise:incident:<org>:<incident id>`, title "VerifyWise INC-123", URL to the incident built from `FRONTEND_URL`; if `FRONTEND_URL` is not set, the remote link is skipped and a warning is logged once per run). Re-posting the same `globalId` updates rather than duplicates. A failure here is logged as an `error` event but does not undo the import.
5. If the import window finished without stopping early, set `last_checked_at` to the run's start time. If it stopped early (deadline, rate limit), leave it, so the next run searches the same window again; step 2 makes that safe.

### 6.2 Status sync

For every link in state `ok`, `error`, `conflict` or `deleted_in_jira` whose incident still exists and is not archived:

0. **Access check first.** Before touching any link, confirm the service account can still read the configured project (`GET /rest/api/3/project/{id}`). If it can't (401, 403 or 404), the run fails with "VerifyWise can no longer read Jira project SEC" and **no link is changed**. Without this check, a lost permission would make every issue look deleted.
1. Read the Jira side in batches: search `id in (...)` for current status and key; for issues whose status differs from `last_jira_status_id`, read the time of the latest status change from the issue's changelog (`GET /rest/api/3/issue/{id}/changelog`).
   - An issue missing from the search is checked directly (`GET /rest/api/3/issue/{id}`). Only a 404 there, with the project still readable, marks the link `deleted_in_jira` (with a `deleted_in_jira` event the first time). The incident is untouched.
   - `deleted_in_jira` is not final: if a later run finds the issue again (restored, or access to it regained), the link returns to `ok` and syncing resumes from the statuses both sides then hold, with no status written on that run.
2. Read the VerifyWise side: current incident status, and the time of its latest status change from `incident_change_history`.
3. Decide:

| Jira changed? | VerifyWise changed? | Action |
|---|---|---|
| no | no | nothing |
| yes | no | set the incident to `status_map_in[jira status]` through `updateIncident(..., { changedBySystem: true })`; `status_from_jira` event |
| no | yes | if `status_map_out[vw status]` is "Don't change Jira", record it and do nothing; otherwise transition (§6.3); `status_to_jira` event |
| yes | yes | the later of the two change times wins and is applied to the other side as above; `conflict` event with both values and the loser; link `state = conflict` |

"Changed" means different from `last_jira_status_id` / `last_vw_status`. After any action, both `last_*` values are set to what each side now holds, in the same transaction as the incident write. Because a status written by the sync updates `last_vw_status` at the same time, it is not seen as a VerifyWise change next run: no echo, and no extra flag needed.

4. A `conflict` link returns to `ok` on its next clean run (either side changes again without the other).
   - Change times compare Jira's changelog timestamp with the VerifyWise server's time. Both are server clocks; a skew of a few seconds only matters when both sides change within seconds of each other, and either result is then acceptable. This is accepted, not corrected.
   - An `error` link is retried every run, but an `error` event is written only when the link first enters `error` or its reason changes, so a lasting problem does not add a log row every hour.
5. Reopen: a Jira status that maps to a non-Closed status on a Closed incident is applied through `updateIncident`, so the existing reopen rule applies (an Approved closure goes back to Pending, `incidentManagementValidation.utils.ts:479-504`).
6. A Jira status with no entry in `status_map_in` → link `error` ("Jira status 'Awaiting vendor' isn't mapped"); the incident is left as it is.

### 6.3 Transitioning in Jira

`GET /rest/api/3/issue/{id}/transitions`, pick the transition whose target is the mapped status, `POST` it. If none exists from the current status, or the transition needs fields (its screen has required fields such as Resolution), the link becomes `error` with the reason (for example "No move from 'Done' to 'In Progress' in this workflow"). The incident is not changed back. Other links continue.

### 6.4 Result

`counts`: `imported`, `status_from_jira`, `status_to_jira`, `conflicts`, `errors`, `deleted_in_jira`. `message` summarises them; the panel's `describeCompletedRun` renders them in plain language.

## 7. Failures and safety

- **Authentication or permission rejected (401/403):** the run throws, the engine records `failed` with a plain reason ("Jira rejected the API token"), and backoff applies.
- **Rate limited (429, or 503 with `Retry-After`):** the run stops early, records "Rate limited by Jira", keeps completed work, and returns normally so the next scheduled run resumes. No in-run sleeping beyond a single short `Retry-After` (≤ 10 seconds).
- **Per-incident failures** (unmapped status, failed transition, remote link) only affect that link and are logged as `error` events.
- **Concurrent user edits** go through the same locked `updateIncident` path; the §6.2 table decides who wins.
- **Credentials:** encrypted at rest, never returned, masked in the UI. Changing the site URL or email requires re-entering the token.
- **Outbound requests:** all through `safeFetch` with `assertSafeOutboundUrl` and per-request timeouts.
- **Extension disabled:** no runs; data kept (extension rule). On re-enable, the next run resumes from `last_checked_at`, so issues created while disabled are imported.
- **Tenant isolation:** every query is organization-scoped; the composite FK on links prevents cross-organization links.

## 8. Screens

### 8.1 Extensions → Jira incidents → Settings (Admin only)

Sections in order: Connection (with Test connection) · Which issues to import · Status mapping (both tables) · Severity mapping · Defaults · Sync (shared `ExtensionSyncPanel`) · Sync activity (latest 50 events, newest first, each linking to its incident).

Help text, shown above the form:

- "Only issues created in Jira after this is set up are imported. VerifyWise doesn't create Jira issues."
- "After import, only status stays in sync, in both directions. Later changes to other Jira fields aren't copied."
- "If a Jira status move needs a field such as Resolution, VerifyWise can't make it. Those incidents show an error, and you can change the status in Jira."

### 8.2 Incidents list and incident page

- Imported incidents show a chip with the Jira key, linking to the issue in a new tab.
- A badge on the chip for `error`, `conflict`, `deleted_in_jira`; the tooltip shows `state_reason` (keyboard-accessible).
- Read endpoint for the chips: `GET /api/extensions/jira-incidents/links?incident_ids=` returns key, URL and state for the given incidents, organization-scoped. **This read is available to any member who can see incidents** (the chip is information about the incident, not configuration); it returns nothing when the extension is disabled.
- No other incident behaviour changes.

All new strings are sentence case and have de, fr and es translations (`Clients/src/i18n/translations.ts`).

## 9. API summary

Under `/api/extensions/jira-incidents`, Admin only unless noted:

- `GET /config`, `PUT /config` (connection, selection, mappings, defaults; token write-only)
- `POST /test-connection`
- `GET /jira/projects`, `GET /jira/issue-types?project=`, `GET /jira/statuses?project=&issue_type=`, `GET /jira/priorities`, `GET /jira/labels?query=`
- `GET /events?limit=` (default 50, max 200)
- `GET /links?incident_ids=` (any member with incident read access)
- Sync runs use the shared routes: `POST /api/extensions/jira-incidents/runs`, `GET .../runs/status`, `PATCH .../schedule`.

Swagger and the generated endpoint list are updated (`npm run generate:swagger`, `generate:endpoints`, `check:api-drift`).

## 10. Simulated Jira Cloud

A small standalone mock of the Jira Cloud REST endpoints this extension calls, kept under `Servers/tests/mocks/jiraCloud/` (not loaded by the application).

- **Endpoints:** `myself`, `mypermissions`, `project/search`, project issue types, `project/{id}/statuses`, `priority`, `search/jql` (with `nextPageToken` paging), `issue/{id}`, `issue/{id}/changelog`, `issue/{id}/transitions` (GET and POST, including transitions that require fields), `issue/{id}/remotelink`. Response shapes follow Atlassian's published REST v3 reference; ADF descriptions included.
- **State and control:** an in-memory store of projects, workflows and issues, plus a control API (`/__mock/issues`, `/__mock/reset`, `/__mock/fail-next` for 401, 403, 429 with `Retry-After`, 500) so tests and a person can create issues, change status in "Jira", and inject failures.
- **Automated use:** the extension's integration tests run complete syncs against it: import, Jira-side change, VerifyWise-side change, conflict, transition refused, transition needing a field, unmapped status, deleted issue, deleted issue restored, project access lost (no link may change), service account in a time zone far from UTC, issue created just before the cut-off, rate limit mid-run, paging across pages, no echo, tenant isolation, never re-importing a deleted incident, a lasting error writing only one event.
- **Manual use:** a script starts it on a local port, so an engineer can point a local VerifyWise at it and click through connect, mapping, "Sync now" and status changes.
- **Development-only URL override:** the `.atlassian.net` rule (§5.1) blocks a local mock. An environment variable `JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL=true` allows `http://localhost` / `127.0.0.1` site URLs **only when `NODE_ENV` is `development` or `test`**; in any other environment the variable is ignored and a warning is logged at startup. This override is security-sensitive and must be covered by tests in both directions.
- **Limit:** the mock proves our behaviour against our reading of Jira's API, not against Jira itself. The customer's test run on their Jira Cloud site is the real-site check before release.

## 11. Testing

- **Unit:** ADF → plain text (paragraphs, lists, headings, code, mentions, empty); description assembly and the 5 / 32,767 limits; default mappings; the §6.2 decision table, every row; transition selection; site URL validation and the override's environment gate; JQL building (label quoting).
- **Integration (real database, simulated Jira):** the scenarios in §10; `import_from` set once; `last_checked_at` not advanced on an early stop; `deleted_in_verifywise` prevents re-import; `incident_added` not enqueued when the import transaction rolls back; Very serious import starts the incident response workflow; tenant isolation for all three tables.
- **Frontend:** settings form validation and mapping defaults; chip and badge rendering; i18n audit.
- **Gates:** `cd Servers && npm run build && npm run format-check && npm run test` and the integration suite; `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run lint -- --quiet && npx vitest run`; API drift; Semgrep.

## 12. Documentation

- `docs/technical/infrastructure/extensions.md`: the new extension, and the second sync-engine provider.
- `docs/technical/domains/incidents.md`: imported incidents, the link table, status sync rules.
- `docs/technical/domains/data-retention.md`: the sync activity table listed under audit records.
- User guide in `shared/user-guide-content/` (extensions and incidents), mirrored to `~/website/verifywise/content/user-guide/content/` (not committed there).

## 13. Decisions log

| Date | Decision |
|---|---|
| 2026-10-13 | Cloud only, service account API token, admin-only, poll only, inbound only, status-only sync after import, newest change wins, no comments or attachments, no backfill, simple pickers, never delete, no echo |
| 2026-10-14 | Hourly polling on the existing engine (no sub-hour schedule) |
| 2026-10-14 | No field matching by name (incidents have no custom fields) |
| 2026-10-14 | Admin status mapping both ways, defaults from Jira status categories |
| 2026-10-14 | Severity mapping follows the same pattern |
| 2026-10-14 | Own extension and connection, not shared with Jira Assets |
| 2026-10-14 | Jira summary becomes the first line of the incident description |
| 2026-10-14 | Simulated Jira Cloud for tests and local manual runs; customer test run is the real-site check |
| 2026-10-14 (self-review) | Project access is checked before any link changes, so lost access never marks issues deleted; `deleted_in_jira` is reversible |
| 2026-10-14 (self-review) | JQL cut-off formatted in the service account's time zone, plus an in-code `import_from` check |
| 2026-10-14 (self-review) | Sync activity is an audit record and follows the audit period (replaces a separate 90-day setting) |
| 2026-10-14 (self-review) | Classic API tokens only in v1; scoped tokens out of scope |
