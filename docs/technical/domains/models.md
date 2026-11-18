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
├── likelihood
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
history). A model deleted outside this path (demo data clean-up, AI Advisor)
leaves its risks the same way. The history of an AI Advisor delete is
recorded as the system's (no user).

### Model Risks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/modelRisks/` | Get all risks |
| GET | `/modelRisks/:id` | Get risk by ID |
| POST | `/modelRisks/` | Create risk |
| PUT | `/modelRisks/:id` | Update risk (PATCH too) |
| DELETE | `/modelRisks/:id` | Soft delete |

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
| risk_level | Low/Medium/High/Critical |
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

### Required Fields

- provider
- model
- version
- approver
- capabilities
- status_date
- reference_link
- biases
- limitations
- hosting_provider

### Risk Validation

- risk_name
- risk_category (valid enum)
- risk_level (valid enum)
- status (valid enum)
- owner
- target_date

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
