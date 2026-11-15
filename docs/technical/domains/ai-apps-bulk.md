# AI Apps: bulk import and bulk assessment

Issue #5258. An organization with hundreds of AI apps needs to load them from a
spreadsheet and risk-assess them in one pass, instead of opening each app.

## Design decisions

| Decision | Why |
|----------|-----|
| The browser parses the spreadsheet and posts JSON rows. No multipart upload. | Same as Risk Import. The server has no upload parser (`csv.utils.ts` only writes CSV), and the preview needs the parsed rows anyway. The server still validates every row. |
| Import runs as a dry run, then a commit. | The dry run resolves vendors, owners and duplicates against the database, so the preview is what the commit will do. |
| A commit is all or nothing. | A half-loaded inventory is harder to fix than a rejected file. |
| A name that already exists is skipped, not an error, and never overwritten. | Uploading a corrected sheet twice is safe. Import never changes existing apps. |
| Questionnaires are not intake forms. | Intake fields have no per-option score, intake scoring needs an LLM (five runs per item), intake forms cannot target an existing app, and approval creates a new app. A questionnaire is a list of rated questions, so it needs no form engine. |
| Every question is rated 1 to 5 with a weight. | This is the scale and formula the app's manual risk assessment already uses, so scores are comparable and need no LLM. |
| Questions live as JSONB on the questionnaire. | They are only read and written as a whole list. A question table adds joins and no capability. |
| Questions are copied onto an assessment when it completes. | Completed assessments stay accurate after the questionnaire changes. Pending ones have no answers, so they follow the latest version. |
| Completed assessments cannot be edited. Assess again to change a score. | The answers are the record of why a score was given. |
| Answers can be entered per app or through a worksheet. | Clicking through hundreds of apps is the problem this feature exists to remove. |
| A pending assessment belongs to the app's current owner, read from `ai_apps.owner_id`. There is no assignee column. | The person who knows the app should rate it, and a change of owner moves open work with no extra step. |
| An owner can answer their own apps without `aiApp.edit`. Editors can answer any app. | Owners are often not editors. Apps with no owner stay with editors. Ownership grants this one action, even to an Auditor who owns an app. |
| Each owner gets one summary per bulk run, in-app and by email, and only when `notify_owners` is true. | A run over hundreds of apps must not send hundreds of emails. The requester is not notified about their own run. |
| Not in this version: reminders and escalation for overdue assessments. | They need their own schedule and settings. |

## Data model

Both tables are org-scoped and registered in `tenantIsolation.registry.ts`.

`ai_app_questionnaires`: `id`, `organization_id`, `name` (unique per org,
case-insensitive), `description`, `questions` JSONB, `is_default`, `created_by`,
`created_at`, `updated_at`. A partial unique index allows one `is_default` row
per org.

Question shape: `{ key: string, label: string, description?: string, weight: 1..5 }`.
The server derives each key from the question's label, so reordering questions
keeps answers on the right question, and answers sent against a renamed question
are rejected instead of being scored against something else. Labels are unique
within a questionnaire, ignoring case and repeated spaces, because worksheet
columns are matched by label.

`ai_app_assessments`: `id`, `organization_id`, `ai_app_id` (cascade delete),
`questionnaire_id` (set null on delete), `status` (`pending` | `completed`),
`questionnaire_name` and `questions` (null until completion), `answers` JSONB,
`risk_score`, `requested_by`, `assessed_by`, `assessed_at`, `created_at`,
`updated_at`. A partial unique index on `(ai_app_id, questionnaire_id) WHERE
status = 'pending'` allows one open assessment per app and questionnaire.

Score: `round(sum(answer * weight) / sum(weight) * 20)`, clamped to 0..100. This
matches `calculateRiskScore` in `Clients/src/presentation/pages/AIApps/utils.ts`.
Completing an assessment also sets `ai_apps.risk_score`, through
`updateAiAppByIdQuery`.

Each org gets a default questionnaire built from the six criteria of the manual
assessment. It is created the first time the org lists its questionnaires. It
can be edited but not deleted.

## API

All routes are under `/api/v1/ai-apps`, use `authenticateJWT`, and return the
standard `STATUS_CODE` envelope. Writes need `aiApp.edit` unless noted.

