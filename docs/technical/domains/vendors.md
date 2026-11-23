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
| GET | `/v1/vendor-risks/:id` | Get a risk, deleted ones included (`is_deleted: true`), to open read-only |
| PATCH | `/v1/vendor-risks/:id/restore` | Restore a deleted risk (`vendor.edit`; 404 if no deleted risk has this id) |

The legacy `/vendorRisks` router is frozen: its `GET /vendorRisks/:id` still
answers 404 for a deleted risk, and updates do too. Custom field values of a
deleted risk can't be written or cleared until it is restored.

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
2. Check that `assignee` and `reviewer` are members of the organization (400 otherwise)
3. Create vendor record
4. Create vendor-project associations
5. Record creation in change history
6. Queue the `vendor_added` automation, sent once the transaction commits (`transaction.afterCommit`); `vendor_updated` and `vendor_deleted` work the same way, and a delete that finds no vendor answers 404 and queues nothing
7. After commit, notify the assignee and reviewer

### One write path

Vendor and vendor risk creates, updates and deletes live in
`services/vendor.service.ts` and `services/vendorRisk.service.ts`. The REST
controllers and the Advisor's write tools (`advisor/functions/vendorFunctions.ts`)
both call them, so a write from either gets the same validation, use case
visibility, change history, onboarding workflow, assignment notices and related
vendor risk rescoring. The callers check `vendor.edit` and the request body
(`assertVendorRequestBody`, `assertVendorRiskRequestBody`) first.

The Advisor's tools act as the user who asked for the change (else the
approver), with that user's role in the organization: a tool call from a user
without `vendor.edit` is refused, before an approval is requested and again
when it runs. A new vendor from the Advisor needs the same fields as in the
console (name, what it provides, website, contact person) and is assigned to
the user who asked unless the call names an assignee. Only use cases that user
can see are linked.

### User references

`vendors.assignee`, `vendors.reviewer` and `vendorrisks.action_owner` are user
ids. A new or changed one must be a member of the organization
(`organization_members`), or the write is refused with a 400 naming the field;
otherwise the assignment email would send the vendor's name and description to
another organization's user. The check lives in the query layer
(`assertVendorUsersInOrganization` in `utils/vendor.utils.ts`, and the action
owner check in `utils/vendorRisk.utils.ts`, both on
`findUserFieldOutsideOrganization` in `utils/user.utils.ts`), so REST, the
Advisor write tools, AI app import and the demo seed all go through it, inside
the write's transaction. An unchanged stored id is not re-checked: a vendor
whose assignee has since left the organization can still be edited.

### Request checks

`utils/validations/vendorRequest.utils.ts` checks the fields a vendor or vendor
risk create or PATCH sends, before the transaction opens, and answers 400
naming the field where the database would otherwise fail with a 500: enums
outside their list, text in an id or score field, strings longer than their
VARCHAR(255) column, `risk_score` outside 0–100, a `review_date` that isn't a
date, `projects` or `frameworks` that aren't lists of ids. Fields that aren't
sent aren't checked, and a vendor PATCH validates only what it sends: an
imported vendor with empty required fields can still be edited, but a PATCH
can't blank a required field.

A vendor risk create needs `vendor_id`, `risk_description`, `likelihood` and
`risk_severity`; an update can't blank them, but can clear
`impact_description` and `action_plan` (`''` or `null`). `likelihood` accepts
either spelling of "Almost certain". Framework ids are checked against
`frameworks` inside the write's transaction, and repeats are saved once: an
unknown id is a 400 and nothing is saved, where it used to be swallowed and
answer 201/202. A PATCH that sends only `frameworks` replaces the links.

Ids in the URL must be positive integers (`abc`, `12abc`, `1.5` are 400), and
the vendor risk lists' `?filter=` must be `active`, `deleted` or `all` (400
otherwise; absent means `active`). `GET /vendorRisks/by-projid/:id` still
answers 200 with an empty list for a non-numeric id.

## Vendor Scorecard

The scorecard assesses vendor risk across dimensions:

| Dimension | Purpose | Weight |
|-----------|---------|--------|
| Data Sensitivity | Type of data vendor accesses | High |
| Business Criticality | Impact if vendor fails | High |
| Past Issues | Historical incident severity | Medium |
| Regulatory Exposure | Compliance requirements | Medium |

### Risk Score

