# Incident Management Domain

## Overview

Incident Management in VerifyWise provides a comprehensive system for tracking, investigating, and resolving AI-related incidents. It supports EU AI Act Article 73 compliance for serious incident reporting, with approval workflows, change tracking, and integration with CE marking documentation.

## Key Features

- Incident lifecycle management (Open → Investigating → Mitigated → Closed, plus Suspended and Emergency action; closed incidents can be reopened)
- Multi-level severity classification (Minor, Serious, Very serious)
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
├── occurred_date (DATE NOT NULL)
├── date_detected (DATE NOT NULL)
├── reporter (VARCHAR(255) NOT NULL) -- name; the reporter_id user's full name when set
├── reporter_id (FK → users, ON DELETE SET NULL)
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
├── approved_by (VARCHAR(255)) -- name, set by the server
├── approved_by_id (FK → users, ON DELETE SET NULL) -- set by the server
├── approval_date (DATE) -- set by the server
├── approval_notes (TEXT)
├── archived (BOOLEAN, default: false)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### Dates and people

`occurred_date`, `date_detected` and `approval_date` are `DATE` columns
(migration `20261123192509-incident-dates-and-people`; they were
`TIMESTAMP` until 2026-11). The API sends and returns them as `YYYY-MM-DD`.
Sequelize registers its `DATEONLY` parser for the `date` type on every pooled
connection, so raw `sequelize.query` reads get the string too, never a JS Date
at server-local midnight. A request may send an ISO date-time; its date part
(`YYYY-MM-DD` prefix, offset ignored) is stored. A JS Date built by server
code (a Jira issue's creation time) is stored as its UTC
date (`toIncidentDateValue` in `incidentManagementValidation.utils.ts`).
People-facing formatting (automation emails, reports) uses
`formatIncidentDay`, which formats the day in UTC so a server west of UTC
never shows the day before.

The migration converted existing rows with `col::date`, the stored wall-clock
date: the drawer always sent `YYYY-MM-DD` and the server-side writers sent
Dates as UTC (Sequelize sessions run at `+00:00`), so this is the date each
row was created with. Its `down` converts back to `TIMESTAMP` at midnight.

On the page, the table and CE marking format the stored day itself
(`toDateOnlyString` then the user's date format), the occurred date filter
compares local midnight of that day (`dateOnlyToLocalDay`), and the export
writes `YYYY-MM-DD`. The drawer's default dates are the user's own today,
computed when it opens (`createInitialState`), not the UTC date at page load.

`reporter_id` and `approved_by_id` are user foreign keys (`ON DELETE SET
NULL`, like `assignee_id`). The text columns stay: Jira imports send a name
only, rows created before 2026-11 have a first name only (no backfill: a first
name cannot be matched to one user), and the server writes the user's full
name into the text whenever it sets an id, so readers of the text stay right.
The list and single reads add `reporter_name` and `approved_by_name` (the
users' current full names while they are members of the incident's
organization; null without an id or once the user has left, as the report's
reporter and Wise Search do); the page shows
`reporter_name || reporter` and `approved_by_name || approved_by`
(`AIIncidentManagementModel.reporterLabel` / `approverLabel`).

- **Reporter on create:** required as a `reporter_id` or a non-empty
  `reporter` text. A `reporter_id` must be a member of the caller's
  organization (`getIncidentMemberName`; otherwise 400 `INVALID_REFERENCE` on
  `reporter_id`), and the server writes their full name into `reporter`,
  ignoring any text sent. The drawer picks reporters by user id; the Advisor
  sends the requesting user's id and name when they are a member of the
  organization, else their name text only ("User #<id>").
- **Reporter on update:** a changed `reporter_id` is checked the same way as
  on create and makes `reporter` that member's current full name, ignoring
  any text sent. One sent back unchanged leaves the stored reporter (id and
  text) as it is, whatever text was sent: the page shows the user's current
  name from the join, and a write that does not change the reporter never
  writes the reporter column (so an approve-only caller or a restore never
  does), nor is a departed reporter re-checked. A changed `reporter` text sent without `reporter_id`
  clears the stored `reporter_id` (the text now names someone else). Clearing
  `reporter_id` (null or "") leaves the text, sent or stored, as the reporter,
  so it must not be blank. The drawer sends `reporter` and `reporter_id`
  together whenever the reporter changed, and offers the reporter the incident
  was opened with as an extra option when it is not among the listed users
  (text only, or departed), so the user can go back to it.
- **Approver:** `approved_by_id` is server-set like `approved_by` and
  `approval_date` (dropped from every request). A decision stamps the acting
  user's id and name and the user's own date (see
  [Editing versus approving](#editing-versus-approving)); Pending or
  Not required, and the reopen reset, clear all three.
- **Removed or deleted users:** removing a member from the organization does
  not clear `reporter_id` or `approved_by_id` (they record who did something,
  not who is responsible now, unlike the owner); deleting the account nulls
  them through the foreign key, and the page falls back to the stored text.
- Change history tracks both the text and the id columns, under the same
  labels ("Reporter", "Approved by"; ids formatted as the user's name,
  scoped to the organization). The service records one row per person change
  (`incidentHistoryColumns`, and `creationHistoryValues` on create): the user
  row when the person is a user both before and after the change, so a change
  between two users with the same name is still recorded; otherwise the text
  row, so both sides are names (a text-only reporter, or an approver recorded
  before `approved_by_id` existed, becoming a user reads "Bob" → "Jane
  Smith", not "-" → "Jane Smith"), even when only the id changed.

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

Mounted at `/api/ai-incident-managements`.

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/` | Any member | Get all incidents |
| GET | `/:id` | Any member | Get incident by ID (404 when missing or in another organization) |
| POST | `/` | `incident.create` (Admin, Editor) | Create incident |
| PATCH | `/:id` | `incident.edit` or `incident.approve` (Admin, Editor, Reviewer), then per field (below) | Update incident, including approval |
| PATCH | `/:id/archive` | `incident.edit` (Admin, Editor) | Archive incident (restore with `PATCH /:id` and `{ "archived": false }`, see [Archive, restore and delete](#archive-restore-and-delete)) |
| DELETE | `/:id` | `incident.delete` (Admin) | Delete incident (404 when missing or in another organization) |

Until 2026-11, edit, archive and delete needed only a login, so Auditors could change or delete incidents. Migration `20261122180000` grants `incident.edit` to custom roles that hold `incident.create` or `organization.admin`, and `incident.delete` to custom roles that hold `organization.admin`.

#### Editing versus approving

Two keys split the work on an existing incident:

| Key | Built-in roles | Covers |
|-----|----------------|--------|
| `incident.edit` | Admin, Editor | Every field except the approval ones (status, severity, description, owner, `archived`, ...), and the archive route |
| `incident.approve` | Admin, Reviewer | `approval_status` and `approval_notes` |

Until 2026-11 `incident.edit` covered both and Reviewers held it only because the drawer is where approval is recorded. Reviewers now approve but cannot edit or archive; Editors edit but cannot approve. Custom roles get the same split: migration `20261123120000` grants `incident.approve` to roles that hold `organization.admin`, and to Reviewer-like roles (a contributor-tier key such as `file.contribute`, `fileManager.contribute` or `riskLinks.review`, but no `incident.create`). Editor-like roles (`incident.create`) keep `incident.edit` without approval.

The update route lets in a caller holding either key (`authorizeAny` in `middleware/accessControl.middleware.ts`). The controller resolves both keys for the caller (`requestHasPermission`) and passes them to `updateIncident` as `access: { canEdit, canApprove }`. Against the locked row, `incidentWriteNeeds` (`utils/incidentManagement.utils.ts`) lists the columns the request actually changes (the same `isSameIncidentValue` comparison as the diff, so a value sent back unchanged does not count) and splits them by key. A change the caller's access does not cover throws `IncidentAccessDeniedError`; the controller answers 403 with a translated message ("Your role does not allow editing this incident's details." or "Your role does not allow approving or rejecting incidents."), and nothing is written. The check runs on the caller's request, before the reopen reset and the approval stamp, so an Editor can still reopen an approved incident (the reset is the server's rewrite, not the Editor's approval change).

`approved_by` and `approval_date` are set by the server, never by the caller: every write path drops them from the request (`withoutServerSetApprovalFields`). When `approval_status` changes (`approvalStampFor`):

- to Approved or Rejected: `approved_by` is the acting user's name (`name surname` from `users`, `getIncidentApproverName`, `User #<id>` without a name), `approved_by_id` their id and `approval_date` the acting user's calendar day (`incidentToday`, below);
- to Pending or Not required: all three are cleared;
- unchanged (for example only the notes change): they stay as stored.

The approval date is the actor's own day, not the UTC one: an approver in Toronto at 20:00 records that day, not tomorrow. The console sends the browser's local date in the `X-Client-Date` header on every request (`Clients/src/infrastructure/api/clientDate.ts`, added by the axios interceptor and the Advisor chat transport); `authenticateJWT` stores it unchecked in the request context (`readClientDateHeader` / `getRequestClientDate` in `Servers/utils/context/context.ts`). `incidentToday(clientDate)` uses it only when it is a bare real date (`YYYY-MM-DD`) that is today somewhere on earth right now (from today in UTC-12, `earliestIncidentToday`, to today in UTC+14, `latestIncidentDate`), else today in UTC; so a caller can move the date by at most their own time zone, never backdate it. API-token callers and the MCP server send no header and get the UTC date. The approver and the fact the server sets the date stay server-controlled. The Advisor's new incidents use the requester's day for `occurred_date` and `date_detected`: a write tool captures the requester's accepted date when they ask (`createWriteTool`, `acceptedClientDate`) and the approval gateway stores it with the action's params as `_requesterClientDate` (`REQUESTER_CLIENT_DATE_PARAM`, server-set: the tool bridge drops every underscore param from the model, and the wrapper drops this one), so an approver running the action later from another time zone does not change it. Without one the executor uses the current request's date, else UTC. The approval request view (`approvalRequest.utils.ts`) leaves the internal param out.

On create (`createNewIncident`), a caller without `incident.approve` gets an incident that starts Pending with no approver, date or notes, whatever was sent. A caller with it may create the incident Approved or Rejected; the server then records them as approver, dated today. Creation history records the approval as stored.

`updateIncident` refuses a call with neither `access` nor `changedBySystem`. System writers (`changedBySystem: true`, the Jira status sync) default to `SYSTEM_INCIDENT_ACCESS`: details only, never approval. The Advisor's incident tools and the MCP `update_incident` tool check `incident.edit` for their user and pass edit-only access: they change details only and never record approval.

On the incidents page, the drawer enables the approval status and notes only with `incident.approve` and every other field only with `incident.edit` (`incident.create` for a new incident). "Approved by" and "Approval date" are read-only and show the server's values. Without `incident.edit` the row menu offers View, plus "Record approval" with `incident.approve`, which opens the drawer with only the approval fields editable (its title reads "Record approval"); clicking the row does the same. Roles with neither key open incidents read-only. The page has no delete action. The Advisor's incident write tools check the same keys for the user who asked, when the write is proposed and again when it runs.

### Archive, restore and delete

Archiving is reversible. `PATCH /:id/archive` archives (its body is ignored,
as before). The controller calls `setIncidentArchived`
(`services/incidentManagement.service.ts`), which is
`updateIncident(..., { archived: true }, userId, { access: { canEdit: true, canApprove: false } })`:
the route already requires `incident.edit`, and `archived` is an incident
detail. Restoring is an ordinary update, `PATCH /:id` with
`{ "archived": false }` (it needs `incident.edit`; the page's "Restore
incident" sends exactly that). So archive and restore both take the row lock,
record an "Archived" change (No → Yes, or back) in `incident_change_history`,
and send `incident_updated` after commit. Archiving an archived incident
changes nothing and records nothing. The archive route answers the incident
(200), 404 when it is not in the organization, 400 for a validation error from
the write path and 409 for a conflict. The Advisor's `agent_archive_incident`
uses `setIncidentArchived` too; there is no Advisor restore tool.

An archived incident is read-only until restored: `updateIncident` refuses a
change to any field other than `archived` (`IncidentArchivedError`; REST
answers 409, code `INCIDENT_ARCHIVED`, "Restore this incident before editing
it.", nothing written). A request that restores and changes another field in
the same call is refused the same way. The page opens archived incidents
read-only, including from a `?incidentId=` link. The Jira status sync never
writes to archived incidents: `listSyncableLinks` leaves them out and
`stillAsRead` re-checks `archived` under the incident lock before each write.

Archived incidents are left out of:

- the incidents page's default view (see [Main Page](#main-page));
- the dashboard's incident counts and status chart (`fetchIncidentMetrics` in
  `Clients/src/application/hooks/useDashboardMetrics.ts`), so they match the page;
- Wise Search (`alwaysWhere: "archived IS NOT TRUE"` on `incident_management`
  in `Servers/utils/search.utils.ts`, see [search.md](./search.md)), which
  also matches the reporter user's current full name (`searchExpressions`,
  members of the incident's organization only) besides the stored `reporter`
  text;
- the CE marking "Link incidents" picker (see [CE Marking Integration](#ce-marking-integration));
- reports (see [Reports](#reports));
- the Home queue (`services/homeQueue/sources/incidents.source.ts`), the Jira
  status sync and the Advisor's incident lists and analytics, as before.

`GET /ai-incident-managements` and the MCP `list_incidents` tool still return
archived incidents (with `archived: true`); the client filters.

Deleting (`DELETE /:id`, `incident.delete`, Admin only) is permanent and is not
offered on the incidents page. `deleteIncident` (`services/incidentManagement.service.ts`),
used by the route and the Advisor's `agent_delete_incident`, runs in one
transaction:

1. `deleteIncidentByIdQuery` marks a Jira link `deleted_in_verifywise`, then
   deletes the row (`DELETE ... RETURNING *`). No `SELECT ... FOR UPDATE`
   first: the delete takes the link before the incident, the lock order of the
   Jira status sync.
2. When nothing was deleted (missing, or another organization's), it returns
   null: nothing is written, no automation is sent. The route answers 404 and
   the Advisor tool `{ success: false, message: "Incident #<id> not found." }`,
   like its other refusals.
3. Otherwise a deletion entry is recorded with `recordEntityDeletion`
   (`field_name` "Incident", "Active" → "Deleted", action `deleted`), as the
   user or as the system for an Advisor execution without one.
   `incident_change_history.incident_id` has no foreign key, so the entry
   outlives the incident; it also goes to the audit ledger after commit.
4. `incident_deleted` is enqueued in `transaction.afterCommit`, so a delete
   that rolls back sends nothing.

The incident's CE marking links go with it (`fk_ce_incidents_incident`,
`ON DELETE CASCADE`).

### Change History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/incident-change-history/:incidentId` | Get change history |

Query params: `limit` (an integer from 1 to 100, default 100) and `offset` (a whole number of 0 or more, default 0). Anything else, such as `-5`, `12abc` or `101`, answers 400 ("limit must be an integer from 1 to 100" / "offset must be a whole number of 0 or more"). The parser (`historyPageNumber`, `MAX_HISTORY_LIMIT` in `Servers/utils/historyPaging.utils.ts`) is shared with the use case history endpoint.

## Create Incident Request

```typescript
POST /aiIncidentManagement/
{
  ai_project: "Customer Service Chatbot",
  type: "Unexpected behavior",
  severity: "Serious",
  occurred_date: "2025-01-15",
  date_detected: "2025-01-15",
  reporter_id: 12,          // or reporter: "John Smith" (text only)
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

### Reference checks on create

Both run in `createIncident` (`Servers/services/incidentManagement.service.ts`),
the create path of the REST create and the Advisor. Field validation
(`validateCompleteIncidentCreation`) runs first, outside any transaction. The references (`project_id`, `model_inventory_id`, and
`assignee_id` against `organization_members`) are then checked by
`validateIncidentReferences` inside the create transaction, before the insert,
with plain reads (no row locks). `''`, null and an absent field all mean "no
reference" and are stored as NULL (`toIncidentReferenceValue`, shared with the
update path). A bad reference rolls the transaction back and answers 400
(`message: "Incident creation validation failed"`, one
`{ field, message: "<field> does not reference an entity in your organization", code: "INVALID_REFERENCE" }`
per bad reference). Both messages are translated with the request language
(locale keys `Incident creation validation failed` and
`{field} does not reference an entity in your organization`). A database error
in the check rolls back and answers 500. `createIncident` tracks whether its
transaction has been committed or rolled back and only rolls back an open one,
so an error after the commit still gets an answer. Validation failures, bad
references and a reference deleted after the check are thrown as
`IncidentCreateValidationError`, which the controller answers with this 400.

A use case, model or owner account deleted by another transaction after the
check fails the insert's foreign key check (Postgres 23503).
`incidentReferenceFieldFromError` (`Servers/utils/incidentManagement.utils.ts`)
recognises a violation of `ai_incident_managements` on one of those three
columns, and the create answers the same 400 for that field instead of a 500.
The column comes from the constraint name
(`ai_incident_managements_<column>_fkey`), which does not depend on the
server's message language; the English `Key (<column>)=` detail is only a
fallback. The update path (`updateIncident`) maps the same violation to the
same `INVALID_REFERENCE` error, with `transactionAborted: true` on the
`IncidentUpdateValidationError`: Postgres has aborted the transaction, so a
caller that passed its own can only roll it back.

**Known limit.** An owner removed from the organization (membership deleted,
account kept) at the same moment as a create or an owner change can remain the
incident's owner: membership has no foreign key, and the check takes no locks
on purpose, because locking the referenced rows deadlocks with the user,
member and organization deletion paths.

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
- Archived incidents remain in database (soft delete) and can be restored;
  archiving does not depend on status, and reopening does not change the
  `archived` flag

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
`Approved`, `Rejected`, `Not required`. The column is `VARCHAR(20)` with the
CHECK constraint `ai_incident_managements_approval_status_check`.
`APPROVAL_STATUS_ENUM` in the validation utils is built from the enum. The edit
form's option labels are the stored values ("Not required"), translated on
screen; the value saved is never translated.

When approved or rejected (set by the server, see
[Editing versus approving](#editing-versus-approving)):
- `approved_by` is the name of the user who changed the status
- `approval_date` is the day of the change, in the approver's time zone
- `approval_notes` optional comments (needs `incident.approve`)

Approval is sign-off on closing the incident. When a Closed incident is reopened
(status moves from `Closed` to anything else) and its stored approval is
`Approved`, that sign-off no longer describes it, so `applyReopenApprovalReset`
(`Servers/utils/validations/incidentManagementValidation.utils.ts`) rewrites the
update to `approval_status = Pending` with `approved_by`, `approval_date` and
`approval_notes` set to null. Change history keeps the old values. `Pending`,
`Rejected` and `Not required` are left as they are.

If the same update changes an approval field the caller may set
(`approval_status` or `approval_notes` with a value different from the stored
one; `approved_by` and `approval_date` are dropped from every request), the
caller has made an explicit approval decision and the update is kept as sent. A field sent back with its stored value counts as "not touched"
(the edit form always sends every field; `''` and null are treated as the same,
dates are compared as instants). So keeping an incident `Approved` through a
reopen is not possible by resubmitting the old approval: it needs a deliberate
re-approval in a later update.

### Shared update path

All updates to an existing incident go through
`updateIncident(organizationId, incidentId, updates, userId, { access?, transaction?, changedBySystem?, expectedUpdatedAt? })`
in `Servers/services/incidentManagement.service.ts`. Callers today: the HTTP
update (`PATCH /ai-incident-managements/:id`), archive and restore
(`PATCH /:id/archive` and the Advisor's `agent_archive_incident`, through
`setIncidentArchived`), the AI Advisor tools
`agent_update_incident` / `agent_update_incident_status`, the MCP
`update_incident` tool, and the Jira
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
3. Checks the caller's access against the locked row (see
   [Editing versus approving](#editing-versus-approving)): 403 when a changed
   field needs a key the caller lacks.
4. Validates against the locked row: `validateCompleteIncidentUpdate` and
   `validateIncidentReferences` (FKs must belong to the organization). Only the
   references the update changes are checked (`changedReferences`): one left
   out or sent back with its stored value is not looked up, so a reference that
   has since become invalid (an owner who left the organization) never blocks
   other edits, archive or restore. `''`, null and undefined mean "no
   reference" and are not looked up; anything that is not a positive integer
   is invalid and never reaches SQL. Field validation errors are thrown before the reference
   lookups run. Failures throw `IncidentUpdateValidationError`; the
   controller keeps its 400 body (`message: "Incident update validation failed"`,
   `errors: [{ field, message, code }]`). A reference deleted after this check
   fails the UPDATE's foreign key check; that violation is thrown as the same
   `INVALID_REFERENCE` error (see [Reference checks on create](#reference-checks-on-create)).
5. Applies the reopen approval reset, then sets or clears `approved_by` and
   `approval_date` when `approval_status` changes.
6. Diffs the update against the row with `diffIncidentColumns`
   (`Servers/utils/incidentManagement.utils.ts`). Keys that are not updatable
   columns are ignored. Values go through the same `isSameIncidentValue` helper
   (`incidentManagementValidation.utils.ts`) that the reset uses to decide
   whether an approval field was touched:
   - `''`, null and undefined are all empty;
   - date columns compare **calendar dates** (`incidentCalendarDate`): the
     columns are DATE and read back as `YYYY-MM-DD` strings (see
     [Dates and people](#dates-and-people)); a string starting `YYYY-MM-DD` is
     that date, a JS Date its UTC date;
   - foreign keys (including `reporter_id` and `approved_by_id`) compare as numbers, `archived` / `interim_report` treat empty
     as false, harm categories compare as lists.
   `archived` is never written as NULL.
7. If nothing changed, returns the row as it is: no UPDATE, no `updated_at`
   bump, no history, no automations.
8. Otherwise writes exactly the changed columns plus `updated_at`
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
9. Enqueues the `incident_updated` automation (`enqueueIncidentUpdatedAutomations`)
   in `transaction.afterCommit`, so nothing is sent for a rolled-back change.
10. When the change raises severity from below the critical tier into it, starts
   the [critical incident response workflow](#critical-incident-response-workflow),
   also in `transaction.afterCommit` and at most once per incident.

It returns the updated incident, or `null` when the incident does not exist in
the organization.

### Owner removed from the organization

Removing a user from an organization (`removeUserFromOrganizationQuery` in
`Servers/utils/user.utils.ts`, behind `DELETE /users/:id` and the super
admin's `DELETE /super-admin/organizations/:id/users/:userId`) clears
`assignee_id` on that organization's incidents they own, in the removal's
transaction. Incidents in other organizations they still belong to keep them
as owner.

- The removal first locks the membership row (`FOR UPDATE`). If there is no
  membership it returns `removed: false` and changes nothing.
- Known limit: incident creates and owner changes check membership without a
  lock, so one that runs at the same moment as the removal can still set the
  member being removed as owner, after the clear has run.
- Each cleared incident gets `updated_at` bumped (an editor holding the old
  version gets the usual 409) and an `Owner` change (`<name>` → `-`) in
  `incident_change_history`, recorded as the system
  (`changed_by_system = true`, null actor) in one bulk insert
  (`recordEntityFieldChangeBulk`; its ledger appends run one after another
  after commit). The history is written before the membership is deleted,
  so the tenant-scoped user lookup still names them. It runs in a savepoint:
  a failed history write is logged and never blocks the removal.
- No `incident_updated` automation is sent for the clear.
- Deleting the whole organization (`deleteOrganization`) passes
  `organizationDeleted`, which skips this clear and its history: the
  incidents are deleted with the organization.
- Deleting an account goes through the same clear for every organization; the
  FK's `ON DELETE SET NULL` is the fallback.

## Change Tracking

All incident modifications are tracked:

| Event | Recorded |
|-------|----------|
| Creation | All initial field values (console and Advisor, through `createIncident`; Jira import as the system) |
| Update | Field-by-field changes (old → new) |
| Deletion | "Incident": Active → Deleted (action `deleted`); kept after the incident is gone |
| Archival and restore | "Archived": No → Yes, or Yes → No |

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
- A view select: "Active only" (the default), "Active + archived" or "Archived
  only" (`incidentsForArchiveView`). Archived rows carry an "Archived" chip,
  open read-only, and their row menu offers View and, with `incident.edit`,
  "Restore incident" (`PATCH /:id` with `{ archived: false }`). The
  archive confirmation says archived incidents leave the default list,
  dashboard, search and reports and can be restored from the "Archived only"
  view. The status cards count the incidents of the chosen view, the set a
  card click filters. "No archived incidents." shows only when there are none.
- Empty states (`IncidentTable`): when a search, a status card or a filter
  hides every row, the table says "No incidents match these filters." with a
  Clear filters button (clears the search, the status card and the filters,
  not the view select). With nothing narrowing the list, "Active only" and
  every incident archived says so and points to the "Archived only" view;
  otherwise the "No incidents reported yet" state shows.
- Filters (`TableFilter`): incident ID, use case, affected model, owner, type,
  severity, status and occurred date. The occurred date column is a
  `dateRange: "recent"` column: it offers "is today" and "in the last 1 / 7 /
  14 / 30 days" (today and the N days before it), compared by the user's local
  calendar day (`in_last_*` operators in
  `Clients/src/application/utils/filterConditions.ts`). Due-date columns on
  other pages keep the forward-looking "in N days" operators.
- Search (`incidentMatchesSearch` in `pages/IncidentManagement/incidentSearch.ts`):
  the visible incident ID ("INC-12"), the use case title and the reporter's
  name, ignoring case and surrounding spaces. The database id is not searched.
- Toasts: info and success close after 3 seconds; errors and warnings (such as
  the edit-conflict message) stay until the user closes them.
- After a save, archive or restore the list is fetched again in place (no
  loading skeleton, no table remount), so the page, sort, filters and scroll
  position are kept. The skeleton shows on the first load only.
- Role-based create (`incident.create`: Admin, Editor), edit (`incident.edit`) and approval (`incident.approve`)
- Export functionality

### Key Components

| Component | Purpose |
|-----------|---------|
| `IncidentManagement` | Main page |
| `IncidentTable` | Sortable, paginated table |
| `NewIncident` | Create/edit/view drawer |
| `IncidentStatusCard` | Metrics display |
| `IncidentManagementSteps` | User onboarding tour |

### Incident Modal Sections

The drawer (`components/Modals/NewIncident`) is a right-hand MUI drawer,
`min(700px, 100vw)` wide; two-field rows stack on narrow screens. Its header
shows in every mode: "Create new incident", "Edit incident", "Record approval"
or "View incident", the incident ID and Jira chip when editing, and a close
button (a focusable button labelled "Close"). The drawer is named by its title
(`aria-labelledby`).

Option labels (incident types, harm categories, severity, status, approval
status) are the stored values in sentence case, translated on screen through
`Clients/src/i18n/modules/incidents.ts`; the values sent to the API are never
translated. Names that are data (use cases, users, models) are marked
`noTranslate`.

The use case picker lists every use case the user can see (`useProjects`, not
only approved ones: the server accepts any use case of the organization for
`project_id`). Options are keyed by project id; a title shared by several use
cases gets the use case ID after it ("Chatbot (UC-5)"). Picking one sets
`project_id` and copies the title into the free-text `ai_project`. An incident
whose use case is not in the list (stored as text only, such as a Jira import,
or not visible to the user) keeps it as an extra option, selected, so the
stored value still shows and can be picked again (`STORED_USE_CASE_OPTION` for
text only).

The drawer is organized into 4 sections:

1. **Incident information**
   - Use case, type, severity
   - Status, dates
   - Reporter, model version

2. **Impact assessment**
   - Harm categories (multi-select)
   - Affected persons/groups
   - Description
   - Relationship/causality

3. **Response and actions**
   - Immediate mitigations
   - Planned corrective actions

4. **Approval and reporting**
   - Approval status (needs `incident.approve`)
   - Approved by, approval date (read-only, set by the server)
   - Approval notes (needs `incident.approve`)
   - Interim report toggle (needs `incident.edit`)

### Table Features

- 8 sortable columns
- Pagination with localStorage persistence
- Sort state persistence
- Row options: 5, 10, 15, 25
- Color-coded status/severity chips
- Edit, archive, view actions; "Record approval" for roles with `incident.approve` but not `incident.edit`; View and "Restore incident" on archived rows
- Confirmation dialogs

## Validation Rules

### Field Validation

The rules live in `Servers/utils/validations/incidentManagementValidation.utils.ts` (`FIELD_RULES`,
`validateCompleteIncidentCreation`, `validateIncidentUpdateBusinessRules`). Enum lists come from
`Servers/domain.layer/enums/ai-incident-management.enum.ts` and match the CHECK constraints.

| Field | Create | Update |
|-------|--------|--------|
| ai_project (use case) | Required, text, at most 255 characters (VARCHAR(255)) | Cannot be blanked; same rule when changed |
| type | Required, one of `IncidentType` (the column has no CHECK, so this is the only gate) | Cannot be blanked; same rule when changed |
| severity | Required, one of `Severity` (Minor, Serious, Very serious) | Cannot be blanked; same rule when changed |
| status | Optional, defaults to Open; one of `AIIncidentManagementStatus` | Cannot be blanked; same rule when changed |
| approval_status | Optional, defaults to Pending; one of `AIIncidentManagementApprovalStatus` | Cannot be blanked; same rule when changed |
| occurred_date, date_detected | Required; a real date (YYYY-MM-DD or an ISO date-time); not later than today in UTC+14 | Cannot be blanked; same rule when changed |
| date_detected vs occurred_date | Detected on or after occurred (calendar dates) | Checked when either date changes, on the dates the row ends up with (request over the stored row) |
| reporter | Required as a `reporter_id` or text (at most 255 characters); with a `reporter_id` the text is the user's full name | A changed `reporter_id` sets the text to the user's name, an unchanged one keeps the stored text; otherwise checked on the reporter the row ends up with (text sent, or stored) when the text changes or `reporter_id` is cleared |
| reporter_id | Optional user id (positive integer) of a member of the organization | Membership checked only when changed; a changed reporter text sent without it clears it |
| model_system_version | Optional text, at most 255 characters | Same |
| description | 5-32,767 characters (`INCIDENT_DESCRIPTION_MAX_LENGTH`, Jira's text-field limit; column is TEXT) | Checked only when it changes |
| affected_persons_groups, relationship_causality, immediate_mitigations, planned_corrective_actions, approval_notes | Optional text (TEXT, no length limit) | Same |
| categories_of_harm | Optional: a list of `HarmCategory` values (Health, Safety, Rights, Property, Environment), or the comma-separated string form; empty is allowed | A list (empty allowed); items the update adds must be `HarmCategory` values, stored items outside the list may stay; null, strings and other JSON are refused |
| interim_report, archived | Optional booleans | Same |
| model_inventory_id, project_id, assignee_id | Optional positive integer ids in the organization | Same |

- **"Today in any time zone."** A date may be at most today's date in UTC+14, the furthest-ahead
  time zone (`latestIncidentDate`: now plus 14 hours, as a UTC date), so a user anywhere can enter
  their own today, and anything later is refused. The drawer refuses dates after the user's own
  today, and in edit mode checks the future rule only for a date the user changed.
- **Update checks only what changes.** A field the update leaves out, or sends with its stored value
  (`isSameIncidentValue`), is not re-checked, so an older row whose values predate a rule (an
  unknown type, a long reporter, reversed dates) can still be edited. A changed required field sent
  as null or "" is refused.
- **Errors.** Each failing field gives `{ field, message, code }` in the standard 400 body (create:
  "Incident creation validation failed", update: "Incident update validation failed"); codes are
  `REQUIRED_FIELD`, `INVALID_TYPE`, `MAX_LENGTH`, `INVALID_ENUM_VALUE`, `INVALID_DATE`,
  `FUTURE_DATE`, `INVALID_DATE_ORDER`, `INVALID_HARM_CATEGORY`. Messages carry an `i18nKey` and are
  translated for the request (`{field} is required`, `{field} must be one of: {values}`, ...;
  `Servers/locales/*.json`).
- **Harm categories.** The server list is the page's (`HarmCategory`, also
  `Clients/src/domain/enums/aiIncidentManagement.enum.ts`), the values existing rows store. The
  older Article 73 list ("Health and Safety", ...) is gone. A row that stores a value outside the
  list stays editable: on update only the items being added are checked, and the drawer shows a
  stored off-list value as a checked box (labelled with the raw value) that the user can untick.
  Create accepts only the page's values. The server does not require a category; the drawer does
  (at least one), as it always has.
- **Where it runs.** Create: `createIncident` (`services/incidentManagement.service.ts`), before
  its transaction. Both the REST create and the Advisor's `agent_create_incident` use it, so both
  get the same validation, reference checks (including `project_id`), server-set approval fields,
  creation history and the incident response workflow for Very serious incidents (enqueued after
  commit). The Advisor names the requesting user as reporter (by user id while they are a member, else "User #<id>" as text; "AI Advisor" without one), passes the
  tool's `project_id` (an id outside the organization is refused with the reference error), never
  records approval (`canApprove: false`), and records history as the executing user, or as the
  system without one. The MCP server has no incident create tool. Update: `updateIncident` (`services/incidentManagement.service.ts`) against the locked row,
  so the REST update, the Advisor tools, the MCP `update_incident` tool and the Jira status sync all
  get it. The Jira import (`createIncidentForImport`) builds every required field from its
  configuration (use case, type, reporter, severity map, status map; both dates are the Jira
  issue's creation time; no harm categories), and its configuration is validated when saved, so it
  needs no defaults.
- **Creation history** records the saved row (defaults, parsed harm categories and the server's
  approval fields), not the request body, leaving out column defaults the caller did not send
  (false `archived` / `interim_report`, an empty harm category list). Dates are recorded as the
  stored `YYYY-MM-DD` (`GENERIC_FORMATTERS.date`).
- **Whitespace-only `status` / `approval_status` on create** count as omitted and take the
  defaults.

The description rule (5 to 32,767 characters, measured after trimming whitespace) is defined once per
side and the two must stay in sync:

- **Backend:** `INCIDENT_DESCRIPTION_MAX_LENGTH`, `validateDescription` and
  `isIncidentDescriptionChanged` in `Servers/utils/validations/incidentManagementValidation.utils.ts`.
  - The controller rejects up front: `validateCompleteIncidentCreation` checks `description`, and
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
  incident drawer. The drawer mirrors the server: use case, incident type, severity, both dates and
  reporter are required (marked with an asterisk); occurred and detected dates cannot be after the
  user's today; detected cannot be before occurred; model / system version is at most 255
  characters. In edit mode the drawer skips a rule when the field is unchanged from the loaded value
  (the date order when neither date changed), as the backend does. The drawer closes only after the save succeeds; while
  saving, Esc, Cancel, the close icon and the backdrop are ignored, and a save that settles after a
  newer draft was opened does not touch it. The drawer fills the form from `initialData` only when
  it opens or a different incident (`incidentId`) is loaded, and the page memoises `initialData` on
  the selected incident, so a page re-render (such as the failed-save toast) keeps the user's
  edits. On failure the toast shows server field messages only for allowlisted fields
  (`getApiValidationMessage` in `application/utils/apiErrorReason.ts`,
  `INCIDENT_SAVE_ERROR_FIELDS` on the incidents page): every field the server's incident rules
  check (description, use case, type, severity, status, approval status, dates, reporter, text
  fields, harm categories, booleans) with the server's translated message as sent, and reference
  fields (`project_id`, `model_inventory_id`, `assignee_id`) as a sentence naming the picker.
  Anything else falls back to the generic text.

The messages are identical on both sides: "Description is required.", "Description must be at least
5 characters." and "Description cannot exceed 32,767 characters." (translated in
`Clients/src/i18n/translations.ts` and `Servers/locales/*.json`).

### Business Rule Validation

```typescript
// Creation: date_detected on or after occurred_date (field errors above).
validateCompleteIncidentCreation(data) // → ValidationError[]

// Update: the field rules for changed fields plus the date order on the
// effective dates. Any status transition is allowed, including reopening.
validateIncidentUpdateBusinessRules(data, existing) // → ValidationError[]

// Side effect of a reopen (applied before saving and change tracking)
applyReopenApprovalReset(existing, update) // Approved → Pending on Closed → other
```

## CE Marking Integration

Incidents can be linked to CE marking records for regulatory compliance:

```
Incident ──── ce_marking_incidents ──── CE Marking
```

This supports EU AI Act Article 73 requirements for documenting serious incidents alongside conformity assessments.

`PUT /ce-marking/:projectId` (`controllers/ceMarking.ctrl.ts`) checks
`linkedIncidents` before writing anything: it must be a list of positive
integer ids (numbers or strings of digits, `parseLinkedIncidentIds`;
duplicates are dropped), and every id must be an incident of the caller's
organization. Anything else answers 400 ("Linked incidents must be a list of
incident ids." / "Some linked incidents do not exist in your organization.")
and nothing is written. `total_incidents` is then set to the number of linked
ids, not the caller's count. Until 2026-11 another organization's incident id
was stored and returned, and a non-numeric id answered 500.

Links to deleted incidents are removed by the foreign key
(`fk_ce_incidents_incident`, `ON DELETE CASCADE`). `GET` also reads the links
joined to `ai_incident_managements` in the same organization, so a link stored
before the validation existed (another organization's incident) is never
returned.

The "Link incidents" picker on the CE marking tab
(`getLinkableIncidents` in `Clients/src/application/repository/ceMarking.repository.ts`)
lists the use case's non-archived incidents, matched on `project_id` (the
incident's foreign key to the use case; `ai_project` is free text and older
rows hold a title there, so it is not used), plus every incident already
linked, so a link to an incident since archived or without a use case can
still be removed.

## Reports

The reports' incident management section (`collectIncidentManagement` in
`Servers/services/reporting/dataCollector.ts`) lists the organization's
incidents, or for a use case report the incidents linked to the use case by
`project_id` (until 2026-11 it compared the free-text `ai_project` with the
use case id, so that section was normally empty). It leaves archived incidents out and counts them in
`archivedIncidents`. When it is above 0 the PDF (`report-pdf.ejs`) and Word
(`docxGenerator.ts`) reports add a line under the table, "N archived
incidents are not included." (`archivedIncidentsNote` in
`services/reporting/noticeText.ts`; reports are English only).

## Automation Triggers

| Trigger | Event |
|---------|-------|
| `incident_added` | New incident created |
| `incident_updated` | Incident modified |
| `incident_deleted` | Incident deleted (after commit; never for a missing incident) |

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

## Critical incident response workflow

The `incident_response` workflow (Compliance Autopilot, issue 3813;
`Servers/services/workflows/definitions/incidentResponse.workflow.ts`) runs
when an incident reaches the critical tier: `isCriticalIncidentSeverity`,
which is `Very serious` (and a legacy `critical`).

### When it starts

`triggerIncidentResponse` (`Servers/services/workflows/triggers.ts`) is called
after commit, fire-and-forget, from:

- every create: `createIncident` (console, AI Advisor) and
  `createIncidentForImport` (Jira import), when the incident is created critical;
- every update, in the shared path `updateIncident`, when the update moves
  severity from below the critical tier into it (`isCriticalEscalation`). That
  covers the REST update, the Advisor tools, the MCP `update_incident` tool and
  the Jira status sync. Critical to critical, critical to lower, and lower to
  lower never start it.

**Once per incident.** The trigger takes a per-incident advisory lock
(`pg_advisory_xact_lock`) and, on that one transaction, looks for an
`ai_workflow_runs` row of type `incident_response` whose
`trigger_payload->>'incidentId'` is the incident, and creates the run (row and
audit entry, `createRun(..., transaction)`) only when there is none. Holding
the lock never waits on a second pooled connection. Every run counts except:

- a `failed` run, which never did the response;
- a `pending` run older than `INCIDENT_RESPONSE_STALE_PENDING_MINUTES` (10
  minutes): the process stopped between creating and running it (a live run
  leaves `pending` within milliseconds).

A `cancelled` run (an Admin rejected a step) and a `completed` one do count.
If starting the run throws, the trigger marks it `failed`, so it never blocks a
later escalation. Runs are not deleted (no retention rule covers
`ai_workflow_runs`), so the row itself is the record; there is no extra column.
An incident created critical gets no second run when it is later lowered and
raised again, and neither does one escalated twice. Concurrent writers (a
create racing an update, two updates) serialise on the lock and produce one
run.

### Steps

| Step | Kind | What it does |
|------|------|--------------|
| `classify_incident` | Read | Loads the incident by id in the run's organization (`loadIncidentForResponse`, `getIncidentByIdQuery`); when it is gone, archived or no longer critical the run **ends** here |
| `link_related_risks` | Read | Collects risks for context |
| `create_remediation_tasks` | Write, gated | Pauses on a workflow gate approval; once approved, creates one remediation task |
| `escalate_notify_admins` | Write, gated | Pauses on its own gate approval; once approved, notifies every Admin |

A step ends a run with the engine's `end` result (`StepResult` in
`services/workflows/types.ts`): the step is recorded as skipped with the
reason, no later step runs, no approval is requested, and the run is
`completed`. (A `skip` result only skips the one step.)

Each gated step opens an approval in the Admin queue (`requestGateApproval`)
and the run waits in `awaiting_approval`. Approving resumes the run at that
step, which then performs its write; rejecting cancels the run. One approval
authorises one write, so the escalation needs a second approval. Both writes
re-read the incident at approval time (the owner may have changed); if it was
deleted, archived or lowered below the critical tier since, the run ends
without the write.

**Remediation task** (`createRemediationTask`,
`Servers/services/workflows/incidentResponseActions.ts`): one task, High
priority, Open, titled "Respond to critical incident <reference>", with a
description that links to the incident. Assigned to the incident's owner
(`assignee_id`); when there is none, or the owner has left the organization, to
the user who created the incident (its creation history; data retention may
have pruned it for an old incident, in which case this candidate is skipped);
failing that, to the Admin who approved the step. Only current organization
members qualify; when none does, the task is created unassigned. The task's
creator (`creator_id`) is the approving user, else the assignee, else the
organization's first Admin, so it is not null. Task history records the
creation as a system change. The assignee gets the usual task-assigned notice.
Tasks cannot link to incidents (`task_entity_links` has no incident type), so
the link is in the description.

**Admin escalation** (`notifyAdminsOfCriticalIncident`): every organization
member with role Admin gets an in-app notice (`system` type, linked to
`/ai-incident-managements?incidentId=<id>`) and an email
(`incident-critical-escalation.mjml`; English body). Title, message, subject
and the severity label are in the Admin's language
(`buildCriticalIncidentEscalation`, `incidentSeverityLabel`). If any Admin
could not be reached, the step opens a new approval ("Retry admin
escalation ..."); approving it delivers only to the Admins still missing.

**Each write runs once per run.**

- Task: created on a transaction that locks the run's `ai_workflow_runs` row
  (`FOR NO KEY UPDATE`); in the same transaction the task is recorded on the
  run row at `trigger_payload._effects.remediation_task` (task id, assignee,
  how the assignee was chosen). The engine never rewrites `trigger_payload`,
  and no retention rule prunes the table, so a later execution for the same
  run finds it and returns that task instead of creating another.
- Admin notices: each Admin's notice row is the claim for that Admin
  (`metadata.workflow_action = incident_critical_escalation`,
  `metadata.workflow_run_id`, `metadata.sent`, `metadata.claimed_at`). Under
  the run lock, on one transaction, the step inserts an unsent row for each
  Admin without one and claims every unsent row not claimed in the last
  `ESCALATION_CLAIM_LEASE_MINUTES` (5). After commit it publishes the row in
  real time and sends the email, and only then sets `sent: true`. A failure
  leaves the row unsent and releases its claim, so the retry approval reaches
  that Admin at once, with the same in-app row. An Admin already `sent` is
  never notified again; a row claimed within the lease is being delivered by
  another execution and is left to it.

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
| `services/workflows/definitions/incidentResponse.workflow.ts` | Critical incident response workflow |
| `services/workflows/incidentResponseActions.ts` | Its incident lookup, remediation task and Admin escalation |
| `templates/incident-critical-escalation.mjml` | Admin escalation email |

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
- **Approval date is the UTC day.** The server records `approval_date` as
  today in UTC, so an approval late in the evening west of UTC shows the next
  day. Recording the approver's own day would need the client's date or time
  zone in the request.

## Related Documentation

- [Risk Management](./risk-management.md)
- [Use Cases](./use-cases.md)
- [Compliance Frameworks](./compliance-frameworks.md)
