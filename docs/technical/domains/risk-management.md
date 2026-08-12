# Risk Management Domain

**Last Updated:** 2026-08-12

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
├── likelihood (ENUM)
├── severity (ENUM)
├── risk_level_autocalculated (ENUM)
├── risk_severity (ENUM)
├── current_risk_level (ENUM)
│
├── mitigation_status (ENUM)
├── mitigation_plan
├── implementation_strategy
├── mitigation_evidence_document
├── likelihood_mitigation (ENUM)
├── final_risk_level
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
| ≤4 | Very low risk |
| 5-8 | Low risk |
| 9-12 | Medium risk |
| 13-16 | High risk |
| ≥17 | Very high risk |

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

### Risk links (risk inheritance)

Risks are linked to each other in `verifywise.risk_links` — one row per pair,
stored canonically (smaller risk id first) for undirected `related_to` edges.
An edge carries a `score`, a structured `reasons` array, a `source`
(`derived` | `user` | `agent`) and a `status` (`suggested` | `confirmed` |
`dismissed`). Source and status are orthogonal: a derived suggestion can be
confirmed, and a user-created link can be dismissed.

**Scoring.** `Servers/services/riskLinks/` holds a `LinkSignalProvider`
interface and, today, one provider: `field_overlap` (tier 0). It scores shared
category 3, shared control mapping 2, shared assessment mapping 2, same
lifecycle phase 2, shared project 1. `"0"` in a control or assessment mapping
means "nothing mapped" and never matches — the risk form has no picker for
those fields and always sends `0`. Providers are merged by summing scores and
concatenating reasons; a provider that throws is logged and skipped, and if
*every* provider fails the recompute writes and deletes nothing.

**Persistence.** A pair at or above score 3 becomes a `derived` / `suggested`
edge, up to 20 new edges per recompute, best score first with ties broken by
risk id. The cap gates creation only. Pruning is driven by the score alone —
an edge is deleted only when it is `derived` + `suggested` *and* its score fell
below 3 — because scores are symmetric between two risks but cap membership is
not, and pruning on the cap would make the two endpoints delete and recreate
the same edge on alternating saves. `confirmed` edges are never pruned, and a
`dismissed` edge stays dismissed however high its score climbs.

**When it runs.** A BullMQ job (`risk_link_recompute` on the shared
`automation-actions` queue) recomputes one risk at a time, enqueued after a
risk is created, after it is updated, and after a bulk `set_category`.
Deleting a risk does *not* trigger a recompute: `risks` is soft-deleted, edges
survive, and the read path filters soft-deleted risks on both endpoints.
`POST /api/riskLinks/recompute` (Admin) fans out one job per active risk and is
required at least once per org, since the table starts empty.

The job carries `jobId: risk-link:<org>:<risk>` so a burst of saves collapses
into one run, plus `removeOnComplete` and `removeOnFail` — a retained job of
either kind would make BullMQ ignore every later `add` for that risk. It also
retries three times with exponential backoff. Two recomputes share at most the
single edge between them and cannot deadlock, but three risks forming a
triangle can, because the top-N cap makes an edge a keeper for one endpoint and
an ordinary incident row for the other. The backfill puts the whole org on a
worker running ten jobs at a time, so Postgres aborting one side with 40P01 is
an ordinary event; the retry is what keeps that risk from silently ending up
with no links.

**Endpoints.**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/riskLinks/:riskId` | any authenticated | Links in either direction. Defaults to `suggested` + `confirmed`; `?status=dismissed` for the dismissed list. |
| PATCH | `/api/riskLinks/:id` | any authenticated | `{ status }`. Allowed: `suggested→confirmed`, `suggested→dismissed`, `confirmed→dismissed`, `dismissed→confirmed`, and `dismissed→suggested` as an explicit undo that clears the decision fields. Anything else is a 400. |
| POST | `/api/riskLinks/recompute` | Admin | Backfill the whole org. |

There is no delete endpoint: a hard delete would be recreated by the next
recompute, so dismissal is the durable way to remove a link.

> The older client-side summary in
> `Clients/src/application/tools/relatedRisks.ts` still renders after a risk is
> saved. It computes the same signals in the browser and stores nothing; it is
> superseded by the endpoints above and is removed when the linked-risks UI
> lands.

Design: `docs/superpowers/specs/2026-08-11-risk-inheritance-design.md`

## Related Documentation

- [Use Cases](./use-cases.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Vendors](./vendors.md)
- [Models](./models.md)