The server computes `risk_score` on every vendor write, from the scorecard
answers as they will be stored (`calculateVendorRiskScore`,
`utils/vendorScorecard.utils.ts`); a `risk_score` in the request is ignored.
Each answer is normalized against its scale's highest value and weighted
(sensitivity 0.3, criticality 0.3, past issues 0.2, regulatory exposure 0.2);
the sum × 100, rounded, is the score (0–100). A vendor with no answer has
`risk_score` NULL and the vendor table shows "Not assessed", where it used to
show a green 0%. The drawer's live preview uses the same table
(`Clients/src/domain/utils/vendorScorecard.utils.ts`).

### Vendor risk level

`vendorrisks.risk_level` is computed by the server on create and on every
update from likelihood and severity as they will be stored, with the formula
project risks use (`calculateRiskLevel` in `utils/riskLevel.utils.ts`:
likelihood + 3 × severity → "No risk", "Low risk", "Medium risk", "High risk",
"Very high risk"). A `risk_level` in the request is ignored, so a level can't
go stale when likelihood or severity changes. The Risks tab cards, card filter
and level filter group levels through `vendorRiskLevelLabel`
(`Clients/src/application/utils/riskLevel.ts`): "No risk" is the lowest card,
and an older stored "Very low" counts there.

Migration `20261122200000-vendor-risk-level-and-score-recompute` recomputed
every stored level (rows without likelihood or severity kept theirs) and every
score (NULL where no answer is set).

## Vendor-Project Relationship

Vendors are linked to projects through a many-to-many relationship:

```
Vendor ─────┬───── Project A
            ├───── Project B
            └───── Project C
```

### Link Management

A vendor PATCH writes links only when it sends `projects`; a field-only save
leaves them as they are, and `projects: []` unlinks every use case the user can
see. Vendors are visible to the whole organization, but a non-Admin sees only
some use cases, so `setVisibleVendorProjects` (`utils/vendor.utils.ts`) adds
and removes only links to use cases the user can see (`getUserProjects`); links
to the others are kept, and an id the user can't see is ignored. An Editor who
isn't on every linked use case can therefore save the vendor, where the old
delete-visible-then-reinsert-all hit the primary key and answered 500. The
response's `projects` is read back from `vendors_projects` after the write.

### Deleting a vendor

A vendor delete is a hard delete (`deleteVendorByIdQuery`,
`utils/vendor.utils.ts`), in one transaction:

- the vendor row is locked first; an unknown id answers 404 and touches nothing
- its risks are deleted, active or not, with their custom field values;
  framework and risk links cascade
- its custom field values, notes (`attached_to = 'VENDOR'`), task links, share
  links and use case links are removed
- pending approval requests for it are withdrawn
- the vendor, and each risk that was still active, get a "deleted" history
  entry. A risk deleted earlier already has one.

The deletion is recorded as made by the user who asked for it, in the console
or through the Advisor. A deletion with no known user is recorded as made by
the system.

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

Removing a user from an organization sets `action_owner` to NULL on that
organization's vendor risks they own (and `assignee` / `reviewer` on its
vendors), in the removal's transaction (`clearOrganizationReferencesToUser`,
`Servers/utils/user.utils.ts`). Other organizations' rows are untouched. No
vendor risk change history is written for this clear, as for the other
columns it clears.

### Soft Delete

Deleting a vendor risk is a soft delete (`deleteVendorRiskByIdQuery`):
- `is_deleted` set to true, `deleted_at` recorded
- a "deleted" history entry (Vendor Risk: Active → Deleted)
- custom field values and framework links are kept, so a restore brings the
  risk back whole
- hidden from the default lists, reports and risk link suggestions

A deleted risk shows in the Risks tab under the "Deleted" status filter. It
opens read-only, titled "Deleted risk", without the Linked risks tab. Holders
of `vendor.edit` can restore it from its row menu or from the modal.
`PATCH /v1/vendor-risks/:id/restore` clears the flag, records a history entry
(Deleted → Active) and queues a link recompute. It is gone for good only when
its vendor is deleted.

### Linked risks

A saved vendor risk has a **Linked risks** tab in its edit modal
(`components/LinkedRisksPanel/VendorRiskLinksPanel.tsx`). It has two groups:

- **Child risks**: the project risks that inherit from the vendor risk —
  value-chain inheritance, described in
  [Risk Management](./risk-management.md#value-chain-inheritance). A vendor
  risk is only ever a parent. **Link a project risk** opens a picker that ranks
  the project risks in the vendor's projects first, with a "Same project" chip.
- **Related vendor risks**: other vendor risks that describe the same
  exposure, at this vendor or another one (`related_to`, see
  [Related vendor risks](#related-vendor-risks)). Each row carries the other
  vendor risk's vendor as a chip. **Relate a vendor risk** opens a picker over
  all active vendor risks, this vendor's first.

Suggested children come from the hierarchy pass. An Admin can start it from a
project risk's panel, or from this tab with **Suggest children**
(`POST /api/riskLinks/vendor-risks/:vendorRiskId/suggest-hierarchy`), which runs
the same pass on only the clusters of related risks that contain a project risk
in the vendor's use cases. The tab then polls for the results for a bounded
window, like the project panel. Suggestions are confirmed or dismissed here with
the same actions and dismissal reasons as on the project side (inheritance
reasons for a child, related reasons for a related vendor risk). When the
vendor risk's `risk_level` changes, each child is flagged "Parent level
changed" on its own panel; the vendor tab does not show that flag.

Reads use `GET /api/riskLinks/vendor-risks/:vendorRiskId` (both groups; a
related row's `relatedRisk.vendorName` is only set here) and
`.../shared-projects`; writes go through the existing `POST /api/riskLinks` and
`PATCH /api/riskLinks/:id`.

### Related vendor risks

Two vendor risks can be related, never parent and child. The row is a
`risk_links` row with `source_vendor_risk_id` and `target_vendor_risk_id` set,
`relation_type = 'related_to'`, and the smaller id as the source, so a pair has
exactly one row (see [Risk Management](./risk-management.md#vendor-risk-pairs)
for the constraints).

Scoring (`services/riskLinks/vendorRelated.ts`) needs similar wording first:
Jaccard over description + impact words, stopwords dropped, at least two
shared words. Without it nothing else counts.

| Signal | Weight | Rule |
|--------|--------|------|
| `similar_wording` | 3 or 2 | Jaccard ≥ 0.3 scores 3, ≥ 0.15 scores 2; detail names up to 6 shared words |
| `same_vendor` | 1 | Both risks belong to one vendor (a risk with no vendor never matches) |
| `shared_framework` | 1 | Both are mapped to a common framework; detail names them |
| `shared_use_case` | 1 | Two different vendors serve a common use case; detail names them |

A pair at `LINK_SCORE_THRESHOLD` (3) or above is suggested, at most
`MAX_LINKS_PER_RISK` (20) per vendor risk. Recompute only prunes derived
suggestions that fell below the threshold; a confirmed or dismissed pair keeps
its status and only has its score refreshed.

Recompute runs on the `vendor_risk_link_recompute` BullMQ job (jobId
`vendor-risk-link:{org}:{vendorRiskId}`), enqueued after a vendor risk is
created or updated. When a vendor's use cases are added or removed, its active
risks are rescored in one `vendor_risk_link_recompute_batch` job (jobId
`vendor-risk-link-batch:{org}:vendor-{vendorId}`) that reads the org's vendor
risk scoring rows once. Existing organisations are backfilled with **Scan for
related vendor risks** on an empty Linked risks tab, or directly:
`POST /api/riskLinks/vendor-risks/recompute` (Admin, SuperAdmin), which
enqueues one batch for every active vendor risk and returns `{ enqueued }`
(the number of vendor risks). A vendor risk that fails inside a batch is
re-queued as its own `vendor_risk_link_recompute` job.

`POST /api/riskLinks` creates a pair by hand with
`{ sourceVendorRiskId, targetVendorRiskId, relationType: "related_to" }`. Any
other relation type is a 400, a self pair is a 400, a missing or deleted vendor
risk is a 404, and an existing pair (in either order) is a 409.

The map draws a pair as a dashed related edge between the two vendor risk
nodes. Filtering the map to a vendor keeps vendor risks related to its own,
but not their children. The exposure report and the inheritance rules ignore
pairs: they read `inherits_from` only.

### Vendor risk insights

Above the vendor risks table, `pages/Vendors/VendorRiskInsights/` shows four
collapsible sections. All start closed; which ones a viewer leaves open is kept
in `localStorage` (`vendor-risk-insights-open`). The duplicate and coverage
scans run only once their section is first opened.

| Section | Source | What it shows |
|---------|--------|---------------|
| Heat map | the page's vendor risks | Likelihood × severity grid (`RiskHeatMap` in cell-select mode). Selecting a cell filters the table; selecting it again clears the filter. |
| Blast radius | `GET /api/riskLinks/vendor-exposure` | Per vendor: vendor risks with children, distinct inheriting project risks, affected use cases, open suggestions. Admins get a "View on map" link to `/risk-inheritance?vendor=ID`. |
| Duplicate vendor risks | `GET /api/riskLinks/vendor-duplicates` | Pairs of one vendor's risks that read alike (description + impact, F7's tokeniser and threshold). Never compares two vendors' risks. |
| Framework coverage | `GET /api/riskLinks/vendor-coverage` | Mapped / gap / no framework, F8's three-state rule: a gap is an unmapped risk whose vendor serves a use case with a framework attached. |

Exposure counts **confirmed** children only; suggestions are shown beside it.
A child that inherits through two of one vendor's risks counts once for that
vendor. The same report feeds the table's **Inherited by** column ("3 project
risks", or "2 suggested" when nothing is confirmed yet). Its link opens the
vendor risk on its Linked risks tab, and its tooltip names the use cases.
Saving or deleting a vendor risk invalidates all three reports
(`VENDOR_INSIGHTS_KEY`).

### Candidate notices

The vendor counterpart of the model risk notices
(`services/riskLinks/vendorCandidates.ts`). The owner of a project risk hears
once, as a `vendor_risk_candidates` in-app notification, that a vendor serving
the risk's use case has vendor risks it could inherit from. It fires,
fire-and-forget, when a vendor is created with use cases, when a vendor update
adds use cases (only the added ones), and when a vendor risk is created on a
vendor that already has use cases (that vendor risk only). Risks already linked
to the vendor risk (any status), risks that already have a confirmed parent or
confirmed children, and soft-deleted risks are left out. At most 25 risks are
notified per trigger. Dedup is per (risk, vendor) for use-case triggers and per
vendor risk id for create triggers, backed by the
`notifications_vendor_risk_candidates_uniq` partial unique index. No link is
written; the owner decides from the Linked risks tab.

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

`risk_level` is derived with `calculateRiskLevel` from `utils/riskLevel.utils.ts`, the
formula a saved vendor risk gets, so accepting a suggestion stores the level it showed
(for example `Very high risk`). Suggestion text names the
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

Besides the form fields, vendor history records use case link changes ("Use
cases", diffed from the links stored before and after the write). It records
the number of linked use cases, not their titles: every vendor viewer reads the
history, and most can't see every linked use case. And
vendor risk history records moving a risk to another vendor ("Vendor") and
framework mapping changes ("Frameworks"). Link and framework lists compare as
sets, so a reorder records nothing. User and vendor names are looked
up within the organization: a user from another organization shows as
`User #id`.

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
| `AddNewRisk` | Create/edit risk modal (Risk details, Custom fields, Activity, Linked risks); `initialTab="linked-risks"` opens an existing risk on its links |
| `VendorRiskLinksPanel` | The Linked risks tab: child project risks and related vendor risks, plus Suggest children and the related scan |
| `RelateVendorRiskForm` | Picker that relates another vendor risk to this one |
| `VendorRiskInsights` | Heat map, blast radius, duplicate and coverage sections above the risks table |
| `RiskTable` | Display vendor risks, including the Inherited by column |
| `TableWithPlaceholder` | Main vendor list |
| `FilterBy` | Dynamic filtering |

### Hooks

| Hook | Purpose |
|------|---------|
| `useVendors()` | Fetch vendors |
| `useDeleteVendor()` | Delete mutation |
| `useVendorRisks()` | Fetch risks |
| `useDeleteVendorRisk()` | Delete risk mutation |
| `useVendorExposure()`, `useVendorDuplicateCandidates()`, `useVendorFrameworkCoverage()` | Vendor risk insight reports (`hooks/useRiskLinks.ts`) |
| `useSuggestVendorRiskHierarchy(id)` | Suggest children on one vendor risk |
| `useRecomputeVendorRiskLinks()` | Scan every vendor risk for related vendor risks (Admin) |

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
| `services/vendor.service.ts` | Vendor create, update, delete (REST and Advisor) |
| `services/vendorRisk.service.ts` | Vendor risk create, update, delete (REST and Advisor) |
| `controllers/vendor.ctrl.ts` | Controller |
| `routes/vendor.route.ts` | Routes |
| `services/riskLinks/vendorReports.ts` | Exposure, duplicate and coverage reports |
| `utils/vendorRiskReport.utils.ts` | Queries behind those reports |
| `services/riskLinks/vendorCandidates.ts` | Vendor risk candidate notices |
| `services/riskLinks/vendorRelated.ts` | Related vendor risk scoring and recompute |
| `utils/vendorRiskLink.utils.ts` | Queries behind related vendor risk pairs |

### Frontend

| File | Purpose |
|------|---------|
| `pages/Vendors/index.tsx` | Main page |
| `pages/Vendors/VendorRiskInsights/` | Heat map, blast radius, duplicates, coverage |
| `components/AddNewVendor/` | Vendor form |
| `hooks/useVendors.ts` | Data hook |
| `repository/vendor.repository.ts` | API calls |

## Related Documentation

- [Risk Management](./risk-management.md)
- [Use Cases](./use-cases.md)
- [Models](./models.md)