| Method and path | Purpose |
|-----------------|---------|
| `GET /ids` | Ids matching `status`, `lifecycle_stage`, `search`, capped at 1000. Backs "Select all". |
| `GET /import/template` | Excel template with a status dropdown. `aiApp.edit`. |
| `POST /import` | `{ rows, dry_run }`. See below. |
| `GET /questionnaires` | List, creating the default if missing. |
| `POST /questionnaires` | Create. `{ name, description?, questions[] }`. |
| `PATCH /questionnaires/:id` | Update. |
| `DELETE /questionnaires/:id` | `aiApp.admin`. 409 for the default or while pending assessments exist. |
| `POST /bulk-assess` | `{ app_ids, questionnaire_id, notify_owners? }`, 1 to 1000 ids. `notify_owners` defaults to false. Returns `{ created, already_open, not_found, unassigned, owners_notified }`. |
| `GET /assessments` | `status`, `questionnaire_id`, `search`, `assigned_to_me`, `page`, `limit`. Returns `{ assessments, total }`. Each row includes `owner_id`, `owner_name` and `can_answer`. |
| `GET /:id/assessments` | One app's assessments, newest first, with `can_answer`. |
| `PUT /assessments/:assessmentId/answers` | `{ answers: { q1: 1..5 } }`. Every question is required. `aiApp.edit` or app owner, otherwise 403. 409 if already completed. |
| `POST /assessments/cancel` | `{ assessment_ids }`. `aiApp.edit`. Removes pending ones, returns `{ cancelled }`. |
| `GET /assessments/worksheet?questionnaire_id=` | Excel file of up to 1000 pending assessments for one questionnaire. Without `aiApp.edit`, or with `assigned_to_me=true`, only the caller's own apps. |
| `POST /assessments/answers` | `{ questionnaire_id, rows }`. Worksheet answers, see below. Without `aiApp.edit`, a row for another owner's app counts as an unknown assessment. |

`notify_owners` covers only assessments this run created. The summary goes out
after the transaction commits, and a delivery failure does not fail the request.
`owners_notified` counts the owners a summary was sent to. `unassigned` counts
created assessments whose app has no owner.

### `POST /import`

Each row is `{ row_number, name, description, vendor, owner_email, status,
departments, required_training }`, 1 to 1000 rows. `row_number` is the line in
the spreadsheet, so blank lines do not shift error messages.

Rules: `name` required, at most 255 characters, and unique within the file.
`status` accepts the stored value or its label in any case, default `draft`.
`owner_email` must belong to a user of this organization; blank leaves the app
unowned. `vendor` matches an existing vendor ignoring case, otherwise a new
vendor is created. `departments` is comma-separated. Apps are created with
`createAiAppQuery` and `discovered_source: manual`.

A new vendor gets its name only. Its required text columns are stored empty
rather than filled with invented values, and the preview lists every vendor the
import will add.

Response: `{ dry_run, total, created, to_create, skipped: [{ row, name, reason }],
new_vendors: string[], errors: [{ row, field, message }] }`. A dry run returns 200.
A commit with errors returns 422 with the same body and writes nothing.

### `POST /assessments/answers`

Each row is `{ row_number, assessment_id, answers }`, 1 to 1000 rows. A row with
no answers stays pending, so a worksheet can be filled in over several sittings.
A partly answered row, a value outside 1 to 5, or an unknown assessment is an
error. An assessment that is already completed is counted and left alone.

Response: `{ completed, left_blank, already_completed, errors }`. Errors return 422
and nothing is applied.

## Frontend

- `pages/AIApps/index.tsx`: row selection, bulk toolbar with "Select all", an
  "Import" button and a link to assessments.
- `/ai-apps/assessments`: the assessments table with score chips, per-app answer
  modal, worksheet download and upload, questionnaire management, cancel. It
  has an "Assigned to me" filter, and `?assigned=me` turns that filter on, which
  is where notification links land. Answer actions follow `can_answer`.
- `AIAppDetail/AIAppRiskAssessment.tsx`: this app's assessment history.
- `application/utils/parseSpreadsheet.ts`: reads the first sheet and flattens
  exceljs cell values (rich text, hyperlinks, formula results, dates) to plain
  values.
