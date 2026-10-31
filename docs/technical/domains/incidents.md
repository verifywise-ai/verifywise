# Incident Management Domain

## Overview

Incident Management in VerifyWise provides a comprehensive system for tracking, investigating, and resolving AI-related incidents. It supports EU AI Act Article 73 compliance for serious incident reporting, with approval workflows, change tracking, and integration with CE marking documentation.

## Key Features

- Incident lifecycle management (Open → Investigating → Mitigated → Closed, plus Suspended and Emergency action; closed incidents can be reopened)
- Multi-level severity classification (Minor, Serious, Very Serious)
- Approval workflow with audit trail
- Harm category tracking
- Field-level change history
- CE marking integration for regulatory compliance
- Automation triggers for notifications
- AI advisor integration for analytics

## Database Schema

### Incident Management Table

```
ai_incident_managements
├── id (PK, SERIAL)
├── incident_id (TEXT, UNIQUE) -- Auto-generated: INC-[sequence]
├── ai_project (TEXT NOT NULL)
├── type (ENUM)
├── severity (ENUM)
├── occurred_date (TIMESTAMPTZ NOT NULL)
├── date_detected (TIMESTAMPTZ NOT NULL)
├── reporter (TEXT NOT NULL)
├── status (ENUM, default: Open)
├── categories_of_harm (JSON NOT NULL)
├── affected_persons_groups (TEXT)
├── description (TEXT NOT NULL)
├── relationship_causality (TEXT)
├── immediate_mitigations (TEXT)
├── planned_corrective_actions (TEXT)
├── model_system_version (TEXT)
├── interim_report (BOOLEAN, default: false)
├── approval_status (ENUM, default: Pending)
├── approved_by (TEXT)
├── approval_date (TIMESTAMPTZ)
├── approval_notes (TEXT)
├── archived (BOOLEAN, default: false)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### Incident Change History Table

```
incident_change_history
├── id (PK, SERIAL)
├── incident_id (FK → ai_incident_managements)
├── action (created/updated/deleted)
├── field_name (VARCHAR)
├── old_value (TEXT)
├── new_value (TEXT)
├── changed_by_user_id (FK → users)
├── changed_at (TIMESTAMP)
└── created_at (TIMESTAMP)
```

### CE Marking Incidents Table

```
ce_marking_incidents (junction table)
├── id (PK, SERIAL)
├── ce_marking_id (FK → ce_markings)
├── incident_id (FK → ai_incident_managements)
├── linked_at (TIMESTAMP)
└── linked_by (INTEGER)
```

## Enumerations

### Incident Status

```typescript
enum AIIncidentManagementStatus {
  OPEN = "Open"
  INVESTIGATING = "Investigating"
  MITIGATED = "Mitigated"
  CLOSED = "Closed"
  SUSPENDED = "Suspended"
  EMERGENCY_ACTION = "Emergency action"
}
```

### Approval Status

```typescript
enum AIIncidentManagementApprovalStatus {
  PENDING = "Pending"
  APPROVED = "Approved"
  REJECTED = "Rejected"
  NOT_REQUIRED = "Not required"
}
```

### Severity

```typescript
enum Severity {
  MINOR = "Minor"
  SERIOUS = "Serious"
  VERY_SERIOUS = "Very serious"
}
```

### Incident Type

```typescript
enum IncidentType {
  MALFUNCTION = "Malfunction"
  UNEXPECTED_BEHAVIOR = "Unexpected behavior"
  MODEL_DRIFT = "Model drift"
  MISUSE = "Misuse"
  DATA_CORRUPTION = "Data corruption"
  SECURITY_BREACH = "Security breach"
  PERFORMANCE_DEGRADATION = "Performance degradation"
}
```

### Harm Category

```typescript
enum HarmCategory {
  HEALTH = "Health"
  SAFETY = "Safety"
  FUNDAMENTAL_RIGHTS = "Rights"
  PROPERTY = "Property"
  ENVIRONMENT = "Environment"
}
```

## API Endpoints

### Incident CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/aiIncidentManagement/` | Get all incidents |
| GET | `/aiIncidentManagement/:id` | Get incident by ID |
| POST | `/aiIncidentManagement/` | Create incident |
| PATCH | `/aiIncidentManagement/:id` | Update incident |
| PATCH | `/aiIncidentManagement/:id/archive` | Archive incident |
| DELETE | `/aiIncidentManagement/:id` | Delete incident |

