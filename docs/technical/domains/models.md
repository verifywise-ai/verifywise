# Model Inventory Domain

## Overview

The Model Inventory domain provides a centralized registry for tracking AI/ML models across the organization. It supports model governance, approval workflows, risk management, MLFlow integration, and compliance documentation.

## Key Features

- Centralized AI/ML model registry
- Model governance with approval status
- Risk management per model
- MLFlow integration for syncing
- Security assessment documentation
- Change history and audit trails

## Database Schema

### Model Inventories Table

```
model_inventories
├── id (PK)
├── provider (e.g., "OpenAI", "Anthropic")
├── model (e.g., "GPT-4", "Claude")
├── version
├── approver
├── capabilities (TEXT)
├── security_assessment (BOOLEAN)
├── status (ENUM)
├── status_date
├── reference_link
├── biases
├── limitations
├── hosting_provider
├── security_assessment_data (JSONB)
├── is_demo
├── created_at
└── updated_at
```

### Model Risks Table

```
model_risks
├── id (PK)
├── risk_name
├── risk_category (ENUM)
├── risk_level (ENUM)
├── status (ENUM)
├── owner
├── target_date
├── description
├── mitigation_plan
├── impact
├── likelihood (likelihood label or NULL)
├── severity (severity label or NULL)
├── key_metrics
├── current_values
├── threshold
├── model_id (FK → model_inventories, ON DELETE SET NULL; nullable)
├── is_deleted
├── deleted_at
├── created_at
└── updated_at
```

### Model-Project-Framework Junction

```
model_inventories_projects_frameworks
├── model_inventory_id (PK, FK)
├── project_id (FK, nullable)
├── framework_id (FK, nullable)
├── created_at
└── updated_at
```

A row is either a direct use case link (`project_id` set, `framework_id` NULL)
or a framework link (`framework_id` set, `project_id` NULL). Framework links
carried an arbitrary use case until migration
`20261117061642-model-framework-links-without-use-case`, which cleared it,
deduped them and added the partial unique index
`mipf_model_framework_link_unique (model_inventory_id, framework_id) WHERE
framework_id IS NOT NULL`. Use case reads (by-project lists, reports, risk
link candidates, PMM, AI app links, advisor tools) count only
`framework_id IS NULL` rows.

### Organization checks on writes

`utils/modelReferences.utils.ts` holds the checks every model and model risk
write runs in its own transaction (REST, advisor, intake, Shadow AI, seeds go
through `createNewModelInventoryQuery` / `updateModelInventoryByIdQuery` /
`createNewModelRiskQuery` / `updateModelRiskByIdQuery`):

- the model approver and the model risk owner are members of the
  organization (on update, only a changed value is checked);
- linked use cases are the organization's projects, linked frameworks are in
  use by one of them, and a model risk's model is the organization's.

A failure is a `ValidationException` (400). Assignment notices are only sent
to members (`sendAssignmentNotification` joins `organization_members`).

## Enumerations

### Model Status

```typescript
enum ModelStatus {
  APPROVED = "Approved"
  RESTRICTED = "Restricted"
  PENDING = "Pending"
  BLOCKED = "Blocked"
  REJECTED = "Rejected"
  RETIRED = "Retired"
}
```

### Risk Category

```typescript
enum ModelRiskCategory {
  PERFORMANCE = "Performance"
  BIAS = "Bias & Fairness"
  SECURITY = "Security"
  DATA_QUALITY = "Data Quality"
  COMPLIANCE = "Compliance"
}
```

### Risk Level

```typescript
enum ModelRiskLevel {
  LOW = "Low"
  MEDIUM = "Medium"
  HIGH = "High"
  CRITICAL = "Critical"
}
```

