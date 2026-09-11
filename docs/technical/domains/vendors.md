# Vendors Domain

## Overview

A Vendor in VerifyWise is a third-party service provider or supplier that an organization uses. Vendors are tracked within projects to monitor risks, compliance, and operational dependencies. The system supports vendor assessment, risk tracking, and change history auditing.

## Database Schema

### Vendors Table

```
vendors
├── id (PK)
├── order_no (INTEGER, optional)
├── vendor_name
├── vendor_provides
├── assignee (FK → users)
├── website
├── vendor_contact_person
├── review_result
├── review_status (ENUM)
├── reviewer (FK → users)
├── review_date
│
├── data_sensitivity (ENUM)
├── business_criticality (ENUM)
├── past_issues (ENUM)
├── regulatory_exposure (ENUM)
├── risk_score (INTEGER)
│
├── is_demo
├── created_at
└── updated_at
```

### Vendor Projects Table

```
vendor_projects (junction table)
├── vendor_id (PK, FK → vendors)
├── project_id (PK, FK → projects)
└── is_demo
```

### Vendor Risks Table

```
vendor_risks
├── id (PK)
├── vendor_id (FK → vendors)
├── order_no
├── risk_description
├── impact_description
├── impact (ENUM)
├── likelihood (ENUM)
├── risk_severity (ENUM)
├── action_plan
├── action_owner (FK → users)
├── risk_level
├── is_demo
├── is_deleted
├── deleted_at
├── created_at
└── updated_at
```

## Enumerations

### Review Status

```typescript
enum ReviewStatus {
  NOT_STARTED = "Not started"
  IN_REVIEW = "In review"
  REVIEWED = "Reviewed"
  REQUIRES_FOLLOWUP = "Requires follow-up"
}
```

### Data Sensitivity

```typescript
enum DataSensitivity {
  NONE = "None"
  INTERNAL_ONLY = "Internal only"
  PII = "PII"
  FINANCIAL = "Financial data"
  HEALTH = "Health data (HIPAA)"
  MODEL_WEIGHTS = "Model weights/AI assets"
  OTHER = "Other sensitive data"
}
```

### Business Criticality

```typescript
enum BusinessCriticality {
  LOW = "Low (non-core)"
  MEDIUM = "Medium (replaceable)"
  HIGH = "High (critical)"
}
```

### Past Issues

```typescript
enum PastIssues {
  NONE = "None"
  MINOR = "Minor incident"
  MAJOR = "Major incident"
}
```

### Regulatory Exposure

```typescript
enum RegulatoryExposure {
  NONE = "None"
  GDPR = "GDPR"
  HIPAA = "HIPAA"
  SOC2 = "SOC 2"
  ISO27001 = "ISO 27001"
  EU_AI_ACT = "EU AI act"
  CCPA = "CCPA"
  OTHER = "Other"
}
```

### Risk Impact

```typescript
enum Impact {
  NEGLIGIBLE = "Negligible"
  MINOR = "Minor"
  MODERATE = "Moderate"
  MAJOR = "Major"
  CRITICAL = "Critical"
}
```

### Risk Likelihood

```typescript
enum Likelihood {
  RARE = "Rare"
  UNLIKELY = "Unlikely"
  POSSIBLE = "Possible"
  LIKELY = "Likely"
  ALMOST_CERTAIN = "Almost certain"
}
```

## API Endpoints

### Vendor Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vendors/` | Get all vendors |
| GET | `/vendors/:id` | Get vendor by ID |
| GET | `/vendors/project-id/:id` | Get vendors by project |
| GET | `/vendors/:id/riskSuggestions` | Read-only vendor risk suggestions derived from the questionnaire |
| POST | `/vendors/` | Create vendor |
| PATCH | `/vendors/:id` | Update vendor |
| DELETE | `/vendors/:id` | Delete vendor |

