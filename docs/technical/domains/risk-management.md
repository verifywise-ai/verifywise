# Risk Management Domain

## Overview

VerifyWise implements comprehensive risk management across three risk types: Project Risks, Vendor Risks, and Model Risks. The system supports risk assessment, lifecycle tracking, mitigation planning, and historical trend analysis aligned with EU AI Act and ISO frameworks.

## Risk Types

### Project Risks

Primary risk type for organizational/project-level risks.

- Table: `project_risks`
- Most comprehensive metadata
- Links to compliance frameworks and controls
- Supports full mitigation workflow

### Vendor Risks

Risks associated with third-party vendors.

- Table: `vendor_risks`
- Linked to vendor profiles
- Tracks vendor-specific risk exposure
- Simpler structure than project risks

### Model Risks

AI/ML model-specific risks.

- Table: `model_risks`
- Categories: Performance, Bias & Fairness, Security, Data Quality, Compliance
- Tracks metrics and thresholds
- Model-specific remediation

## Database Schema

### Project Risks Table

```
project_risks
├── id (PK)
├── risk_name
├── risk_owner (FK → users)
├── risk_description
├── risk_category (ARRAY)
├── ai_lifecycle_phase (ENUM)
├── impact
├── review_notes
├── assessment_mapping
├── controls_mapping
├── date_of_assessment
│
├── likelihood (ENUM)                 # current risk
├── severity (ENUM)                   # current risk
├── risk_level_autocalculated (ENUM)  # derived from likelihood + severity
├── risk_severity (ENUM)              # RESIDUAL severity (mitigation)
├── current_risk_level (ENUM)
│
├── mitigation_status (ENUM)
├── mitigation_plan
├── implementation_strategy
├── mitigation_evidence_document
├── likelihood_mitigation (ENUM)      # residual likelihood (mitigation)
├── final_risk_level                  # derived from the two residual fields
│
├── risk_approval (FK → users)
├── approval_status
├── deadline
│
├── created_at
├── updated_at
├── is_deleted
├── deleted_at
└── is_demo
```

### Vendor Risks Table

```
vendor_risks
├── id (PK)
├── vendor_id (FK → vendors)
├── action_owner (FK → users)
├── risk_description
├── impact_description
├── impact (ENUM)
├── likelihood (ENUM)
├── risk_severity (ENUM)
├── risk_level
├── action_plan
├── order_no
├── is_demo
├── created_at
├── updated_at
├── is_deleted
└── deleted_at
```

### Model Risks Table

```
model_risks
├── id (PK)
├── risk_name
├── owner
├── model_id
├── risk_category (ENUM)
├── risk_level (ENUM)
├── status (ENUM)
├── description
├── impact
├── likelihood
├── mitigation_plan
├── key_metrics
├── current_values
├── threshold
├── target_date
├── created_at
├── updated_at
├── is_deleted
└── deleted_at
```

## Enumerations

### Likelihood

```typescript
enum Likelihood {
  RARE = "Rare"
  UNLIKELY = "Unlikely"
  POSSIBLE = "Possible"
  LIKELY = "Likely"
  ALMOST_CERTAIN = "Almost certain"
}
```

### Severity

```typescript
enum Severity {
  NEGLIGIBLE = "Negligible"
  MINOR = "Minor"
  MODERATE = "Moderate"
  MAJOR = "Major"
  CATASTROPHIC = "Catastrophic"
}
```

### Risk Level (Auto-calculated)

```typescript
enum RiskLevel {
  NO_RISK = "No risk"
  VERY_LOW = "Very low risk"
  LOW = "Low risk"
  MEDIUM = "Medium risk"
  HIGH = "High risk"
  VERY_HIGH = "Very high risk"
}
```

### Mitigation Status

```typescript
enum MitigationStatus {
  NOT_STARTED = "Not Started"
  IN_PROGRESS = "In Progress"
  COMPLETED = "Completed"
  ON_HOLD = "On Hold"
  DEFERRED = "Deferred"
  CANCELED = "Canceled"
  REQUIRES_REVIEW = "Requires review"
}
```

### AI Lifecycle Phase

```typescript
enum AiLifecyclePhase {
  PROBLEM_DEFINITION = "Problem definition & planning"
  DATA_COLLECTION = "Data collection & processing"
  MODEL_DEVELOPMENT = "Model development & training"
  MODEL_VALIDATION = "Model validation & testing"
  DEPLOYMENT = "Deployment & integration"
  MONITORING = "Monitoring & maintenance"
  DECOMMISSIONING = "Decommissioning & retirement"
}
```