Decision 10: the level comes from the shared likelihood x severity formula
(`utils/riskLevel.utils.ts`, the one project risks use since #5376; client
mirror `presentation/tools/riskCalculator.ts`). `likelihood` takes the
likelihood labels (Rare, Unlikely, Possible, Likely, Almost Certain) and
`severity` the severity labels (Negligible, Minor, Moderate, Major,
Catastrophic), stored in the labels' spelling. The four stored levels stay,
so reports, filters, MRM, PMM and risk links read `risk_level` as before.
`calculateModelRiskLevel` maps the formula's result:

| Formula | `risk_level` |
|---|---|
| No risk, Low risk | Low |
| Medium risk | Medium |
| High risk | High |
| Very high risk | Critical |

`services/modelRisk.service.ts` (`applyModelRiskFormula`) applies it on
every write path (REST legacy and v1, advisor tools, `agent_create_model_risk`,
intake approval, Shadow AI): when the save leaves the risk with both a
likelihood and a severity (sent, else stored: on update the merged row, so a
save that sends only the severity recomputes from the stored likelihood),
the server sets `risk_level` and ignores a sent one. With either missing the
sent or stored level is kept, so older rows and callers that send no
severity (Shadow AI, intake approval, which sends the suggestion's
likelihood and its reviewed level) keep working. A label is matched without
regard to case or surrounding spaces; "" or null clears it; anything else is
a 400 on every route ("Likelihood must be one of: ..." / "Severity must be
one of: ...", en/de/fr). The client form (`NewModelRisk`) has both selects,
shows the computed level read-only (`presentation/tools/modelRiskLevel.ts`,
same mapping) and sends no level once both are set; editing an older risk
without both still shows the level select.

Migration `20261120094040-model-risk-likelihood-severity-lists` adds
`severity` and normalizes `likelihood`: a label match gets the label's
spelling, a blank value becomes NULL, and anything else is appended to the
risk's `description` as "Previous likelihood: <value>" (after a blank line;
on its own when the description is empty) before `likelihood` is set to
NULL. `risk_level` is not recomputed (no row has a severity yet). `down`
drops `severity` and moves each "Previous likelihood" line back; a
re-spelled label keeps the new spelling.

Risk links: the `risk_links_flag_stale` trigger flags confirmed
`inherits_from` links to a model risk whenever its `risk_level` changes, so a
level the formula moves is flagged exactly like a picked one, and an update
that leaves the level where it was flags nothing.

### Risk Status

```typescript
enum ModelRiskStatus {
  OPEN = "Open"
  IN_PROGRESS = "In Progress"
  RESOLVED = "Resolved"
  ACCEPTED = "Accepted"
}
```

## API Endpoints

### Model Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/modelInventory/` | Get all models |
| GET | `/modelInventory/:id` | Get model by ID |
| GET | `/modelInventory/by-projectId/:id` | Models linked directly to a use case the caller can open (`requireProjectAccess`) |
| GET | `/modelInventory/by-frameworkId/:id` | Get by framework |
| POST | `/modelInventory/` | Create model; each linked use case needs the caller's access |
| PATCH | `/modelInventory/:id` | Update model; each use case linked or unlinked needs the caller's access |
| DELETE | `/modelInventory/:id` | Delete model; `?deleteRisks=true` archives its risks (see below) |
| POST | `/v1/model-inventories/` | Create model, strict validation (see Validation Rules) |
| PATCH | `/v1/model-inventories/:id` | Update model, strict validation |

`GET /modelInventory/:id` answers 404 for a model the organization does not
have (it was 204). On every `/:id` route of both routers, legacy and v1, an id
that is not a positive integer is a 400 (`validateModelIdParam`), not a
database error. `GET /:id/evaluations` keeps its own 400.

