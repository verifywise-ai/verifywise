# Risk Management Domain

**Last Updated:** 2026-10-06

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

## Duplicate Detection

`GET /api/riskLinks/duplicates` returns pairs of risks that look like the same
risk entered twice, ranked by text similarity, with the reasons attached. A
human reads the report and cleans up by hand.

**Similarity rule.** Each risk becomes a token set from `risk_name + " " +
risk_description` (lowercase, strip everything but `[a-z0-9 ]`, split on
whitespace, drop tokens of length 2 or fewer). Only risks sharing at least one
`risk_category` value are compared; pairs score Jaccard similarity and are
reported at or above `DUPLICATE_SIMILARITY_THRESHOLD = 0.25`, sorted by
similarity descending. Each reported pair also carries `also_shares` context
(shared categories, shared project, same lifecycle phase), which never decides
inclusion.

**It writes nothing.** No migration, no new `relation_type`, no `risk_links`
rows — exact match finds zero pairs on real data and the link scorer has no
text signal, so neither mechanism was reused.

## Control Coverage Gaps

`GET /api/riskLinks/coverage` answers "which risk is not mitigated by any
control?" Every active risk lands in exactly one state:

| State | Rule | Meaning |
|---|---|---|
| `covered` | ≥ 1 control-side link | Fine. Counted, never listed. |
| `gap` | 0 control-side links, but ≥ 1 of its projects has a framework attached | **The finding.** Someone can fix this today. |
| `no_framework` | 0 control-side links and no project with a framework | Not a finding. Nothing to map to yet. |

`no_framework` stays separate from `gap` because a project with no framework
attached has no controls at all — reporting its risks as uncontrolled would be
a false audit finding (on the dev org, the naive two-state version reports all
37 risks uncontrolled for exactly this reason).

An assessment answer is not a control: `assessment_link_count` rides along in
each listed risk for context ("0 controls but 3 assessment answers" is a
different conversation from "0 of everything") and never affects the state. A
risk linked only via `answers_eu__risks` is still a `gap`.

**It writes nothing.** No migration, no `risk_links` rows, no cache rows.

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

### Value-chain inheritance

Value-chain inheritance lets a project risk inherit from a risk owned by a
different risk domain. The supported legs are `vendor risk → project risk` and
`model risk → project risk`. A `vendor risk → model risk` leg is not supported:
`model_inventories` has no `vendor_id`, so there is no persisted relationship on
which to base that direction. Vendor and model risks are parents only; project
risks remain the children.

The existing `risk_links` row stores the project child in `source_risk_id`. The
parent is stored in exactly one of the nullable typed target columns:
`target_risk_id`, `target_model_risk_id`, or `target_vendor_risk_id`. The child
column and its one-parent index are intentionally unchanged, so the same
one-parent guarantee applies across all parent entity types.

Cross-entity links use `inherits_from` only. A manual `POST /api/riskLinks`
request must provide exactly one of `targetRiskId`, `targetModelRiskId`, or
`targetVendorRiskId`; these fields are mutually exclusive. Cross-entity links
are created either as confirmed user links or as agent suggestions and appear
in the project risk's Parent risk
group with a label identifying the model or vendor parent.

The vendor side has its own panel: the vendor risk modal's **Linked risks**
tab lists the project risks that inherit from it
(`GET /api/riskLinks/vendor-risks/:vendorRiskId`) and links new children through
the same `POST /api/riskLinks`. That read endpoint never derives direction by
comparing ids. `risks` and `vendorrisks` have separate sequences, so a child can
carry the vendor risk's own id; every link on that list is `incoming` by
construction.

`POST /api/riskLinks/vendor-risks/:vendorRiskId/suggest-hierarchy` (Admin) runs
the direction pass on a subset: only the connected components of related risks
that contain a project risk in the vendor's use cases
(`getVendorRiskChildCandidatesQuery`). The LLM-key check, the component size
cap and the 202 `{ enqueued, skipped }` response are the same as the org-wide
pass.