### Model Risk Category

```typescript
enum ModelRiskCategory {
  PERFORMANCE = "Performance"
  BIAS = "Bias & Fairness"
  SECURITY = "Security"
  DATA_QUALITY = "Data Quality"
  COMPLIANCE = "Compliance"
}
```

### Model Risk Level

```typescript
enum ModelRiskLevel {
  LOW = "Low"
  MEDIUM = "Medium"
  HIGH = "High"
  CRITICAL = "Critical"
}
```

## Risk Calculation

### Formula

```
Risk Score = (Likelihood Value × 1) + (Severity Value × 3)
```

Severity is weighted 3x heavier than likelihood.

### Value Mapping

| Level | Likelihood Value | Severity Value |
|-------|------------------|----------------|
| 1 (Lowest) | 1 | 1 |
| 2 | 2 | 2 |
| 3 | 3 | 3 |
| 4 | 4 | 4 |
| 5 (Highest) | 5 | 5 |

### Risk Level Thresholds

| Score Range | Risk Level |
|-------------|------------|
| ≤4 | No risk |
| 5-8 | Low risk |
| 9-12 | Medium risk |
| 13-16 | High risk |
| ≥17 | Very high risk |

`RiskCalculator` (`Clients/src/presentation/tools/riskCalculator.ts`) is the only
implementation of this formula. Views that show a score — including the risk heat
map on the use case's **Use case risks** tab — must call `getRiskLevel` /
`getRiskScore` rather than re-deriving it, or they will report a different level
than the summary cards and the risks table for the same risk.

### Example Calculation

```
Likelihood: Likely (4)
Severity: Major (4)

Score = (4 × 1) + (4 × 3) = 4 + 12 = 16
Result: High risk
```

## Risk-Control Linking

### Relationship Structure

Risks can be linked to multiple framework controls through junction tables:

```
Risk
├── projects_risks ────────────────── Projects
├── frameworks_risks ──────────────── Frameworks
├── controls_eu__risks ────────────── EU AI Act Controls
├── subclauses_iso__risks ─────────── ISO 42001 Subclauses
├── annexcategories_iso__risks ────── ISO 42001 Annex Categories
├── subclauses_iso27001__risks ────── ISO 27001 Subclauses
├── annexcontrols_iso27001__risks ── ISO 27001 Annex Controls
└── answers_eu__risks ─────────────── Assessment Answers
```

### Link Data Structure

Each control link stores:

```typescript
{
  id: number,           // Control ID
  meta_id: number,      // Control metadata ID
  sup_id: string,       // Clause/section number
  title: string,        // Control title
  sub_id: number,       // Subclause order
  parent_id: number,    // Clause parent ID
  project_id: number    // Associated project
}
```

## API Endpoints

### Project Risks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projectRisks/` | Get all project risks |
| GET | `/projectRisks/:id` | Get risk by ID |
| GET | `/projectRisks/by-projid/:id` | Get by project |
| GET | `/projectRisks/by-frameworkid/:id` | Get by framework |
| POST | `/projectRisks/` | Create risk |
| PUT | `/projectRisks/:id` | Update risk |
| DELETE | `/projectRisks/:id` | Delete risk (soft) |

### Vendor Risks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vendorRisks/` | Get by project |
| GET | `/vendorRisks/:id` | Get by ID |
| GET | `/vendorRisks/by-projid/:id` | Get by project |
| GET | `/vendorRisks/by-vendorid/:id` | Get by vendor |
| GET | `/vendorRisks/all` | Get all |
| POST | `/vendorRisks/` | Create |
| PATCH | `/vendorRisks/:id` | Update |
| DELETE | `/vendorRisks/:id` | Delete |

### Model Risks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/modelRisks/` | Get all |
| GET | `/modelRisks/:id` | Get by ID |
| POST | `/modelRisks/` | Create |
| PUT | `/modelRisks/:id` | Update |
| DELETE | `/modelRisks/:id` | Delete |

### Risk History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/riskHistory/timeseries` | Get trend data |
| GET | `/riskHistory/current-counts` | Get distribution |
| POST | `/riskHistory/snapshot` | Create snapshot |

## Risk History Tracking

### Purpose

Track how risk distribution changes over time across severity, likelihood, and mitigation status.

### Snapshot Structure