The inventory itself stays visible to the whole organization (decision 8);
what belongs to one use case needs access to that use case (Admin, owner or
member, `getProjectAccessQuery`). These are access fixes on the existing
routes, so there is no v1 copy. On update, use case links change by
difference: an added use case needs access (403 otherwise, before anything is
written), and a link to a use case the caller cannot open is kept when the
submitted list leaves it out (the form only lists use cases the caller can
see). Frameworks the model already links to are accepted unchanged on update;
only added frameworks must be in use by a use case of the organization.
A non-empty `frameworks` list replaces the model's framework links, so the
model form sends back linked frameworks its picker does not list (EU AI Act,
bundled frameworks, advisor links) along with the ones picked there.
Writes without a caller (AI Advisor, intake, seeds) skip the use case access
check. Model risks follow their model (org-wide). Dataset writes and
`POST /modelInventoryHistory/snapshot` need `model.edit`; an unknown snapshot
`parameter` is a 400. Evidence writes are checked in the controller (see
`evidence.md`): `model.edit` for evidence linked to models.

**Deleting a model never deletes its risks** (`deleteModelInventoryByIdQuery`
→ `releaseModelRisksOfModelQuery`, one transaction):

- **Keep risks** (default): the risks stay, with `model_id = NULL`. The model
  risks list and its export show them as "No model"; their risk links survive.
- **Delete risks too** (`?deleteRisks=true`): the live risks are archived the
  way `DELETE /modelRisks/:id` archives one (`is_deleted`, `deleted_at`,
  custom field values removed, a deletion in its history), in set-based
  statements, then lose the model like kept ones. Archived risks show under
  `filter=deleted`.