### Vendor Risk Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vendorRisks/all` | Get all risks |
| GET | `/vendorRisks/by-projid/:id` | Get by project |
| GET | `/vendorRisks/by-vendorid/:id` | Get by vendor |
| GET | `/vendorRisks/:id` | Get risk by ID |
| POST | `/vendorRisks/` | Create risk |
| PATCH | `/vendorRisks/:id` | Update risk |
| DELETE | `/vendorRisks/:id` | Soft delete risk |

### Change History Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vendor-change-history/:id` | Vendor changes |
| GET | `/vendor-risk-change-history/:id` | Risk changes |

## Create Vendor

### Request

```typescript
POST /vendors/
{
  vendor_name: string,
  vendor_provides: string,
  assignee: number,
  website: string,
  vendor_contact_person: string,
  review_result?: string,
  review_status?: string,
  reviewer?: number,
  review_date?: Date,
  data_sensitivity?: string,
  business_criticality?: string,
  past_issues?: string,
  regulatory_exposure?: string,
  risk_score?: number,
  projects: number[]
}
```

### Processing

1. Validate required fields
2. Create vendor record
3. Create vendor-project associations
4. Record creation in change history
5. Trigger `vendor_added` automation

## Vendor Scorecard

The scorecard assesses vendor risk across dimensions:

| Dimension | Purpose | Weight |
|-----------|---------|--------|
| Data Sensitivity | Type of data vendor accesses | High |
| Business Criticality | Impact if vendor fails | High |
| Past Issues | Historical incident severity | Medium |
| Regulatory Exposure | Compliance requirements | Medium |

### Risk Score

Calculated score (0-100) based on scorecard values. Higher score indicates higher risk.

## Vendor-Project Relationship

Vendors are linked to projects through a many-to-many relationship:

```
Vendor ─────┬───── Project A
            ├───── Project B
            └───── Project C
```

### Link Management

- Adding vendor to project creates junction record
- Removing vendor from project deletes junction record
- Deleting vendor cascades to junction table

## Vendor Risk Management

### Risk Lifecycle

```
[Created] → [Assessed] → [Mitigated]
                 ↓
           [Accepted]
```

### Risk Properties

| Property | Description |
|----------|-------------|
| risk_description | What is the risk |
| impact_description | How it affects organization |
| impact | Severity level |
| likelihood | Probability |
| risk_severity | Combined assessment |
| action_plan | Mitigation strategy |
| action_owner | Responsible user |

### Soft Delete

Vendor risks support soft delete:
- `is_deleted` flag set to true
- `deleted_at` timestamp recorded
- Risk hidden from default queries
- Can be restored or permanently deleted

## Vendor Risk Suggestions

`GET /vendors/:id/riskSuggestions` is a **read-only report**. For one vendor it reads the four
questionnaire columns (`data_sensitivity`, `business_criticality`, `past_issues`,
`regulatory_exposure`), derives the vendor risks those answers imply, and returns them with the
field and raw value that produced each (`reasons`) and a derived `risk_level`. It **writes
nothing** — no `vendorrisks` row, no migration, no status column. The project link is a property
of the vendor (`vendors_projects`), not of a risk row, so nothing is bound to a project here.

A response reports `questionnaire_complete` (all four columns non-null), `existing_risk_count`,
the `suggestions`, and any `suppressed` archetypes. An unassessed vendor answers
`questionnaire_complete: false` with zero suggestions, which is deliberately distinct from a
fully answered "no exposure" vendor (`true`, zero suggestions). Suggestions are ordered worst
`risk_level` first, then by archetype.

### Archetypes

| # | Trigger | `risk_severity` | `likelihood` |
|---|---------|-----------------|--------------|
| A `data_sensitivity` | Any value except `None` and `Internal only`. `Health data (e.g. HIPAA)` → `Catastrophic`; `Financial data` / `Personally identifiable information (PII)` / `Model weights or AI assets` → `Major`; `Other sensitive data` → `Moderate` | per value | `Possible` |
| B `business_criticality` | `High (critical to core services or products)` | `Major` | `Unlikely` |
| C `past_issues` | `Minor incident (e.g. small delay, minor bug)` → `Minor`; `Major incident (e.g. data breach, legal issue)` → `Major` | per value | `Likely` |
| D `regulatory_exposure` | Any value except `None` | `Moderate` | `Possible` |

