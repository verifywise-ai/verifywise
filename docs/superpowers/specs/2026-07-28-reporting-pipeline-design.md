# Reporting: one report list, an archive that archives, and Run now

**Date:** 2026-07-28
**Status:** Approved design, ready for implementation planning

## Problem

The reporting tabs describe a pipeline the code does not implement.

**Generated reports and scheduled runs live in two unrelated tables.** The Generate tab lists rows from `files`, filtered by ten legacy `source` strings and **inner-joined to `projects`** (`getGeneratedReportsQuery`, `Servers/utils/reporting.utils.ts:64`). The Archive tab lists `report_runs` — all of them, unfiltered (`useReportRunsPage` in `ArchiveTab.tsx:58`). Every report produced from a template therefore lands in Archive and can never appear in Generate.

Two consequences beyond the misplacement:

- The inner join means an organization-scoped report — one with no `project_id` — cannot appear in the Generate list at all.
- "Archive" is not archiving. It is the run history, and its empty state says so: *"No scheduled report runs yet."* There is no way to archive a report and no place archived reports go.

**Templates are not visually separated.** `listTemplatesQuery` returns the org's own templates and the shared system ones together (`report_templates.is_system_template`, with `organization_id IS NULL` on the system rows), and the tab renders them as one flat list. The tab already withholds Edit and Archive from a system template — `TemplatesTab.tsx:126,151` branch on `t.is_system_template` — so the read-only rule exists; what is missing is the split into two sections and a way to base a custom template on a system one.

**A template cannot be run without scheduling one.** `POST /reporting/scheduled-reports/:id/run-now` exists, but it re-runs an *existing schedule*. Producing one report from a template means creating a schedule, running it, and deleting it.

Measured on the dev database: 0 legacy report files, 0 `report_runs`, 3 system templates, 0 custom templates, 0 schedules.

## Decisions

1. `report_runs` becomes the single source of truth for every produced report — manual, scheduled and run-now.
2. Archiving is a manual, reversible per-report action. Delete stays separate and permanent.
3. Running and failed runs appear in the Generate list with their status. A scheduled report that fails silently is the failure mode worth preventing.
4. System templates are read-only, with "Duplicate to my templates" as the way to modify one.
5. Run now opens the same wizard without its Schedule and Delivery steps.

## Design

### Data model

One migration on `report_runs`:

```
archived_at  TIMESTAMPTZ NULL
archived_by  INTEGER NULL REFERENCES users(id)
```

plus `idx_report_runs_org_archived ON report_runs(organization_id, archived_at)`, which serves both list queries.

Archiving sets `archived_at = NOW()` and `archived_by`; restoring sets both back to NULL. No status value changes — archiving is orthogonal to `status`, so a failed run can be archived without pretending it succeeded.

**Backfill.** The same migration copies legacy `files`-based reports into `report_runs` so nothing disappears from a deployment that has them:

| `report_runs` column | source |
|---|---|
| `organization_id` | `files.organization_id` |
| `triggered_by` | `'manual'` |
| `triggered_by_user_id` | `files.uploaded_by` |
| `status` | `'success'` |
| `file_id` | `files.id` |
| `output_filename` | `files.filename` |
| `created_at`, `completed_at` | `files.uploaded_time` |
| `config_snapshot` | `{"legacy": true, "source": <files.source>, "project_id": <files.project_id>}` |

Restricted to the ten legacy `source` values `getGeneratedReportsQuery` recognises, and guarded by `WHERE NOT EXISTS (SELECT 1 FROM report_runs r WHERE r.file_id = files.id)` so re-running it inserts nothing. `template_id` and `scheduled_report_id` stay NULL — a legacy report came from neither.

### Backend

**List filter.** `listRunsQuery` (`Servers/utils/reportRun.utils.ts:42`) gains `archived?: boolean`: `true` → `archived_at IS NOT NULL`, `false` → `archived_at IS NULL`, omitted → no predicate. `GET /reporting/runs` passes it through from the query string. Omitting it keeps today's behaviour for any caller that does not opt in.

**Archive and restore.** `PATCH /reporting/runs/:id/archive` and `PATCH /reporting/runs/:id/restore`, both `authorize(["Admin", "Editor"])`. Each is a single org-scoped UPDATE:

```sql
UPDATE report_runs SET archived_at = NOW(), archived_by = :userId
WHERE id = :id AND organization_id = :organizationId
RETURNING *
```

A zero-row result is a 404, not a silent success — that is what stops an id from another organization being archived.

**Run a template now.** `POST /reporting/templates/:id/run`, `authorize(["Admin", "Editor"])`. Body is the wizard's payload minus `scheduleConfig`:

```
{ templateVersionId, name, scope, projectId, sectionsConfig, aiBlocksConfig, format }
```

The controller loads the template version org-scoped (`getVersionByIdQuery` already joins to `report_templates` and accepts system templates), builds a schedule-shaped object, and calls the **existing** `runScheduledReport()` (`Servers/services/reporting/reportRunOrchestrator.ts`) with `triggeredBy: "manual"`:

```js
{
  id: null,                      // no schedule row — report_runs.scheduled_report_id is nullable
  organization_id, template_id, template_version_id,
  name, project_id, framework_id, project_framework_id,
  sections_config, ai_blocks_config, format,
  delivery_config: { saveToStorage: true },
  owner_id: userId, created_by: userId,
}
```

`delivery_config` is forced to storage-only. `deliverReport` returns a `fileId` only when `saveToStorage` is set, and that id becomes `report_runs.file_id` — without it the run completes with nothing to download. Run now is not a delivery mechanism; it puts a report in the list.

Reusing `runScheduledReport` is the point: scheduled runs and run-now execute the same generation, delivery, analysis and status code. There is no second pipeline to drift.

**Delete.** `DELETE /reporting/runs/:id`, `authorize(["Admin", "Editor"])`, org-scoped, available from both tabs. It removes the run row and the `files` row its `file_id` points at, which is what `DELETE /reporting/:id` meant before: the file *is* the report. A run with no `file_id` (failed, or still running) deletes the row alone. Deleting is permanent and independent of archiving — a report can be deleted without being archived first.

**Generate list source.** The frontend moves from `GET /reporting/generate-report` to `GET /reporting/runs?archived=false`. The legacy endpoint stays for now — the automations path still calls the old generator — but nothing in the Reporting page reads it.

### Frontend

**Generate tab.** The report list becomes the runs table filtered to `archived=false`: report name (`output_filename`), template name, status, scope, date, triggered by, and row actions — download (completed runs only), archive, delete. The "Generate report" button is unchanged. Status renders the pipeline's real vocabulary: `queued`, `running`, `success`, `partial_success`, `failed`.

**Archive tab.** The same table filtered to `archived=true`, with Restore replacing Archive. The run-analyses drawer stays and is reachable from both tabs.

**Templates tab.** Two labelled sections keyed on `is_system_template` — the flag the tab already branches on, so there is one notion of "system", not two: **My templates** (`!t.is_system_template`) with Use / Run now / Edit / Archive, and **System templates** (`t.is_system_template`) with Use / Run now / Duplicate to my templates. The Edit/Archive gating already exists and is left alone. Duplicate POSTs a new org-owned template named `<name> (copy)`, carrying the system template's latest version config; the created row is a normal custom template (`is_system_template` false). Slugs are derived server-side and unique per org (`uq_report_templates_org_slug`), so a second duplicate of the same template returns 409; the tab already renders that as "A template with this name already exists. Choose a different name." No backend change is needed for the split — `listTemplatesQuery` already selects `organization_id`.

**Wizard.** `ConfigureReportWizard` gains `mode: "schedule" | "run-now"`. In run-now mode the `STEPS` array drops "Schedule" and "Delivery", the final button reads "Run now", and submit posts to `POST /reporting/templates/:id/run`. Everything before those steps — scope, sections, AI insights, review — is shared, so the two flows cannot diverge in what they let a user configure.

### Correctness requirements

These are the properties the implementation must hold, each one a place the current code or an obvious implementation would go wrong:

- Every new query is scoped by `organization_id`, and archive/restore/run-now return 404 rather than acting when the row belongs to another organization.
- The Generate list must not inner-join `projects`. That join is the reason organization-scoped reports are invisible today.
- `status` values come from the pipeline (`queued`/`running`/`success`/`partial_success`/`failed`), not an invented set. `partial_success` means generated but at least one delivery channel failed — it is downloadable and must not render as an error.
- Run now forces `saveToStorage: true`.
- The backfill is idempotent and inserts nothing on a database that has already run it.
- Pagination totals come from the server's `total`, not the current page length.

### Testing

- **Unit (queries):** the archived filter emits the right predicate for each of its three states; archive/restore SQL carries both `id` and `organization_id`; the run-now controller builds a config with `saveToStorage: true` and `scheduled_report_id: null`.
- **Unit (controller):** archive and restore return 404 for a run in another organization; run-now rejects a template version that does not belong to the caller's organization.
- **Migration:** the backfill inserts one run per legacy report file and nothing on a second run.
- **Frontend:** the Generate list shows non-archived runs including a failed one; archiving moves a row to the Archive tab; the Templates tab splits by `organization_id` and offers no Edit on a system template; the wizard in run-now mode omits the Schedule and Delivery steps.
- **Tenant isolation:** the new endpoints join the existing reporting isolation suite (`Servers/tests/integration/tenant-isolation/`).

## Out of scope

- Retiring the legacy `/reporting/generate-report` generator and the `scheduled_report` automation trigger. The domain doc records why the trigger is load-bearing; consolidating it is a migration project with a data-movement story.
- Changing schedule semantics, cron handling or the AI analysis pipeline.
- Bulk archive, retention policies, or auto-archiving by age.