- Every risk that loses the model, kept or archived, gets an "Associated
  model" change (model name → `-`) in its history. The name comes from the
  `model_id` formatter in `config/changeHistory.config.ts` (provider and
  model, as an incident's affected model is named), the same one an edit of a
  risk's model uses, so both record names, not ids. Whether `model_id`
  changed is decided by id (`fieldComparators`), so a move between two models
  with the same name is still recorded.
- The single risk delete and the model release archive through one helper,
  `archiveModelRisksQuery` (by risk id or by model id).
- The model row is locked (`lockModelInventoryQuery`, `FOR UPDATE`) at the
  start of the transaction, before the 404 and MRM history checks, and again
  by `deleteModelInventoryByIdQuery` for callers that skip the controller (AI
  Advisor). A risk, validation or finding being added to the model waits for
  the delete: a risk can never end up kept when the user chose to delete the
  risks, and a validation added meanwhile still gets the friendly 409.
- Evidence drops the model id from `mapped_model_ids` (organization-scoped
  `array_remove`). `updated_at` is left alone: the evidence freshness sweep
  reads it as the evidence's last review.
- The screen asks Keep / Delete only when the model has live risks. It always
  asks the server (`GET /modelRisks?filter=active`), whatever the status
  filter, since the loaded list can be filtered or stale; if that request
  fails it asks Keep / Delete anyway. (This downloads every live risk for a
  yes/no answer; a per-model count would be a new contract on a legacy
  route.)
- The model risks table and its export label a risk with no model "No
  model" and one whose model is not in the loaded list "Unknown".

`model_risks.model_id` is `ON DELETE SET NULL` (migration
`20261117160827-model-risks-keep-on-model-delete`; it was `CASCADE`, which
deleted every risk of a model, archived ones and their links too, with no
history). A model deleted outside this path (demo data clean-up) leaves its
risks the same way. The AI Advisor's `agent_delete_model` deletes through
`deleteModelInventoryService` with "Delete risks too", as the acting user, so
its history names that user and an MRM-protected model is refused.

### Model Risks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/modelRisks/` | Get all risks |
| GET | `/modelRisks/:id` | Get risk by ID |
| POST | `/modelRisks/` | Create risk |
| PUT | `/modelRisks/:id` | Update risk (PATCH too) |
| DELETE | `/modelRisks/:id` | Soft delete |
| POST | `/v1/model-risks/` | Create risk, strict validation |
| PATCH | `/v1/model-risks/:id` | Update risk, strict validation |

Query parameter: `filter=active|deleted|all`

An archived (deleted) model risk is read-only: `GET /:id`, `PUT`/`PATCH` and
`DELETE` answer 404 for it, and the model risks table opens no form for it.
An update reads the risk `FOR UPDATE` inside its transaction and diffs the
values as written (`writtenValues`) against that row, so its history shows
what this update changed even when another write landed just before it.
History lists (`getEntityChangeHistory`, every entity) order by
`changed_at DESC, id DESC`: entries written in one transaction share a
`changed_at`.
Reports (`dataCollector.collectModelRisks`), the PMM snapshot and the model
deployment workflow (`risk_level` High or Critical counts as critical) count
live risks only; the organization report lists risks with no model as
"No model".

### Model History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/modelInventoryHistory/timeseries` | Trend data |
| GET | `/modelInventoryHistory/current-counts` | Current distribution |
| POST | `/modelInventoryHistory/snapshot` | Manual snapshot |
| GET | `/model-inventory-change-history/:id` | Change history |

## Create Model Request

```typescript
POST /modelInventory/
{
  provider: "OpenAI",
  model: "GPT-4",
  version: "1.0",
  approver: "john.doe@company.com",
  capabilities: ["text-generation", "summarization"],
  security_assessment: true,
  status: "Pending",
  status_date: "2025-01-17",
  reference_link: "https://docs.example.com",
  biases: "Training data biases",
  limitations: "Context window limits",
  hosting_provider: "Cloud",
  security_assessment_data: [],
  projects: [1, 2],
  frameworks: [3]
}
```

## Model-Framework Relationships

Models can be linked to projects and frameworks:

```
Model ─────┬───── Project A (direct)
           ├───── Framework (ISO 42001)
           └───── Framework (EU AI Act)
```

### Association Types

| Type | project_id | framework_id | Meaning |
|------|------------|--------------|---------|
| Use case | Set | NULL | Model used in the use case |
| Framework | NULL | Set | Model in the framework's scope |

## Model Risks

### Risk Management Flow

```
[Open] → [In Progress] → [Resolved]
              ↓
         [Accepted]
```

### Risk Properties

| Property | Description |
|----------|-------------|
| risk_name | Title of the risk |
| risk_category | Performance/Bias/Security/Data/Compliance |
| risk_level | Low/Medium/High/Critical, from likelihood and severity when both are set |
| likelihood | Rare/Unlikely/Possible/Likely/Almost Certain |
| severity | Negligible/Minor/Moderate/Major/Catastrophic |
| owner | Responsible person |
| target_date | Resolution deadline |
| mitigation_plan | Remediation steps |
| key_metrics | Metrics to track |
| threshold | Acceptable thresholds |

## MLFlow Integration

### Configuration

Stored in `extension_enablements.configuration` for the `mlflow` extension (secrets encrypted):

```
tracking_server_url   (required)
auth_method           (none / basic / token)
username, password    (basic auth; password encrypted)
api_token             (token auth; encrypted)
timeout               (seconds, 1–600, default 30; per-request abort; whole sync capped at 110s)
```

TLS certificates are always verified. Older configurations may still carry a `verify_ssl` key; it is ignored (the form field was removed in `20261007090000-remove-mlflow-verify-ssl-field.js`).

### Sync Process

Sync is manual. No scheduler runs it.

1. A user clicks **Sync** on the Model Inventory → MLFlow tab (`POST /api/extensions/mlflow/sync`; requires sign-in and the MLflow extension to be enabled)
2. Load the organization's MLflow extension config
3. Fetch experiments, then search runs in chunks (`/api/2.0/mlflow/runs/search`)
4. Transform runs into model records, de-duplicating on model name + lifecycle stage (latest training end wins)
5. Upsert into `mlflow_model_records` (`ON CONFLICT (organization_id, model_name, version)`)
6. Return `200` with the sync result (an empty server is a successful sync with zero models), or `502` with the failure reason in `error` (an HTTP error from experiments or runs search, a timeout, or a connection error with its cause code)

### Error Handling

- No automatic retries. A failed sync returns its error and the tab keeps showing the last synced records.

### MLFlow Model Record

```
mlflow_model_records
├── model_name
├── version
├── lifecycle_stage
├── run_id
├── description
├── source
├── tags (JSONB)
├── metrics (JSONB)
├── parameters (JSONB)
├── experiment_id
├── last_synced_at
└── ...
```

## Change History

### Field-Level Tracking

All model modifications tracked:

```typescript
{
  model_inventory_id: number,
  action: "created" | "updated" | "deleted",
  field_name: string,
  old_value: string,
  new_value: string,
  changed_by_user_id: number,
  changed_at: Date
}
```

### Snapshot History

Aggregated metrics over time:

```typescript
{
  parameter: "status",
  snapshot_data: {
    "Approved": 15,
    "Pending": 3,
    "Restricted": 2,
    "Blocked": 0
  },
  recorded_at: Date
}
```

Tracked parameters:
- `status` - Count by approval status
- `security_assessment` - Count with/without assessment

## Frontend Structure

### Main Page

**Location:** `pages/ModelInventory/`

**Tabs:**
- Models - Model inventory table
- Risks - Model risks table
- Evidence - Security assessment files
- MLFlow - Synced MLFlow models

### Key Components

| Component | Purpose |
|-----------|---------|
| `ModelInventoryTable` | Model list with CRUD |
| `ModelRisksTable` | Risk management |
| `MLFlowDataTable` | MLFlow models |
| `ModelInventorySummary` | Status cards |
| `ModelRiskSummary` | Risk distribution |
| `EvidenceHubTable` | Assessment files |
| `NewModelInventory` | Create/edit modal |

### Features

- Status-based summary cards
- Advanced filtering and search
- Export functionality
- Share links
- Analytics drawer

## Security Assessment

### Data Structure

```typescript
security_assessment_data: [
  {
    id: number,
    filename: string,
    size: number,
    mimetype: string,
    upload_date: Date,
    uploaded_by: number
  }
]
```

### Assessment Flag

`security_assessment: boolean` indicates if assessment was performed.

## Validation Rules

### v1 (strict)

`middleware/validators/modelInventory.validator.ts`, express-validator, 400
with `{ errors: [{ field, message, location }] }`, one message per field.

| | Model | Model risk |
|---|---|---|
| Required on create | `provider`, `model`, `version` (non-empty strings) | `risk_name` (non-empty), `risk_category`, `likelihood`, `severity` (lists), `owner` (positive integer), `target_date` (ISO 8601) |
| Defaulted by the server | `status` (Pending), `status_date` (now) | `status` (Open) |
| Checked when sent | `status`, `type` (enums; `type` "" or null = unclassified), `status_date` (ISO 8601), `approver` (positive integer; "", 0, null = none), `projects`, `frameworks` (integer arrays), `capabilities` (string or string array), `security_assessment`, `deleteProjects`, `deleteFrameworks` (booleans), text fields (strings) | `status`, `risk_level` (enums; the level is ignored when likelihood and severity are set), `likelihood`, `severity` (lists, on update too), `model_id` (positive integer; "" or null = none), text fields |

The required set is the create forms' (`NewModelInventory`, `NewModelRisk`)
minus the fields the server defaults, so the forms never send a body v1
refuses. On update nothing is required, and a required field that is sent
must still be valid (a non-empty `provider`, a real `target_date`). The model
forms create and update through v1.

### Legacy

The legacy routes accept what they accepted. A value the database cannot
store (an unknown status or type, a bad date: Postgres `22P02`, `22007`,
`22008`) answers 400 "A value in this request is not valid." instead of 500.
A model risk with only a name is created with `risk_category`, `risk_level`,
`target_date` and `owner` NULL (`createNewModelRiskQuery` stores unset
optional fields as NULL; an undefined named replacement used to fail the
insert).

### Status and approver shape (all routes)

Before the approval rule runs, the model create and update services
(`assertModelApprovalInput`) answer 400 with a field message for a `status`
that is sent but is not one of the model statuses (an array, an object, a
number, an unknown name). The `approver` is normalized once, at the start
of the service, with the house id parser (`toPositiveId`): null, "", 0 or "0"
is no approver (the legacy meaning of `approver || undefined`; the v1
validator refuses 0 and "0" first), a positive int32 (a number or digits,
leading zeros allowed on the legacy route, so "07" is 7) is that id, anything
else ("00", "-1", "1e3", 2147483648, an array) is a 400. The approval rule, the membership check, the
notice and the write then all read that number, and approvers are compared
as numbers. On v1 the approver, model risk owner and model id must already
be what `toPositiveId` accepts (no leading zeros). On create, "" and null still mean "not sent"
(Pending), as the legacy route always accepted; on update they are refused.
The rule itself fails closed: a status that is sent but not valid counts as a
change touching a decision. The v1 enum chains also require a string, since
`isIn` alone accepts `["Approved"]`.

### Demo flag

`is_demo` is never taken from a request body, on any route: the model and
model risk services drop it, and a create always stores `false`. Only the
demo seed creates demo rows.

## Approval rule

Who may decide a model's approval (decision 9), the rule risks got in #5418
applied to the model's `approver` and `status`
(`utils/modelApproval.utils.ts`, `assertModelApprovalAllowed`). "Decides"
means an Admin (`organization.admin`) or the model's **saved** approver, never
the approver the same save names.

- **Decisions** are Approved, Restricted, Blocked and Rejected. Pending and
  Retired (a lifecycle step) are not.
- **R1.** While the model has a saved approver, moving its status to or from
  a decision needs someone who decides. Sending the stored status back is not
  a change. Moving between Pending and Retired is free.
- **R2.** While the model has a saved approver, changing or clearing it needs
  someone who decides, whatever the status. This is stricter than R2 for
  risks, which lets any editor re-assign a Pending or Not required risk: a
  risk whose approver is cleared falls back to Not required (R4), so it can no
  longer be decided, but models have no "Not required" status to fall back to.
  Clearing the approver of a Pending model would let an editor decide it in a
  second save.
- **R2b.** A decided model with no saved approver (a legacy row, or one an
  editor decided before naming anyone) may be given an approver by a
  non-Admin only in a save that also moves it out of the decisions, to
  Pending or Retired. Otherwise the model would show a decision next to an
  approver who never made it (403). An Admin may name one any time. Moving it
  to Pending first and naming an approver in a later save is allowed too: it
  ends in Pending.
- **R3.** A non-Admin cannot name themself as the new approver. Keeping
  yourself as the saved approver is fine.
- In a save that names a new approver, only an Admin also moves the status to
  a decision. Leaving a decision in that save is allowed (with a saved
  approver, R2 already asks for the approver or an Admin).
- With no approver saved or named, any editor sets any status, as before.
  (Risks differ here: a risk with no approver is always Not required.)
- **Delete.** Deleting a model that has a saved approver needs that approver
  or an Admin, whatever its status (`assertModelDeleteAllowed`, read under the
  delete's row lock). Without this, an editor the rule refuses could delete
  the model and add it again, decided, with no approver. A model with no
  approver is deleted by anyone with `model.edit`, as before. It applies to
  `DELETE /api/modelInventory/:id` (v1 has no model delete) and the advisor's
  `agent_delete_model`, both through `deleteModelInventoryService`; the
  refusal is the same 403 message.

The rule never rewrites the status; a refused change is a 403
`{ "message": "Forbidden", "data": "Only the model's approver or an Admin can change its approval." }`
(R3 reuses the risk wording, "You can't name yourself as the approver. Ask an
Admin or pick someone else."), translated en/de/fr. It applies on the legacy
and v1 routes, as #5418 did for risks, in Shadow AI's start governance
(which names no approver), in the advisor's model tools and
`agent_register_model`, and in an intake approval that creates a model (as
the approving user: a non-Admin cannot approve a submission that names them
the model's approver, R3, 403 "This submission names you as the model's
approver. Another reviewer or an Admin must approve it."; an approver outside the organization is a
400). The update reads the model `FOR UPDATE` in its transaction and checks
against that row.

The controller asks for the caller's Admin role only when the body sends a
`status` or an `approver` (the only fields the rule reads it for); a delete
always asks.

The model form mirrors the rule (`Clients/src/application/utils/modelApproval.ts`):
statuses the user cannot set are listed but disabled, the approver select is
disabled for a user who does not decide on a model that has an approver, and
a non-Admin's own name cannot be picked. When a picked status becomes
unavailable (a non-Admin names a new approver while a decision is selected),
the form puts back the saved status, or Pending for a new model, instead of
letting the save fail with a 403.

## Write services

`services/modelInventory.service.ts` and `services/modelRisk.service.ts`
hold every model and model risk write with what goes with it. They take
plain arguments (organization, user, data, optional transaction; no req or
res), so the REST controllers, Shadow AI and the AI advisor share them. With
a caller's transaction, the notices run after it commits (`tx.afterCommit`);
without one the service opens and commits its own
(`utils/transaction.utils.ts` `inTransaction`, which logs a rollback that
fails through `logRollbackFailure` with the function, file, user and
organization, then throws the original error). The "model added / updated /
deleted" automations in the model queries are enqueued after commit too, so
a rolled-back write (a failed start governance, say) announces nothing.

Every model write goes through these services: the REST controllers, Shadow
AI's start governance, the advisor's model and model risk tools, the
advisor's approved `agent_register_model` and `agent_create_model_risk`
actions (as the requester, who needs `model.edit`; in the approval's
transaction, so the notices follow its commit), and an intake approval that
creates a model and its accepted model risks (as the approving user). Links
in the approver and owner notices use `utils/frontendUrl.utils.ts`
`frontendBaseUrl` (FRONTEND_URL, else the local frontend on port 5173).

| Function | What it carries |
|---|---|
| `createModelInventoryService` | approval rule, `is_demo` false, insert + "model added" automation (in the query), creation history, after commit: approver notice, **deployment step when created as Approved**, model risk candidate notice |
| `updateModelInventoryService` | row lock, approval rule, history diff against the locked row, after commit: deployment step when the status moves to Approved, approver notice for a new approver, candidate notice for added use cases. Takes the fields, or a function that builds them from the locked row (the advisor's `provider_model`) |
| `deleteModelInventoryService` | row lock, 404 (`NotFoundException`), approver or Admin for a model with an approver (403, `ModelApprovalForbiddenError`), MRM 409 (`ConflictException`), deletion history, risk release |
| `linkModelToUseCaseService` | link one use case (no-op if linked), candidate notice; use case links are not tracked history fields |
| `createModelRiskService` / `updateModelRiskService` / `deleteModelRiskService` | history, owner notices, candidate notice on create |

The deployment step (`runModelDeployedSideEffects`) is the "risk assessment
required" notice and the `model_deployment` workflow. Before, a model created
as Approved skipped it, and on update the previous status was read after the
row had been changed in place, so a move to Approved did not trigger it
either. Shadow AI's start governance creates its model and model risk through
the services, so the model now has a creation history row, runs the "model
added" automation and, when added as Approved, the deployment step.

### AI advisor

The advisor's model and model risk write tools run as the acting user (the
requester after an approval, else the chatting user, `actingUserId`) through
`advisor/functions/modelWriteScope.ts`: they need `model.edit`, as the
console's routes, and the user's role decides whether they are an Admin for
the approval rule. A refusal (approval rule, a reference outside the
organization, a missing row, an MRM-protected model) is the tool's failure
message `{ success: false, message }`, not a thrown error.

| Tool | Writes through |
|---|---|
| `agent_update_model` | `updateModelInventoryService` (status sets `status_date`; a name or provider change renames `provider_model`, built from the row the service locked) |
| `agent_retire_model` | `updateModelInventoryService` with status **Retired** (it used to set Blocked) |
| `agent_delete_model` | `deleteModelInventoryService`, risks archived; a model with an approver needs that approver or an Admin |
| `agent_link_model_to_project` | `linkModelToUseCaseService`, which checks write access to the use case, as the console's model save does (`model.edit` and use case access; no `useCase.edit`) |
| `agent_register_model` (approved action) | `createModelInventoryService`, and `linkModelToUseCaseService` for a model it reuses |
| `agent_create_model_risk` (approved action) | `createModelRiskService` |
| `agent_suggest_model_risk`, `agent_update_model_risk`, `agent_change_model_risk_status`, `agent_attach/detach_model_risk_to/from_model`, `agent_delete_model_risk` | the model risk service (history, owner notices) |

`agent_update_model_lifecycle_phase` was removed: a model has no lifecycle
phase field (the model-lifecycle extension keeps a checklist per phase), so it
could only refuse, after a human had confirmed it. Use `agent_update_model`
with `status`.

`agent_restore_model_risk` still writes directly (there is no restore in the
service). The model risk tools strip `_requesterId` before their strict
schema check, which refused every approved card before.

## Model risk owner notices

Decision 12. A model risk's owner gets the same in-app assignment notice (and
assignment email) as a use case risk owner: on create with an owner, and on
update when the owner changes to another user (an unchanged owner is not told
again; like use case risks, an assigner who picks themself is told too).
`notifyModelRiskOwner` sends it through `notifyUserAssigned` with role "Risk
Owner", entity "Model Risk", and the link
`/model-inventory/model-risks?modelRiskId=<id>`. It goes only to a member of
the organization. Model risks have no bulk actions, so there is no grouped
notice.

## Automation Triggers

| Trigger | Event |
|---------|-------|
| `model_added` | New model created |
| `model_updated` | Model modified |
| `model_deleted` | Model deleted |

Creating a model, attaching a model to a new project, and creating a model risk each notify (`model_risk_candidates`, in-app) the owners of project risks sharing those projects when the risks have model-risk link candidates they have never seen. No `risk_links` rows are written; the owner reviews candidates in the existing link picker.

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/modelInventory/modelInventory.model.ts` | Model |
| `domain.layer/models/modelRisk/modelRisk.model.ts` | Risk model |
| `utils/modelInventory.utils.ts` | Queries |
| `utils/modelRisk.utils.ts` | Risk queries |
| `controllers/modelInventory.ctrl.ts` | Controller |
| `routes/modelInventory.route.ts` | Routes |
| `routes/v1/modelInventories.route.ts`, `routes/v1/modelRisks.route.ts` | v1 writes |
| `middleware/validators/modelInventory.validator.ts` | v1 validation, id param |
| `services/modelInventory.service.ts`, `services/modelRisk.service.ts` | Write services |
| `utils/modelApproval.utils.ts` | Approval rule |
| `Servers/extensions/mlflow/` | MLFlow extension (routes, controller, sync service) |

### Frontend

| File | Purpose |
|------|---------|
| `pages/ModelInventory/index.tsx` | Main page |
| `pages/ModelInventory/modelInventoryTable.tsx` | Table |
| `pages/ModelInventory/ModelRisksTable.tsx` | Risks |
| `pages/ModelInventory/MLFlowDataTable.tsx` | MLFlow |
| `components/Modals/NewModelInventory/` | Form |

## Related Documentation

- [Risk Management](./risk-management.md)
- [Vendors](./vendors.md)
- [Use Cases](./use-cases.md)
- [Compliance Frameworks](./compliance-frameworks.md)
