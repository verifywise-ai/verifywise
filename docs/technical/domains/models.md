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
├── model_id (FK → model_inventories)
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

At least one of `project_id` or `framework_id` must be present.

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
| GET | `/modelInventory/by-projectId/:id` | Get by project |
| GET | `/modelInventory/by-frameworkId/:id` | Get by framework |
| POST | `/modelInventory/` | Create model |
| PATCH | `/modelInventory/:id` | Update model |
| DELETE | `/modelInventory/:id` | Delete model |

### Model Risks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/modelRisks/` | Get all risks |
| GET | `/modelRisks/:id` | Get risk by ID |
| POST | `/modelRisks/` | Create risk |
| PUT | `/modelRisks/:id` | Update risk |
| DELETE | `/modelRisks/:id` | Soft delete |

Query parameter: `filter=active|deleted|all`

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
           ├───── Project A + Framework (ISO 42001)
           └───── Project B + Framework (EU AI Act)
```

### Association Types

| Type | project_id | framework_id | Meaning |
|------|------------|--------------|---------|
| Project only | Set | NULL | Model used in project |
| Full | Set | Set | Model for framework compliance |

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

```
mlflow_integrations
├── tracking_server_url
├── auth_method (none/basic/token)
├── username (encrypted)
├── password (encrypted)
├── api_token (encrypted)
├── verify_ssl
├── timeout
├── last_synced_at
├── last_sync_status
└── last_sync_message
```

### Sync Process

1. Hourly sync via BullMQ (cron: `0 * * * *`)
2. Check organization MLFlow config
3. Verify last test was successful
4. Fetch models from tracking server
5. Update local MLFlow model records
6. Record sync status

### Retry Strategy

- Max 3 retries
- Exponential backoff (1s, 2s, 4s)
- Soft error handling per organization

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
- Group by project/framework/status
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
| `services/integrations/mlflow/` | MLFlow sync |

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