### Change History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/incident-change-history/:incidentId` | Get change history |

Query params: `limit`, `offset` for pagination

## Create Incident Request

```typescript
POST /aiIncidentManagement/
{
  ai_project: "Customer Service Chatbot",
  type: "Unexpected behavior",
  severity: "Serious",
  occurred_date: "2025-01-15T10:30:00Z",
  date_detected: "2025-01-15T11:00:00Z",
  reporter: "John Smith",
  status: "Open",
  categories_of_harm: ["Safety", "Rights"],
  affected_persons_groups: "End users",
  description: "AI provided incorrect medical advice...",
  relationship_causality: "Direct causal relationship",
  immediate_mitigations: "Service temporarily suspended",
  planned_corrective_actions: "Implement guardrails",
  model_system_version: "GPT-4-turbo v1.2"
}
```

## Incident Lifecycle

### Status Workflow

```
[Open] → [Investigating] → [Mitigated] → [Closed]
   ↑                                         │
   └──────────── reopen (any status) ────────┘

[Suspended] and [Emergency action] can be entered from, and left to, any status.
```

There is no transition table: an update may move an incident from any status to
any other, including from Closed back to an open status (reopening). Reopening
is needed for two-way sync with issue trackers, where a closed issue can be
reopened.

### Business Rules

- `date_detected` must be >= `occurred_date` (creation only)
- Status transitions are unrestricted; Closed incidents can be reopened
- Reopening a Closed incident whose `approval_status` is `Approved` resets it to
  `Pending` and clears `approved_by`, `approval_date` and `approval_notes`
  (see below)
- Archived incidents remain in database (soft delete); archiving does not depend
  on status, and reopening does not change the `archived` flag

### Approval Workflow

```
[Pending] → [Approved] → (approval_date set)
    ↓
[Rejected]
    ↓
[Not required]
```

Stored values are those of `AIIncidentManagementApprovalStatus`
(`Servers/domain.layer/enums/ai-incident-management.enum.ts`): `Pending`,
`Approved`, `Rejected`, `Not required`. The column is `VARCHAR(20)`, not a DB
enum. `APPROVAL_STATUS_ENUM` in the validation utils still lists
`Not Required` (capital R) and the edit form labels the option that way, but
the value the form saves is `Not required`.

When approved:
- `approved_by` populated with approver name
- `approval_date` set to current timestamp
- `approval_notes` optional comments

Approval is sign-off on closing the incident. When a Closed incident is reopened
(status moves from `Closed` to anything else) and its stored approval is
`Approved`, that sign-off no longer describes it, so `applyReopenApprovalReset`
(`Servers/utils/validations/incidentManagementValidation.utils.ts`) rewrites the
update to `approval_status = Pending` with `approved_by`, `approval_date` and
`approval_notes` set to null. Change history keeps the old values. `Pending`,
`Rejected` and `Not required` are left as they are.

If the same update changes **any** approval field (`approval_status`,
`approved_by`, `approval_date`, `approval_notes` with a value different from the
stored one), the caller has made an explicit approval decision and the update is
kept as sent. A field sent back with its stored value counts as "not touched"
(the edit form always sends every field; `''` and null are treated as the same,
dates are compared as instants). So keeping an incident `Approved` through a
reopen is not possible by resubmitting the old approval: it needs a deliberate
re-approval in a later update.

### Shared update path