```typescript
{
  parameter: "severity",
  snapshot_data: {
    "Negligible": 2,
    "Minor": 5,
    "Moderate": 8,
    "Major": 3,
    "Catastrophic": 1
  },
  recorded_at: "2026-01-17T10:30:00Z",
  triggered_by_user_id: 42,
  change_description: "Quarterly review"
}
```

### Tracked Parameters

- `severity` - Distribution of severity levels
- `likelihood` - Distribution of likelihood levels
- `mitigation_status` - Distribution of mitigation statuses
- `risk_level` - Distribution of calculated risk levels

### Timeseries Query Parameters

```
GET /riskHistory/timeseries?parameter=severity&timeframe=1month&intervalHours=24
```

| Parameter | Options |
|-----------|---------|
| timeframe | 7days, 15days, 1month, 3months, 6months, 1year |
| startDate | ISO date string |
| endDate | ISO date string |
| intervalHours | Number (default: 24) |

## Create Risk Request

```typescript
POST /projectRisks/
{
  risk_name: "Data Quality Issues",
  risk_owner: 5,
  ai_lifecycle_phase: "Data collection & processing",
  risk_description: "Insufficient data validation...",
  risk_category: ["Data Quality", "Security"],
  impact: "Model accuracy degradation",
  likelihood: "Likely",
  severity: "Major",
  assessment_mapping: "Q1.2",
  controls_mapping: "AC-1",
  mitigation_plan: "Implement validation pipeline",
  mitigation_status: "Not Started",
  deadline: "2026-02-28",
  projects: [1, 2],
  frameworks: [5]
}
```

## Validation Rules

### Field Limits

| Field | Max Length |
|-------|------------|
| risk_name | 255 chars |
| risk_description | 1000 chars |
| impact | 500 chars |
| assessment_mapping | 500 chars |
| controls_mapping | 500 chars |
| review_notes | 1000 chars |
| mitigation_plan | 1000 chars |
| implementation_strategy | 1000 chars |
| mitigation_evidence_document | 500 chars |

### Required Fields

- `risk_name` - Non-empty string
- `risk_owner` - Valid user ID
- `risk_description` - Non-empty string

## Frontend Structure

### Main Pages

| Page | Location |
|------|----------|
| Risk Management Dashboard | `pages/RiskManagement/` |
| Project Risks Tab | `pages/ProjectView/RisksView/` |
| Framework Risks | `pages/Framework/FrameworkRisks/` |

### Key Components

| Component | Purpose |
|-----------|---------|
| `AddNewRiskForm` | Create/edit risk modal |
| `VWProjectRisksTable` | Risks data table |
| `RiskAnalysisModal` | Risk detail view |
| `RiskHistoryChart` | Timeseries chart |
| `RiskDonutWithLegend` | Distribution chart |
| `RiskLevel` | Severity indicator |
| `AnalyticsDrawer` | Risk analytics |
| `HistorySidebar` | Change history |

### Dashboard Features

- Risk list with filtering and grouping
- Search functionality
- Table view with sorting/pagination
- Bulk actions (multi-select)
- Export functionality
- Group-by (Project, Framework)
- Filter-by (name, severity, status)
- Analytics drawer
- History sidebar

## Change History

### Tracked Events

- Risk creation with initial values
- Field modifications (old → new)
- Status changes
- Deletion events

### Functions

```typescript
recordProjectRiskCreation(riskId, userId, tenant)
trackProjectRiskChanges(riskId, oldRisk, newRisk, userId, tenant)
recordMultipleFieldChanges(changes, tenant)
recordProjectRiskDeletion(riskId, userId, tenant)
```

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/risks/risk.model.ts` | Project risk model |
| `domain.layer/models/vendorRisk/vendorRisk.model.ts` | Vendor risk model |
| `domain.layer/models/modelRisk/modelRisk.model.ts` | Model risk model |
| `domain.layer/models/riskHistory/riskHistory.model.ts` | History model |
| `utils/risk.utils.ts` | Risk queries |
| `utils/history/riskHistory.utils.ts` | History queries |
| `controllers/projectRisk.ctrl.ts` | Risk controller |
| `routes/risks.route.ts` | Route definitions |

### Frontend

| File | Purpose |
|------|---------|
| `pages/RiskManagement/index.tsx` | Main dashboard |
| `pages/ProjectView/RisksView/` | Project risks tab |
| `components/AddNewRiskForm/` | Risk form modal |
| `tools/riskCalculator.ts` | Risk calculation |
| `application/repository/risk.repository.ts` | API calls |

## Related Documentation

- [Use Cases](./use-cases.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Vendors](./vendors.md)
- [Models](./models.md)