Three read-only vendor reports sit beside F7 and F8, in
`services/riskLinks/vendorReports.ts`: `GET /api/riskLinks/vendor-exposure`
(confirmed children per vendor risk and per vendor, with use cases),
`/vendor-duplicates` (F7's scorer, blocked by vendor) and `/vendor-coverage`
(F8's three states over `frameworks_vendorrisks` and the frameworks on the
vendor's use cases). The Vendors page shows them; see
[Vendors](./vendors.md#vendor-risk-insights).

The map (`GET /api/riskLinks`) carries `vendor: { id, name }` on vendor risk
nodes, `null` elsewhere. The page uses it for a vendor filter, kept in the URL
as `?vendor=ID`: it shows that vendor's risks, their `inherits_from` children,
the vendor risks related to them and the links among those
(`pages/RiskInheritanceGraph/vendorFilter.ts`).

### Vendor risk pairs

Two vendor risks can be related (`related_to`), never parent and child. Such a
row has no project risk at all, so `source_risk_id` is nullable and a second
source column, `source_vendor_risk_id` (FK `vendorrisks`, `ON DELETE CASCADE`),
holds the smaller vendor risk id, with the larger in `target_vendor_risk_id`
(migration `20261002152922-risk-links-vendor-related.js`). The constraints:

| Constraint | Rule |
|------------|------|
| `risk_links_one_source` | Exactly one of `source_risk_id`, `source_vendor_risk_id` |
| `risk_links_vendor_pair` | A vendor source is only `related_to`, has a vendor target, and `source_vendor_risk_id < target_vendor_risk_id` |
| `risk_links_cross_entity_inherits` | A non-risk target is `inherits_from`, unless the source is a vendor risk |
| `risk_links_unique_vendor_pair` | Unique `(source_vendor_risk_id, target_vendor_risk_id, relation_type)` where the vendor source is set |

`inherits_from`, the one-parent index and the stale-parent trigger only ever
see a project risk source, so none of them changed. Every project risk read
joins `risks` on the source or filters `inherits_from`, so vendor pairs never
appear there, even when a project risk shares a vendor risk's id. The readers
that do include them are the vendor panel, the map (an edge keyed
`vendor_risk:{id}` on both ends; `RiskGraphEdgeRow` carries
`source_entity_type`) and dismissal analytics (which names a vendor source by
its description). The vendor exposure report reads `inherits_from` only.

Scoring and recompute live in `services/riskLinks/vendorRelated.ts`, with their
own `vendor_risk_link_recompute` job, separate from the project risk
providers: similar wording is required, then same vendor, shared framework and
a use case shared across vendors each add 1. The threshold and the per-risk
cap are the project ones. `POST /api/riskLinks/vendor-risks/recompute` (Admin)
enqueues every active vendor risk as a backfill. See
[Vendors](./vendors.md#related-vendor-risks) for the signals, triggers and the
manual `POST /api/riskLinks` payload.

Since C6 the direction pass (`POST /api/riskLinks/suggest-hierarchy`) also
proposes vendor and model risks as parents, when they share a project with a
risk in the cluster. They arrive as `suggested` / `agent` rows and are
confirmed or dismissed like any other suggestion. They carry the
`cross_entity_hierarchy` reason signal rather than `hierarchy`, which is how
query 4b of `risk-link-precision.sql` reports them apart from project-risk
suggestions.

**Scoring.** `Servers/services/riskLinks/` holds a `LinkSignalProvider`
interface and two providers: `field_overlap` (tier 0) and `structural_graph`
(tier 1). Tier 0 scores shared category 3, shared control mapping 2, shared
assessment mapping 2, same lifecycle phase 2, shared project 1. `"0"` in a
control or assessment mapping means "nothing mapped" and never matches — the
risk form has no picker for those fields and always sends `0`. Providers are
merged by summing scores and concatenating reasons; any provider that throws
aborts the recompute, so nothing is written or deleted and the risk keeps its
existing edges.

### Tier 1 — shared framework elements

Two risks attached to the same framework element score
`min(4, Σ 2 / log2(1 + degree))`, where `degree` is how many active risks in the
organization are attached to that element. A control only these two risks touch
is worth 1.26; one that forty risks touch is worth 0.37. Roughly three exclusive
shared elements reach the suggestion threshold of 3 on structure alone.

The rarity weight is the point. In a single-framework organization every risk
shares the framework, so a flat weight would push every pair over the threshold
and leave the per-risk cap as the real filter. The cap of 4 sits below tier 0's
maximum of 10, so strong field overlap still outranks pure structure.

Ten join tables contribute elements: ISO 42001 subclauses and annex categories,
ISO 27001 subclauses and annex controls, EU AI Act controls, subcontrols and
assessment answers, NIST AI RMF subcategories, and custom framework level-2 and
level-3 items. Projects are excluded — tier 0 already scores `shared_project` —
and so is `frameworks_risks`, which rarity would flatten to noise anyway.

The user sees one signal per pair, not one per element:
`{ "signal": "shared_framework_element", "weight": 3.1,
   "detail": "2 EU AI Act controls, 1 ISO 42001 subclause" }`.

### A provider that fails aborts the recompute

Any provider throwing rejects the whole run: nothing is written and nothing is
pruned, so the risk keeps the edges it had. Finishing on a partial set would
strip the missing tier's points from every pair and delete the `derived` +
`suggested` edges that then fell below the threshold — a transient database
error would silently destroy real suggestions. A provider returning an empty
array still means "ran, found nothing" and the run continues. The failed job
is retried with exponential backoff, three attempts in total.

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
`POST /api/riskLinks/recompute` (Admin) is required at least once per org,
since the table starts empty. It enqueues one `risk_link_recompute_batch` job
(jobId `risk-link-batch:<org>:all`) for every active risk, which reads the org's
scoring rows once and recomputes the risks one at a time; one job per risk read
the whole org N times. An optional `firstRiskId` in the body (the panel sends
its own risk) is scored first. A risk that fails inside the batch is re-queued
as its own `risk_link_recompute` job with the retry below.

The job carries `jobId: risk-link:<org>:<risk>` so a burst of saves collapses
into one run, plus `removeOnComplete` and `removeOnFail` — a retained job of
either kind would make BullMQ ignore every later `add` for that risk. It also
makes three attempts in total, with exponential backoff between them. Two
recomputes share at most the single edge between them and cannot deadlock, but
three risks forming a triangle can, because the top-N cap makes an edge a
keeper for one endpoint and an ordinary incident row for the other. The
backfill puts the whole org on a worker running ten jobs at a time, so Postgres
aborting one side with 40P01 is an ordinary event; the retry is what keeps that
risk from silently ending up with no links.

**Endpoints.**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/riskLinks/:riskId` | any authenticated | Links in either direction. Defaults to `suggested` + `confirmed`; `?status=dismissed` for the dismissed list. |
| PATCH | `/api/riskLinks/:id` | any authenticated | `{ status }`. Allowed: `suggested→confirmed`, `suggested→dismissed`, `confirmed→dismissed`, `dismissed→confirmed`, and `dismissed→suggested` as an explicit undo that clears the decision fields. Anything else is a 400. |
| POST | `/api/riskLinks` | any authenticated | Create a link by hand. Lands `confirmed`/`user` straight away. |
| POST | `/api/riskLinks/recompute` | Admin | Backfill the whole org. |
| POST | `/api/riskLinks/suggest-hierarchy` | Admin | Queue one direction-agent pass per connected component. |
| GET | `/api/riskLinks/duplicates` | any authenticated | Duplicate candidate report. Ranked pairs with reasons; writes nothing. |
| GET | `/api/riskLinks/coverage` | any authenticated | Control coverage gap report. Three states; writes nothing. |
| GET | `/api/riskLinks/vendor-risks/:vendorRiskId` | any authenticated | The project risks that inherit from a vendor risk, in the same shape as `GET /:riskId` with every link `incoming`. Same `?status=` filter. |
| GET | `/api/riskLinks/vendor-risks/:vendorRiskId/shared-projects` | any authenticated | Project risks in the vendor's projects with those project titles. Ranks the vendor panel's picker; removes nobody from it. |

There is no delete endpoint: a hard delete would be recreated by the next
recompute, so dismissal is the durable way to remove a link.

> The older client-side summary in
> `Clients/src/application/tools/relatedRisks.ts` still renders after a risk is
> saved. It computes the same signals in the browser and stores nothing; it is
> superseded by the endpoints above and is removed when the linked-risks UI
> lands.

**Are the suggestions any good?** `docs/technical/domains/risk-link-precision.sql`
is a hand-run psql script that reports confirm rates per signal, per score
band, and per signal combination, plus how often the direction agent gets the
arrow backwards. Read its header before the numbers: `suggested` rows are
undecided, not rejected, and a row's verdict is credited to every signal on
it, so a weak signal riding along with a strong one inherits its score.
Dismissing a *suggested* link also captures an optional structured reason
(`dismiss_reason`, plus a note for `other`), which query 6 breaks down by
relation type. Dismissing a *confirmed* link records nothing on purpose: that
is a human un-linking a pair they already accepted, not feedback about a
suggestion, and mixing the two would skew every rate in the file.

**History.** Every human link decision (confirm, dismiss, restore, and creating
a link by hand) writes a "Linked risk" row to the change history of the risk at
*each* end: project, model or vendor risk. The value is worded from that end
("Suggested: Inherits from X" → "Confirmed: Inherits from X" on the child,
"Inherited by Y" on the parent). The write happens after the link is saved and
a failure is only logged (`recordLinkHistory` in `riskLinks.ctrl.ts`). Link
mutations on the client invalidate every `changeHistory` query, so an open
Activity tab refreshes. Background recomputes write no history; nobody decided
anything.

Design: `docs/superpowers/specs/2026-08-11-risk-inheritance-design.md`

## Related Documentation

- [Use Cases](./use-cases.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Vendors](./vendors.md)
- [Models](./models.md)