`risk_level` is derived with `calculateRiskLevel` from
`utils/validations/vendorRiskValidation.utils.ts` and stored in the report with the ` Risk`
suffix used by `vendorrisks.risk_level` (for example `High Risk`). Suggestion text names the
answer through a short display label, not the raw enum value; `reasons` keeps the raw enum value.

### Suppression

Before returning, each archetype's `risk_description` is compared against the vendor's existing
active risks (`getVendorRisksByVendorIdQuery`, sliced to 200 in the service) using Jaccard
similarity over word tokens. Tokens are lowercased, stripped to `[a-z0-9 ]`, and any token of
length ≤ 2 is dropped. An archetype scoring **at or above
`VENDOR_SUGGESTION_SUPPRESS_THRESHOLD = 0.25`** is removed from `suggestions` and reported in
`suppressed` with the `matched_vendor_risk_id` — so a user can see which existing risk absorbed
it rather than watching it vanish.

## Change History

All vendor changes are tracked:

| Field | Description |
|-------|-------------|
| entity_type | "vendor" or "vendor_risk" |
| entity_id | Vendor or risk ID |
| action | created/updated/deleted |
| changed_by | User ID |
| field_name | Changed field |
| old_value | Previous value |
| new_value | New value |
| timestamp | When changed |

## Frontend Structure

### Main Page

**Location:** `pages/Vendors/`

**Features:**
- Vendor list with search/filter/group
- Vendor risks tab
- Add/edit vendor modal
- Add/edit risk modal
- Export functionality
- Page tour for guidance

### Components

| Component | Purpose |
|-----------|---------|
| `AddNewVendor` | Create/edit vendor modal |
| `AddNewRisk` | Create/edit risk modal |
| `RiskTable` | Display vendor risks |
| `TableWithPlaceholder` | Main vendor list |
| `GroupedTableView` | Grouped display |
| `FilterBy` | Dynamic filtering |

### Hooks

| Hook | Purpose |
|------|---------|
| `useVendors()` | Fetch vendors |
| `useDeleteVendor()` | Delete mutation |
| `useVendorRisks()` | Fetch risks |
| `useDeleteVendorRisk()` | Delete risk mutation |

## Automation Triggers

| Trigger | Event |
|---------|-------|
| `vendor_added` | New vendor created |
| `vendor_updated` | Vendor modified |
| `vendor_deleted` | Vendor deleted |

## Validation Rules

### Required Fields

- vendor_name
- vendor_provides
- assignee (valid user ID)
- website
- vendor_contact_person

### Demo Vendors

Vendors with `is_demo=true`:
- Cannot be modified
- Used for sample data
- Throws error on modification attempt

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/vendor/vendor.model.ts` | Vendor model |
| `domain.layer/models/vendorRisk/vendorRisk.model.ts` | Risk model |
| `domain.layer/models/vendorsProjects/vendorsProjects.model.ts` | Junction model |
| `utils/vendor.utils.ts` | Vendor queries |
| `utils/vendorRisk.utils.ts` | Risk queries |
| `controllers/vendor.ctrl.ts` | Controller |
| `routes/vendor.route.ts` | Routes |

### Frontend

| File | Purpose |
|------|---------|
| `pages/Vendors/index.tsx` | Main page |
| `components/AddNewVendor/` | Vendor form |
| `hooks/useVendors.ts` | Data hook |
| `repository/vendor.repository.ts` | API calls |

## Related Documentation

- [Risk Management](./risk-management.md)
- [Use Cases](./use-cases.md)
- [Models](./models.md)