All updates to an existing incident go through
`updateIncident(organizationId, incidentId, updates, userId, { transaction?, changedBySystem?, expectedUpdatedAt? })`
in `Servers/services/incidentManagement.service.ts`. Callers today: the HTTP
update (`PATCH /ai-incident-managements/:id`), the AI Advisor tools
`agent_update_incident` / `agent_update_incident_status`, and the Jira
incidents status sync (`changedBySystem: true`, see
[Imported incidents](#imported-incidents-jira-incidents-extension)). In order, it:

1. Loads the incident once, `SELECT ... FOR UPDATE OF i` inside the transaction
   (its own, or the caller's when `transaction` is passed; it only commits or
   rolls back a transaction it opened), so concurrent updates serialise.
2. If `expectedUpdatedAt` is given and differs from the stored `updated_at`,
   throws `ConflictException`: "This incident was changed since you opened it.
   Reload to see the latest version." The controller answers 409. null or
   undefined means "no version check"; any other value that is not a
   date-time, including `''` and whitespace, is a 400 validation error
   (`expected_updated_at`, `INVALID_DATE`), checked before any read. The drawer
   sends a version only when the loaded incident has one, never `''`.
   `getIncidentByIdQuery` maps rows onto the model (`timestamps: true`,
   `underscored: true`), so the `updated_at` column is on `updatedAt`, not on
   `dataValues.updated_at`; the check reads `existing.updatedAt` like
   `toSafeJSON` does.
   In edit mode the drawer sends **only the fields the user changed** against
   the values it loaded, plus that version as `expected_updated_at`, so a save
   never writes back stale copies of fields it did not touch. On 409 the page
   refetches the incident (with `suppressGlobalErrorToast`), makes it the
   selected incident and refreshes the list without the table's loading state;
   the drawer then shows the latest value for every field the user has not
   edited, keeps the user's edits and takes the new version, and the page says
   the form now shows the other change with the user's edits kept. If a field
   the user edited was also changed by the other editor, the message names
   those fields ("Someone else also changed: Severity, Status. Saving again
   will replace their values with yours."); the user's values are kept. If the
   refresh fails or returns nothing, the drawer stays open and the message says
   to close and reopen the incident. Saving again applies only the user's
   edits on top of the other change. Any other save failure keeps the drawer
   open with the user's edits too. Lists (harm categories) compare as sets on
   both sides, so reordering is never an edit. The update
   request sets `suppressGlobalErrorToast` (a per-request axios config flag
   read by `customAxios`) because the page shows its own message. The page
   memoises the drawer's `initialData` on the selected incident so re-renders
   never reset the form, and Save is disabled while a save is in flight.
   Background writers (AI Advisor, sync jobs) do not pass `expectedUpdatedAt`.
3. Validates against the locked row: `validateCompleteIncidentUpdate` and
   `validateIncidentReferences` (FKs must belong to the organization; unchanged
   FKs come from the row; `''`, null and undefined mean "no reference" and are
   not looked up; anything that is not a positive integer is invalid and never
   reaches SQL). Field validation errors are thrown before the reference
   lookups run. Failures throw `IncidentUpdateValidationError`; the
   controller keeps its 400 body (`message: "Incident update validation failed"`,
   `errors: [{ field, message, code }]`).
4. Applies the reopen approval reset.
5. Diffs the update against the row with `diffIncidentColumns`
   (`Servers/utils/incidentManagement.utils.ts`). Keys that are not updatable
   columns are ignored. Values go through the same `isSameIncidentValue` helper
   (`incidentManagementValidation.utils.ts`) that the reset uses to decide
   whether an approval field was touched:
   - `''`, null and undefined are all empty;
   - date columns compare **calendar dates** (`incidentCalendarDate`). The
     columns are TIMESTAMP WITHOUT TIME ZONE and the project installs no custom
     pg type parser, so pg parses them (oid 1114) as server-local time: a stored
     Date is read by its local components (the wall-clock date stored), and a
     string starting `YYYY-MM-DD` is that date (Postgres ignores any offset for
     this column type). Known, separate issue: the API serialises these Dates
     with `toISOString()`, which shifts the date on a non-UTC server; the fix is
     a single pg type parser for oid 1114, not part of this change;
   - foreign keys compare as numbers, `archived` / `interim_report` treat empty
     as false, harm categories compare as lists.
   `archived` is never written as NULL.
6. If nothing changed, returns the row as it is: no UPDATE, no `updated_at`
   bump, no history, no automations.
7. Otherwise writes exactly the changed columns plus `updated_at`
   (`updateIncidentByIdQuery`) and records exactly those columns in
   `incident_change_history` (`formatEntityFieldChanges`). That includes
   `model_inventory_id` ("Affected model"), `project_id` ("Linked use case") and
   `assignee_id` ("Owner"), shown by name, falling back to `Model #id` /
   `Use case #id` / `User #id`. The name lookups are tenant-scoped
   (`AND organization_id = :organizationId`) and run on the update transaction
   (the connection holding the row lock), via the `FormatterContext` that
   `formatEntityFieldChanges` passes to field formatters. On a caller's
   transaction each lookup runs inside a SAVEPOINT (a nested transaction), so
   a failing lookup rolls back only the savepoint and the field falls back to
   its id label instead of aborting the caller's write. The project and model
   formatters do not query at all without an organization. The generic user
   formatter is scoped when given an organization. Creation history
   (`recordEntityCreation`, for every entity) always passes its organization
   and transaction, so new incidents record names, not ids.
   `trackEntityChanges` accepts the same optional context; other entities'
   update-history callers do not pass one yet and keep the old unscoped user
   lookup. History is recorded as `userId`, or, with
   `changedBySystem: true`, with a null actor and `changed_by_system = true`
   (shown as "System"). The AI Advisor uses the system form when its execution
   carries no user id.
8. Enqueues the `incident_updated` automation (`enqueueIncidentUpdatedAutomations`)
   in `transaction.afterCommit`, so nothing is sent for a rolled-back change.

It returns the updated incident, or `null` when the incident does not exist in
the organization.

## Change Tracking

All incident modifications are tracked:

| Event | Recorded |
|-------|----------|
| Creation | All initial field values |
| Update | Field-by-field changes (old → new) |
| Deletion | Deletion event |
| Archival | Archived flag change |

### Change History Entry

```typescript
{
  incident_id: number,
  action: "created" | "updated" | "deleted",
  field_name: string,
  old_value: string,
  new_value: string,
  changed_by_user_id: number,
  changed_at: Date
}
```

## Frontend Structure

### Main Page

**Location:** `pages/IncidentManagement/index.tsx`

**Features:**
- Incident list with filtering
- Filter by: incident_id, ai_project, type, severity, status, approval_status
- Group by support
- Search functionality
- Role-based create (Admin/Editor only)
- Export functionality

### Key Components

| Component | Purpose |
|-----------|---------|
| `IncidentManagement` | Main page |
| `IncidentTable` | Sortable, paginated table |
| `NewIncident` | Create/edit/view modal |
| `IncidentStatusCard` | Metrics display |
| `IncidentManagementSteps` | User onboarding tour |

### Incident Modal Sections

The modal is organized into 4 sections:

1. **Incident Information**
   - Project, type, severity
   - Status, dates
   - Reporter, model version

2. **Impact Assessment**
   - Harm categories (multi-select)
   - Affected persons/groups
   - Description
   - Relationship/causality

3. **Response & Actions**
   - Immediate mitigations
   - Planned corrective actions

4. **Approval & Reporting**
   - Approval status
   - Approver, approval date
   - Approval notes
   - Interim report toggle

### Table Features

- 8 sortable columns
- Pagination with localStorage persistence
- Sort state persistence
- Row options: 5, 10, 15, 25
- Color-coded status/severity chips
- Edit, archive, view actions
- Confirmation dialogs

## Validation Rules

### Field Validation

| Field | Rule |
|-------|------|
| description | 5-32,767 characters (`INCIDENT_DESCRIPTION_MAX_LENGTH`, Jira's text-field limit; column is TEXT) |
| categories_of_harm | At least one required |
| relationship_causality | 3-255 characters |
| ai_project | 2-255 characters |
| reporter | 2-100 characters |
| severity | Valid enum value |
| status | Valid enum value |
| approval_status | Valid enum value |
| occurred_date | Required |
| date_detected | Required, >= occurred_date |

The description rule (5 to 32,767 characters, measured after trimming whitespace) is defined once per
side and the two must stay in sync:

- **Backend:** `INCIDENT_DESCRIPTION_MAX_LENGTH`, `validateDescription` and
  `isIncidentDescriptionChanged` in `Servers/utils/validations/incidentManagementValidation.utils.ts`.
  - The controller rejects up front: `createIncidentSchema` includes `description`, and
    `validateIncidentUpdateBusinessRules` checks it when an update changes it. Failures return the
    standard 400 body `{ status, message, errors: [{ field: "description", message, code }] }`,
    with each message translated for the request. The update handler reads the stored incident
    first: a missing incident returns 404 and a failed read returns 500, so it never validates
    against a record it does not have.
  - As a backstop for writers that skip the controller (AI Advisor `agent_create_incident` /
    `agent_update_incident` / `agent_update_incident_status`, future integrations),
    `createNewIncidentQuery` and `updateIncidentByIdQuery` (`Servers/utils/incidentManagement.utils.ts`)
    call `assertValidIncidentDescription`, which throws a `ValidationException`. The controller maps
    it to the same 400 body; the Advisor reports its message as the tool error.
  - On update the description is only checked when it changes. Both sides are normalised first
    (null/undefined → "", trimmed), so "" vs NULL on an older row is not a change, and editing
    other fields of an older row with a shorter description still works.
  - `agent_create_incident` requires `description`; both Advisor tool schemas state the rule.
- **Frontend:** `Clients/src/application/validations/incidentValidation.ts`, used inline by the
  incident drawer. In edit mode the drawer skips the check when the description is unchanged from
  the loaded value, as the backend does. The drawer closes only after the save succeeds; while
  saving, Esc, Cancel, the close icon and the backdrop are ignored, and a save that settles after a
  newer draft was opened does not touch it. The drawer fills the form from `initialData` only when
  it opens or a different incident (`incidentId`) is loaded, and the page memoises `initialData` on
  the selected incident, so a page re-render (such as the failed-save toast) keeps the user's
  edits. On failure the toast shows server field messages only for allowlisted fields
  (`getApiValidationMessage` in `application/utils/apiErrorReason.ts`): description messages as
  sent, reference fields (`project_id`, `model_inventory_id`, `assignee_id`) as a sentence naming
  the picker. Anything else falls back to the generic text.

The messages are identical on both sides: "Description is required.", "Description must be at least
5 characters." and "Description cannot exceed 32,767 characters." (translated in
`Clients/src/i18n/translations.ts` and `Servers/locales/*.json`).

### Business Rule Validation

```typescript
// Creation rules
validateIncidentCreationBusinessRules(data) {
  if (date_detected < date_occurred) {
    throw Error("Detection date cannot be before occurrence date");
  }
}

// Update rules: none. Any status transition is allowed, including reopening.
validateIncidentUpdateBusinessRules(data, existing) {
  return [];
}

// Side effect of a reopen (applied before saving and change tracking)
applyReopenApprovalReset(existing, update) // Approved → Pending on Closed → other
```

## CE Marking Integration

Incidents can be linked to CE marking records for regulatory compliance:

```
Incident ──── ce_marking_incidents ──── CE Marking
```

This supports EU AI Act Article 73 requirements for documenting serious incidents alongside conformity assessments.

## Automation Triggers

| Trigger | Event |
|---------|-------|
| `incident_added` | New incident created |
| `incident_updated` | Incident modified |
| `incident_deleted` | Incident deleted |

`incident_added` is enqueued in `transaction.afterCommit` inside
`createNewIncidentQuery`, so it applies to every caller (the HTTP create, the AI
Advisor, the Jira import and the demo driver): a rolled-back create never sends
it.

### Email Template Variables

For incident notifications:
- `incident.*` - Current values
- `old_incident.*` - Previous values (for updates)
- `changes_summary` - Markdown list of all changes
- `date_and_time` - Current timestamp

## AI Advisor Integration

### Available Tools

| Tool | Purpose |
|------|---------|
| `fetch_incidents` | Query with filters |
| `get_incident_analytics` | Analytics dashboard |
| `get_incident_executive_summary` | High-level overview |

### Analytics Capabilities

- Type distribution
- Severity distribution
- Status distribution
- Harm categories breakdown
- Incidents by project
- Resolution progress metrics

## EU AI Act Compliance

The incident management system supports Article 73 requirements:

- **Serious Incident Reporting**: Track incidents with severity levels
- **Harm Documentation**: Categories align with EU AI Act harm types
- **Audit Trail**: Complete change history for regulatory review
- **CE Marking Link**: Associate incidents with conformity assessments
- **Interim Reports**: Flag for ongoing incident reporting

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/incidentManagement/incidemtManagement.model.ts` | Model |
| `domain.layer/interfaces/i.aiIncidentManagement.ts` | Interface |
| `domain.layer/enums/ai-incident-management.enum.ts` | Enums |
| `utils/incidentManagement.utils.ts` | Queries |
| `utils/validations/incidentManagementValidation.utils.ts` | Validation |
| `utils/incidentChangeHistory.utils.ts` | History tracking |
| `utils/automation/incident.automation.utils.ts` | Automation |
| `controllers/incident-management.ctrl.ts` | Controller |
| `routes/aiIncidentManagement.route.ts` | Routes |
| `advisor/tools/incidentTools.ts` | AI tools |

### Frontend

| File | Purpose |
|------|---------|
| `pages/IncidentManagement/index.tsx` | Main page |
| `pages/IncidentManagement/IncidentTable.tsx` | Table component |
| `components/Modals/NewIncident/index.tsx` | Modal |
| `application/validations/incidentValidation.ts` | Description length rule |
| `domain/enums/aiIncidentManagement.enum.ts` | Client enums |
| `domain/models/Common/incidentManagement/` | Client model |

## Imported incidents (Jira incidents extension)

The Jira incidents extension (`Servers/extensions/jira-incidents/`, see
[extensions.md](../infrastructure/extensions.md#jira-incidents)) imports new
Jira Cloud issues as incidents and then keeps status in sync both ways. Only
status syncs; VerifyWise never creates Jira issues.

### Tables

| Table | Holds |
|---|---|
| `jira_incidents_config` | One row per organization: site URL, email, encrypted API token, service account id and time zone, project, issue type, optional label, the three mappings (`status_map_in`, `status_map_out`, `severity_map`), defaults (use case, type, reporter), `import_from`, `last_checked_at` |
| `jira_incident_links` | One row per imported issue: `jira_issue_id`, key, URL, `incident_id`, `state` (`ok`, `error`, `conflict`, `deleted_in_jira`, `deleted_in_verifywise`), `state_reason`, `last_jira_status_id`, `last_vw_status`, `last_synced_at` (last check), `remote_link_pending`, `remote_link_tried_at`. UNIQUE (organization_id, jira_issue_id); a composite FK (incident_id, organization_id) keeps the link in its incident's organization |
| `jira_incident_sync_events` | Sync activity: `imported`, `status_from_jira`, `status_to_jira`, `conflict`, `error`, `deleted_in_jira`, with a JSON `detail`; an audit record under data retention |

### Creating an imported incident

`createIncidentForImport` (`Servers/services/incidentImport.service.ts`) is the
system creation path: it writes the incident inside the import's transaction,
records creation history as system (no user), enqueues `incident_added` after
commit and starts the incident response workflow for Very serious incidents,
as an HTTP create would. Each issue imports in its own transaction together
with its link row and `imported` event.

What is copied: the summary and the description (ADF converted to plain text,
cut to 32,767 characters, padded with the issue key when under 5), severity
from `severity_map` (Serious when the issue has no priority), status from
`status_map_in`, the issue's created date as `occurred_date` and
`date_detected`, and the configured use case, type and reporter. Approval
status starts at Pending. After commit, a remote link back to the incident is
added to the Jira issue when `FRONTEND_URL` is set. The link row is written
with `remote_link_pending = true`, cleared once Jira accepts the link. After
status sync, each run retries up to 20 pending links from earlier runs
(`retryRemoteLinks`): never-tried first, then by oldest failed attempt
(`remote_link_tried_at`), so links that keep failing cannot block the rest. A
link's first failed attempt records an `error` event; later failures are
logged only. A rate limit stops the run and leaves the link pending; links
imported while `FRONTEND_URL` was unset get theirs once it is set.

### Status rules

Each run reads both sides for every link in `ok`, `error`, `conflict` or
`deleted_in_jira` whose incident exists and is not archived, except settled
links: `ok`, the incident Closed and `last_vw_status` Closed are re-read from
Jira at most once every 24 hours (`SETTLED_RECHECK_HOURS`, measured from
`last_synced_at`). A reopen in Jira can therefore take up to a day to reach a
closed incident (a manual **Sync now** reads them all); a VerifyWise change
unsettles the link at once. "Changed"
means different from `last_jira_status_id` / `last_vw_status`:

| Jira changed? | VerifyWise changed? | Action |
|---|---|---|
| no | no | nothing |
| yes | no | set the incident to `status_map_in[jira status]` through `updateIncident(..., { changedBySystem: true })`; `status_from_jira` event |
| no | yes | if `status_map_out[vw status]` is "Don't change Jira", record it and do nothing; otherwise transition the issue; `status_to_jira` event |
| yes | yes | the later of the two change times wins and is applied to the other side; `conflict` event with both values; link `state = conflict` |

- Both `last_*` values are updated in the same transaction as the write, so a
  status written by the sync is never seen as a change on the next run.
- The link and incident are locked and re-checked before each write (lock
  order link → incident, as on the delete path); if either changed in the
  meantime, the link waits for the next run.
- An issue imported in an unmapped status has an empty `last_jira_status_id`,
  so a later mapping is applied. A VerifyWise change on it is VerifyWise's
  alone (no conflict) unless Jira's changelog shows a status move after the
  link was created (less one minute, for clock skew and the search-to-write
  gap: a move that close counts as a conflict).
- An unmapped Jira status, or a transition that needs a field (such as
  Resolution) or does not exist from the current status, marks the link
  `error` with the reason; the incident is left as it is.
- Jira refusing one issue (403: issue security, a transition the account may
  not use) marks only that link `error`; a rejected token (401) fails the run.
- Links already `deleted_in_jira` are read one by one, and a batch search that
  Jira rejects (it does when it names a deleted issue) falls back to per-issue
  reads, so one deleted issue never stops the rest of the batch.
- A Jira status that reopens a Closed incident goes through `updateIncident`,
  so the reopen rule applies.
- An issue that Jira answers 404 for, while the project is still readable, is
  `deleted_in_jira`; the incident is untouched and the link recovers if the
  issue comes back.

### Deleting an imported incident

Deleting the incident marks its link `deleted_in_verifywise` (in the delete
transaction, `utils/incidentManagement.utils.ts`); the FK then nulls
`incident_id`. The row stays so the issue is never imported again.

## Follow-ups

Known issues outside this change, recorded so they are not lost:

- **Cross-organization user names in other entities' change history
  (pre-existing).** `GENERIC_FORMATTERS.user` (`Servers/config/changeHistory.config.ts`)
  only filters by `organization_id` when a `FormatterContext` with an
  `organizationId` is passed. Incident history and every entity's creation
  history (`recordEntityCreation`) pass one; the update-history callers of
  `trackEntityChanges` for vendors, vendor risks, use cases / projects, project
  risks, model inventory, model risks, policies, tasks, training, datasets and
  files do not (`Servers/utils/*ChangeHistory.utils.ts` wrappers and their
  controllers). For those, a user id from another organization written into a
  tracked field would be shown with that user's name. Fix: pass
  `{ organizationId, transaction }` from each caller.
- **TIMESTAMP WITHOUT TIME ZONE dates shift on non-UTC servers
  (pre-existing).** pg parses these columns (oid 1114) as server-local time
  and the API serialises them with `toISOString()`, so `occurred_date`,
  `date_detected` and `approval_date` can show a day early or late when the
  server is not on UTC. Fix: a single pg type parser for oid 1114.

## Related Documentation

- [Risk Management](./risk-management.md)
- [Use Cases](./use-cases.md)
- [Compliance Frameworks](./compliance-frameworks.md)
