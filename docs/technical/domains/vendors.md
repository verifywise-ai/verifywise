# Vendors Domain

## Overview

A Vendor in VerifyWise is a third-party service provider or supplier that an organization uses. Vendors are tracked within projects to monitor risks, compliance, and operational dependencies. The system supports vendor assessment, risk tracking, and change history auditing.

A vendor can also be researched on the open web by an agent. What it finds becomes a list of candidate risks for the vendor risk register, and nothing is written to the register until a person accepts a candidate (see [Vendor Research Agent](#vendor-research-agent)).

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

### Vendor Research Runs Table

One row per research run of a vendor. Migration `20261010012217-create-vendor-research-tables.js`; `20261013021400-vendor-research-web-agent.js` dropped `search_provider` and added `pages_read` when the search provider was replaced by the web research agent.

```
vendor_research_runs
├── id (PK)
├── organization_id (FK → organizations, ON DELETE CASCADE)
├── vendor_id (FK → vendors, ON DELETE CASCADE)
├── trigger_type (VARCHAR(10): auto | manual)
├── status (VARCHAR(10): queued | running | completed | failed, default queued)
├── categories (TEXT[], default empty)
├── category_summary (JSONB, default [])
├── evidence (JSONB, nullable)
├── model (VARCHAR(255), nullable)
├── prompt_version (VARCHAR(255), nullable)
├── searches_used (INTEGER, default 0)
├── pages_read (INTEGER, default 0)
├── duplicates_dropped (INTEGER, default 0)
├── error (TEXT, nullable)
├── requested_by (FK → users, ON DELETE SET NULL)
├── created_at (TIMESTAMPTZ, default now)
├── started_at (TIMESTAMPTZ, nullable)
└── finished_at (TIMESTAMPTZ, nullable)
```

All columns are NOT NULL except the ones marked nullable and `requested_by`. `trigger_type` and `status` carry CHECK constraints.

| Index | Columns | Purpose |
|-------|---------|---------|
| `vendor_research_runs_active_uniq` (partial unique) | `(organization_id, vendor_id) WHERE status IN ('queued', 'running')` | A vendor has at most one active run, so two clicks create one run |
| `idx_vendor_research_runs_vendor_created` | `(organization_id, vendor_id, created_at DESC)` | Latest run of a vendor, cooldown |
| `idx_vendor_research_runs_org_created` | `(organization_id, created_at)` | Daily run cap |
| `idx_vendor_research_runs_vendor` | `(vendor_id)` | The cascade when a vendor is deleted. The three indexes above all start with `organization_id`, so they cannot serve a lookup on `vendor_id` alone |

Column notes:

- `category_summary` is an array of `{ category, outcome, note }`; `outcome` is `findings`, `nothing_found`, `search_failed` or `skipped`, and `note` is one of a closed set of phrases (see [Category outcomes](#category-outcomes)). It is empty until the run ends, and for most failed runs.
- `categories` lists the categories that the research worked on: those with at least one call that reached the web.
- `evidence` is the evidence pack the analysis was shown (sources with `id`, `category`, `kind` (`result` or `page`), `onVendorSite`, `url`, `title`, `content`, `publishedAt`). It is an **audit trail** of third-party text: no endpoint returns it. The 100,000-byte cap is applied in code, not by the DDL.
- `model` (the id of the model that was called) and `prompt_version` (now `vr-2`) record what produced the run. `searches_used` counts the `search` actions that reached the search engine, a failed one included; `pages_read` counts the pages that were read. Both are returned by the API.
- `error` is set when the run failed and is always one of a closed set of fixed English phrases, cut to 500 characters in code. Raw exception messages go to the server log only.
- `started_at` is set only when the job moves the run to `running`. A `failed` run with a null `started_at` never started, which matters for the limits below.
- `requested_by` is the user of a manual run, and null for an automatic run or when that user was deleted.

### Vendor Risk Findings Table

One row per candidate risk that a run produced. A finding is a candidate for the vendor risk register. The register table is `vendorrisks` (the Vendor Risks Table above calls it `vendor_risks` and lists an `impact` column that the real table does not have). A finding stays `pending` until a person accepts or dismisses it.

```
vendor_risk_findings
├── id (PK)
├── organization_id (FK → organizations, ON DELETE CASCADE)
├── vendor_id (FK → vendors, ON DELETE CASCADE)
├── run_id (FK → vendor_research_runs, ON DELETE CASCADE)
├── category (VARCHAR(30): security_incidents | certifications | legal_regulatory | ai_specific)
├── risk_description (TEXT)
├── impact_description (TEXT)
├── action_plan (TEXT)
├── likelihood (ENUM enum_vendorrisks_likelihood, the register's type)
├── risk_severity (ENUM enum_vendorrisks_risk_severity, the register's type)
├── risk_level (VARCHAR(255), for example "High Risk")
├── confidence (VARCHAR(10): low | medium | high)
├── sources (JSONB)
├── status (VARCHAR(10): pending | accepted | dismissed, default pending)
├── dismissed_reason (VARCHAR(20): not_applicable | already_covered | inaccurate | accepted_risk | other, nullable)
├── dismissed_note (TEXT, nullable)
├── accepted_vendor_risk_id (FK → vendorrisks, ON DELETE SET NULL)
├── decided_by (FK → users, ON DELETE SET NULL)
├── decided_at (TIMESTAMPTZ, nullable)
└── created_at (TIMESTAMPTZ, default now)
```

All columns are NOT NULL except `dismissed_reason`, `dismissed_note`, `accepted_vendor_risk_id`, `decided_by` and `decided_at`. `category`, `confidence`, `status` and `dismissed_reason` carry CHECK constraints.

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_vendor_risk_findings_org_status_created` | `(organization_id, status, created_at DESC)` | The findings list |
| `idx_vendor_risk_findings_org_vendor` | `(organization_id, vendor_id)` | Findings of one vendor, de-duplication |
| `idx_vendor_risk_findings_run` | `(run_id)` | The cascade when a run is deleted |
| `idx_vendor_risk_findings_vendor` | `(vendor_id)` | The cascade when a vendor is deleted. The indexes above all start with `organization_id`, so they cannot serve a lookup on `vendor_id` alone |
| `idx_vendor_risk_findings_accepted_risk` (partial) | `(accepted_vendor_risk_id) WHERE accepted_vendor_risk_id IS NOT NULL` | The `SET NULL` when a register risk is deleted. Most findings are never accepted, so only the rows that point at a risk are indexed |

The last three indexes of this table, and `idx_vendor_research_runs_vendor` of the runs table, come from their own migration, `20261011025519-vendor-research-fk-indexes.js` (`CREATE INDEX IF NOT EXISTS`, reversible). Without an index on the child column, each foreign-key action scans the whole table, and both tables hold the rows of every tenant. `vendor_risk_findings.decided_by` and `vendor_research_runs.requested_by` get none: deleting a user is rare.

Column notes:

- `sources` is an array of `{ url, title, quote, published_at }` with at least one entry. The quote is a verbatim part of the text of that source (a snippet or a page excerpt), at most 300 characters.
- The three text columns are at most 300 characters each. That limit, and the rule that a finding has at least one source, are enforced in code (the output schema and the validation), not by the DDL. The vendor risk form takes up to 500 characters for the risk and the impact and 1,000 for the action plan (the limits of the server, `VENDOR_RISK_VALIDATION_LIMITS`), so every accepted finding can be edited in the register.
- `risk_level` is `calculateRiskLevel(risk_severity, likelihood)` followed by ` Risk`, as in the register.
- There is no unique constraint on the wording: the model words a risk differently on every run, so de-duplication is done in code (see [De-duplication](#de-duplication)).
- Accepting a finding keeps its row and sets `accepted_vendor_risk_id` to the new register row, `decided_by` and `decided_at`. Dismissing sets `dismissed_reason`, `dismissed_note`, `decided_by` and `decided_at`.

The two tables are tenant-scoped. They are registered in `tests/integration/tenant-isolation/tenantIsolation.registry.ts` with isolation tests.

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
| POST | `/vendors/:id/research` | Start a research run for the vendor (`risks.edit`); see [Vendor Research Endpoints](#vendor-research-endpoints) |
| GET | `/vendors/:id/research/latest` | Latest research run of the vendor, or `null` |
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

### Vendor Research Endpoints

Paths are under `/api`. A success body is `{ message, data }`. Every route needs a signed-in user; starting research and deciding a finding also need the `risks.edit` permission (Admin and Editor by default, custom roles as configured), so Reviewers and Auditors can read but get 403 on the three writes.

| Method | Endpoint | Access | Request | Success |
|--------|----------|--------|---------|---------|
| GET | `/vendor-research/config` | Any signed-in user | none | 200, `{ hasLlmKey, autoRunEnabled }` |
| GET | `/vendor-risk-findings` | Any signed-in user | query: `status`, `vendorId`, `limit`, `offset` | 200, `{ rows, total }` |
| POST | `/vendors/:id/research` | `risks.edit` | none | 202, `{ run, alreadyRunning }` |
| GET | `/vendors/:id/research/latest` | Any signed-in user | none | 200, the run, or `null` |
| POST | `/vendor-risk-findings/:id/accept` | `risks.edit` | body: `action_owner` (optional) | 200, `{ finding, vendorRisk }` |
| POST | `/vendor-risk-findings/:id/dismiss` | `risks.edit` | body: `reason`, `note` (optional) | 200, the finding |

**Config.** Booleans only, never a key. `hasLlmKey` is true when the organization has at least one LLM key, which is all that research needs to be set up; `autoRunEnabled` reflects `VENDOR_RESEARCH_AUTO_RUN`.

**Findings list.** `status` is `pending` (the default), `accepted` or `dismissed`. `vendorId` narrows to one vendor; a vendor that does not exist in the organization gives an empty list, not a 404. `limit` defaults to 50 and a larger value is cut to 200; `offset` defaults to 0. A bad `status`, `vendorId`, `limit` (below 1 or not a whole number) or `offset`, or a parameter given twice, is a 400. Each row is the full finding row plus `vendor_name`. The newest run comes first, and inside a run the most severe finding comes first.

**Start.** The checks run in this order and the first that fails answers: the vendor exists in the organization (404), the organization has an LLM key (409 `llm_key_missing`). There is no check for a search setting: the search needs no account. Then the vendor's stuck runs are failed and, if the vendor has an active run, that run is returned instead of a new one (still 202, with `alreadyRunning: true`, so a click during a run is never a 429). Then, for a manual start only, the cooldown (429 `cooldown`), and for every start the daily cap (429 `daily_cap`). Only then is the queued run created and its job queued. The start waits at most 5 seconds (`ENQUEUE_TIMEOUT_MS`) for that: with Redis down the queue does not refuse the job, it keeps waiting. If the job cannot be queued in that time, the run is failed at once (`could not enqueue`, which counts toward neither limit) and the answer is 503 `enqueue_failed`. A job that is queued after that is skipped by the worker, without a web request or a model call. (A job that lands in the few milliseconds before the run is marked failed could still start it, and the vendor is then researched twice at worst.)

**Latest.** The run of the vendor with the newest `created_at`, whatever its status, or `null` for a vendor that was never researched. This read also writes: before it reads, it fails the vendor's runs that have been queued or running for more than 15 minutes, so a lost job never shows as "researching" for ever.

**Accept.** `action_owner` absent means the vendor's assignee, but only when that person is a user of the organization (otherwise nobody); `null` means nobody; a number is that user, who must belong to the organization (400 if not). It must be a JSON number: a string such as `"5"` is a 400. The body is not otherwise read.

**Dismiss.** `reason` is one of `not_applicable`, `already_covered`, `inaccurate`, `accepted_risk`, `other`. `note` is optional; `null`, an empty note and a note of blanks all mean no note. The note is cleaned of control characters, trimmed, and then counted: at most 500 characters (code points), else 400.

The **run** in a response is an allowlist, not the row:

```typescript
{
  id, vendor_id,
  status: "queued" | "running" | "completed" | "failed",
  trigger_type: "auto" | "manual",
  categories: string[],
  category_summary: { category, outcome, note }[],
  searches_used: number,
  pages_read: number,
  duplicates_dropped: number,
  error: string | null,
  started_at: string | null,
  finished_at: string | null,
  created_at: string
}
```

The evidence pack, model, prompt version, requester and organization never leave the server; the two counters `searches_used` and `pages_read` do. A **finding** is returned as its full row. `vendorRisk` is the JSON of the new register row, as the vendor risk form returns it.

Errors:

| Status | Body | Meaning |
|--------|------|---------|
| 400 | `{ message: "Bad Request", data: "<sentence>" }` | A bad id, query parameter or body |
| 403 | `{ message: "Forbidden", data: "Access denied" }` | The role lacks `risks.edit` |
| 404 | `{ message: "Not Found", data: "<sentence>" }` | No such vendor or finding in the caller's organization. One that belongs to another organization is answered the same way |
| 409 on start | `{ message: "Conflict", data: { code } }` | `code` is `llm_key_missing`: the organization has no LLM key |
| 409 on accept | `{ message: "Conflict", data: "<sentence>" }` | The finding is no longer pending, or another decision on it is being made at this moment. Accept does not wait for that decision, so a retry can succeed if it let go without deciding |
| 409 on dismiss | `{ message: "Conflict", data: "<sentence>" }` | The finding is no longer pending. A dismissal that meets a decision in progress waits for it: it answers 409 if that decision went through, and dismisses the finding if it did not |
| 429 on start | `{ message: "Too Many Requests", data: { code: "cooldown", retryAfterSeconds } }` and a `Retry-After` header, or `data: { code: "daily_cap" }` | A rate limit (see [Limits](#limits)) |
| 503 on start | `{ message: "Service Unavailable", error: "<sentence>" }` | The job queue is unavailable. There is no `data` and no code, so tell it by the status. Trying again is safe: the failed run counts for neither limit |
| 500 | `{ message: "Internal Server Error", error: "<message>" }` | Server error |

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

Above the vendor risks table, `pages/Vendors/VendorRiskInsights/` shows one
collapsible **Insights** panel with a tab per report, so closed it takes a
single row. It starts closed; whether a viewer left it open, and on which tab,
is kept in `localStorage` (`vendor-risk-insights`). Only the active tab is
mounted, so each report is fetched once its tab is first shown. While a heat
map cell filters the table, a notice under the panel says so and offers
**Show all risks**, also when the panel is closed.

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

## Vendor Research Agent

A background agent looks a vendor up on the open web and proposes risks for the vendor risk register. Its output is a list of **findings**: candidates, each with the quotes and links it rests on. **Nothing reaches the register until a person accepts a finding.**

The agent runs on the organization's own LLM key and needs nothing else: no search account, no search key. Its research is a loop in which the organization's model decides what to search for and which pages to read, using two actions that the server implements, `search` and `read`. The analysis that follows reads only the text those actions returned, and what it says is checked by code against that text before it is stored. The web access (the page guard, `robots.txt`, the search engine, the loop and its limits) is the [web research toolkit](../infrastructure/web-research.md). Read its release gate before the feature is shipped to customers: the search uses a public feed whose terms the product owner still has to settle.

Not covered: periodic re-research, researching all vendors at once, and findings in the user's language (the agent writes English).

### Flow

```
POST /vendors  (VENDOR_RESEARCH_AUTO_RUN on)      POST /vendors/:id/research  (risks.edit)
          └─────────────────────┬───────────────────────────┘
                                ▼
            startVendorResearch: checks, then a vendor_research_runs row (queued)
                                ▼
            BullMQ job `vendor_research` on the automation queue
                                ▼
            worker: handleVendorResearchJob → runVendorResearch
                                ▼
            run completed (findings stored) or failed
                                ▼
            Vendors > Risks > Research findings: Accept or Dismiss
```

**Triggers**

- **Automatic.** `createVendor` calls `triggerAutoResearch` after the vendor is committed and does not wait for it, so it cannot fail the response. It starts nothing for a demo vendor or when `VENDOR_RESEARCH_AUTO_RUN` is `false`, and logs why. Otherwise it goes through `startVendorResearch`. Nothing returns early for a missing search setting, because there is none; when the start refuses for a missing LLM key or a reached daily cap, the reason is logged and no run is created. So in an organization with an LLM key every new vendor costs one run on that key, bounded by the daily cap (see [Limits](#limits)), and `VENDOR_RESEARCH_AUTO_RUN=false` turns the automatic part off.
- **Manual.** `POST /vendors/:id/research`, from the **Research risks** button on the vendors table or **Research again** in the findings section.

Both go through `startVendorResearch` (`services/vendorResearch/trigger.ts`). Its checks, and so the 404, 409, 429 and 503 answers, are described under [Vendor Research Endpoints](#vendor-research-endpoints).

**The run** (`runVendorResearch` in `pipeline.ts`, called by the job in `job.ts`)

1. **Start.** The run moves from `queued` to `running`. Only a queued run starts, and only while it was created less than 15 minutes ago (`STALE_RUN_MINUTES`, the one limit of the stuck-run sweep, the cooldown and the daily cap, see [Limits](#limits)). The job skips a run in any other state, and one that has waited longer, without a web request or a model call; such a queued run stays `queued` until the sweep fails it as `timed out`.
2. **Load.** The vendor is loaded and the model of the organization's most recently added LLM key is resolved before the research, so an organization without a key makes no web request. A missing vendor or key fails the run.
3. **Research.** The research loop (`researchAgent.ts`), see [Research](#research): at most 24 steps and 5 minutes. Every snippet and page excerpt it gets goes to a ledger, tagged with a category.
4. **Evidence pack.** The ledger is cleaned, numbered `S1`, `S2`, ... and trimmed to the size limit. The pack is stored on the run. If the web answered but nothing usable came back, the run completes with no findings and no model call.
5. **Model call.** One structured call over the pack only, see [Model call](#model-call).
6. **Validation.** Deterministic checks of everything the model said, see [Validation](#validation).
7. **De-duplication and caps.** Candidates that repeat something known are dropped, then at most 3 per category and 8 per run are kept. See [De-duplication](#de-duplication).
8. **Store.** One transaction inserts the findings and completes the run. If it fails, nothing is saved and the run ends `failed`.
9. **Notice.** After an automatic run that stored at least one finding, the vendor's assignee is told (see [Notice to the assignee](#notice-to-the-assignee)). This comes after the run has ended and cannot change it.

A run ends once. It is `failed` when the vendor or the LLM key is missing, when the model call fails (in the loop when it found no usable source, or in the analysis), when the web never answered the loop, when the findings cannot be saved, or when something unexpected happens. The web never answered when every call of the loop failed (`The run stopped because the web could not be reached`), or when the model never searched or read (`The model did not use the research actions`). Otherwise the run is `completed`, also with no findings: a run whose calls were answered but returned nothing is a result, and so is partial research. A loop that stopped early, for its time, its steps or a model error with sources in hand, still hands what it found to the analysis. The pipeline catches model and web errors itself and ends the run as `failed`, so the retries of the job (see [Automations](../infrastructure/automations.md#on-demand-jobs)) only cover Redis and database failures that happen before the run is marked `running`, while it is still `queued`.

### Categories

| Category | A finding is raised when the sources show | Where the agent looks | Lookback |
|----------|-------------------------------------------|-----------------------|----------|
| `security_incidents` | A breach, security incident or exploited vulnerability involving the vendor | The news first, then the whole web | 24 months |
| `certifications` | A certification claim that is limited, in progress, expired, out of scope or contradicted | The vendor's own trust and security pages, and the web | 24 months |
| `legal_regulatory` | A fine, enforcement action, lawsuit or settlement | The news first, then the whole web | 36 months |
| `ai_specific` | Customer data used for training, AI subprocessors or model providers that are not disclosed, or other adverse AI terms | The vendor's own privacy policy, terms, data processing agreement and subprocessor list, and the web | 24 months |

The lookback is counted back from the day of the run and is about the date of a source, not the date of the events it describes. The search leaves out a result with a known date before the window, and the analysis is told the windows too (a source inside the window still counts when it reports an older matter that is still open). A source without a date is kept, and a page on the vendor's own domain is exempt. The windows are in `LOOKBACK_MONTHS` (`categories.ts`).

A missing mention is never a finding: "no SOC 2 page found" is recorded as `nothing_found` in the run summary, not as a risk.

The vendor's **domain** is the identity anchor. It comes from the `website` field (scheme, `www.`, path and port are removed; an IP address or `localhost` is not a domain). With one, the agent may read the vendor's own pages, and those of its subdomains, without a search result for them first. Without one, the loop offers only `security_incidents` and `legal_regulatory`, `read` follows only URLs that a search returned, and `certifications` and `ai_specific` are `skipped` with the note "Vendor website is missing or not a valid domain". Nothing prefers a domain in a search engine: the search is general, and the vendor's site is reached with `read`.

### Research

The loop (`services/webResearch/researchLoop.ts`, set up for a vendor by `researchAgent.ts` with the prompts of `prompts.ts`) asks the model for one step per turn, as a flat JSON object, and runs it in code. It uses the same self-correcting structured call as the analysis and not native tool calling, so it works with every model that can answer the app's other structured calls (OpenAI, Anthropic, DeepSeek, custom endpoints, local models). A model that cannot answer in JSON fails the run with a clear message. Each turn the model sees the vendor (name, domain, what it provides), today's date, the categories it may research with their windows, the history of its steps and the budget that is left. Everything that came from the web or from the model goes into a prompt escaped.

| Action | Needs | What the code does |
|--------|-------|--------------------|
| `search` | `query`, `category`, and optionally `kind` (`web` by default, or `news`) | Asks the search engine (the public RSS results feed of Bing, behind the `SearchEngine` interface). Up to 10 results, each with title, address, date when there is one, and snippet. A result older than the window of its category is left out and counted, and the model is told how many |
| `read` | `url`, `category`, and optionally `focus` (a few keywords) | Allowed only for an address that a search of this run returned or that is on the vendor's domain. Then the URL and address policy, `robots.txt`, a guarded fetch and the text of the page. The model gets an excerpt of at most 8,000 characters, and for a page of the vendor up to 25 links to its relevant pages |
| `finish` | nothing | Ends the research. If the ledger is empty, or a category that can be researched has no call, the first `finish` is answered once with a reminder of what is missing, and the second is final |

The limits: 24 steps (invalid ones included), 8 `search` actions, 12 `read` actions, 60 seconds for one model turn and 5 minutes for the loop. The full table, and the page guard behind `read`, are in the [web research toolkit](../infrastructure/web-research.md#the-research-loop). A model that answers badly cannot crash the loop or keep it going: a step that breaks its rule costs one step and the model is told why, and a step that the rules refuse never reaches the web. A blocked page, a failed search and an empty answer are results, never exceptions that fail a run. When a budget is spent the model is told and must finish; when the steps or the time run out, the loop ends and the analysis runs on the ledger as it is.

**The ledger.** One entry per URL: `{ category, kind, onVendorSite, url, title, content, publishedAt }`. A search result is an entry of kind `result` with its snippet. Reading a page replaces the snippet of the same URL with the excerpt (kind `page`, same title), and the date is the page's own when it has one, else the snippet's. `onVendorSite` records whether the content came from the vendor's own domain, decided on the URL that answered: a page that redirected off the domain is not the vendor's own. A second read of a URL changes nothing. Every call is also recorded with its category and whether the web answered it, which feeds the [category outcomes](#category-outcomes).

**Evidence of two kinds.** `buildEvidencePack` (`evidence.ts`) turns the ledger into the pack the analysis reads. Control characters and lone surrogates are cleaned, an unusable URL is dropped, and the first entry of a URL wins across categories. The sources are `kind="result"` (a snippet, at most 1,500 characters) or `kind="page"` (an excerpt, at most 8,000), in the order of the categories and then of the loop. Until the pack is at most 100,000 bytes, the last source of the category that holds the most bytes among those with two or more sources is removed (a tie goes to the later category). A category with one source keeps it, and when every category is down to one the content of the largest source is cut instead, so a category that was researched always has a source in the pack and cannot read as "nothing found" for want of room. The ids `S1`, `S2`, ... are numbered after the trimming, without gaps. The pack is stored on the run.

**Prompt version.** `PROMPT_VERSION` is `vr-2`. It is stored on every run and changes whenever the wording of a prompt changes.

### Category outcomes

Each category ends a run with one of four outcomes and a note. "Worked on" means that at least one call tagged with the category reached the web; "answered" means that the web answered it: a search that returned a feed (an empty one too) or a page that was read. A call that the rules refuse before it reaches the web (a spent budget, an address that is not allowed, an invalid step) is not work on a category. "Looked and found nothing" is thereby never confused with "could not look" or "did not look". The first rule that applies decides:

| Outcome | When | Stored note |
|---------|------|-------------|
| `skipped` | The category needs the vendor's domain and the vendor has none | `Vendor website is missing or not a valid domain` |
| `findings` | At least one finding was kept for the category, also when some of its calls failed | `1 potential risk found` or `N potential risks found` |
| `skipped` | No call was tagged with the category: the time or the steps ran out, or the research ended, before it was covered | `Not researched: the time limit was reached` (the loop ran out of time); `Not researched: the research ended before this category was covered` (any other end) |
| `search_failed` | The category was worked on and no call was answered | `The search was not available` (every call was a failed search); `The pages could not be read` (otherwise) |
| `nothing_found` | At least one call was answered and no finding survived | `Possible risks were found but could not be verified or are already recorded` (the model proposed a risk and none stayed); `No risks found; N of M pages could not be read` (a page call of the category failed); otherwise the model's own note, which the UI shows as unverified, or `No risks found in the sources reviewed` when it wrote none |

The UI maps each phrase to a translated sentence and shows nothing it does not know. The enum `search_failed` is labelled "could not be researched" in the UI.

### Model call

The analysis is one call to `generateObjectWithSelfCorrection` (`advisor/llmSelfCorrect.ts`), with the model of the organization's most recently added LLM key (the first of its key list, which is ordered newest first), temperature 0, under one 120 second deadline. It has no actions: it reads the evidence pack and nothing else. The answer must fit the schema in `schema.ts`:

- `findings`, at most 20, each with `category`, `risk_description`, `impact_description` and `action_plan` (at most 300 characters each), `likelihood` and `risk_severity` (the register's own values, so an accepted finding is always valid there), `confidence`, and 1 to 5 `evidence` items of `source_id` and `quote` (at most 300 characters);
- `category_notes`, at most four short notes (200 characters each), one per category.

If the answer does not fit, the wrapper sends the schema issues back and asks again, at most twice; the SDK also retries transport errors twice. The schema is not strict: a property that is not in it (at the top, on a finding, on an evidence item or on a note) is dropped when the answer is parsed, not reported. So no property name that the model chose, and so that a web page could have steered it to choose, reaches the system prompt of a retry, which quotes the schema issues. The JSON schema sent to the provider still has `additionalProperties: false` on every object, because the AI SDK adds it. `PROMPT_VERSION` (now `vr-2`) is stored on every run.

The user prompt carries the vendor (name, domain, what it provides) as context, and the evidence in an `<evidence>` block with `&`, `<` and `>` escaped. Each `<source>` has its id, category, kind and URL as attributes, `site="vendor"` when it is on the vendor's own site (the ledger's decision, `onVendorSite`, and never the host of the URL), a title, a published date when there is one, and its text in a `<snippet>`. The system prompt says: today's date and the lookback window of each category; that everything inside `<evidence>` is untrusted data, not instructions, and is of two kinds (result snippets and page excerpts, the latter with a gap marker where text was left out); that the vendor's own statement of a limitation, an expiry or an adverse term counts as evidence; to raise a risk only when the evidence itself shows an incident, gap, limitation, expiry, contradiction or adverse term; that a missing mention is not a finding; to ignore sources about other companies; to cite each risk with verbatim quotes, each from one passage and never across a gap; and to return an empty list when nothing qualifies.

### Validation

`validateFindings` (`validation.ts`) trusts nothing the model says and uses no model.

- **Verbatim quote.** Every citation is checked on its own and removed unless its source id is in the evidence pack and its quote is a substring of that source's text (the snippet of a result or the excerpt of a page), after the prompt escaping is decoded and case, whitespace and quotation marks are ignored. A quote that holds the gap marker `[…]` of a page excerpt is removed too: it would join passages that are not next to each other on the page. A source cited twice counts once.
- **The source is about the vendor.** A citation is also removed unless its source mentions the vendor: its URL is on the vendor's domain or a subdomain, or its title or text names the vendor as a whole word or mentions the domain. A page about a company with a similar name cannot get in.
- **The quote says more than the name.** A citation is also removed unless its quote has at least one word that is no part of the vendor's own words. A word is a run of letters and digits in any script, compared after the quote is normalised as for the verbatim check. The vendor's own words are those of its name and of its domain; `www`, `http` and `https` (a page writes the domain with them, and the vendor record does not keep them); and the possessive of each word of the name and of the domain, which is the word followed by `s`, because the apostrophe is removed before words are compared ("Acme's" is "acmes"). For the vendor Acme Analytics (`acme-analytics.com`), the quotes "Acme", "Acme Analytics", "acme-analytics.com", "www.acme-analytics.com", "https://acme-analytics.com" and "Acme's" do not count, while "Acme confirmed the incident", "SOC 2 Type II" and "ISO 27001" do. This is not a minimum length. A refused quote does not use up its source: a later quote of the same source can still count. So a second hostname whose only quote is the vendor's name or domain no longer lifts a finding to `high`. There is no list of words, so any quote with one word beyond these still counts, and this is not a closed list of exceptions: a company suffix ("Acme Analytics Inc"), a path after the domain ("https://acme-analytics.com/trust") and, for a vendor with no domain on record, the top-level domain ("acme-analytics.com") all still count.
- **Candidates.** A candidate is dropped when no citation is left, when its category has no source in the evidence pack, when a text is empty or longer than 300 characters, when an enum value is not valid, or when `calculateRiskLevel(risk_severity, likelihood)` gives no level. The stored `risk_level` is that level followed by ` Risk`.
- **Confidence never goes up.** The citations that passed the checks above set a ceiling: `high` needs at least two different hostnames (`www.` is ignored), `medium` needs two different pages or one page on the vendor's own domain, otherwise `low`. The stored value is the lower of the model's label and the ceiling.
- **Clean text.** The texts the model wrote (the three finding texts, the quotes and the category notes) are cleaned like the evidence is: control characters other than tab, line feed and carriage return are removed and lone surrogates are replaced. PostgreSQL refuses them, and one would fail the save of the whole run.

Candidates are ordered most severe first. What the checks cannot tell is a page that says something false about the vendor, or a quote from a page that gives orders to a model: both are real text of a page that names the vendor. The person who accepts a finding is the check for that.

### De-duplication

The register and the list should not collect the same risk again, and a dismissed finding should not come back on the next run. `dropDuplicates` (`dedupe.ts`) compares the words of the description and the impact together, using the Jaccard score of `services/vendors/textSimilarity.ts` (lower case, letters and digits, words of three characters or more):

| A candidate is compared with | It is dropped when |
|------------------------------|--------------------|
| The vendor's active register risks | The score is 0.25 or more |
| The vendor's earlier findings, whatever their status | The score is 0.4 or more, or it is in the same category and cites a URL that finding cited |
| A candidate of this run that was kept | The score is 0.4 or more (the first is kept) |

`duplicates_dropped` on the run counts them. The caps (3 per category, 8 per run) are applied after the de-duplication, in severity order, so risks that are already known cannot take the places of new ones on a second run.

### Limits

| Limit | Value |
|-------|-------|
| Steps of the research loop | 24, invalid ones included |
| `search` actions per run | 8, each with a 12 second and 1 MB limit; one at a time per process, at least a second apart |
| `read` actions per run | 12, successful or not; a page takes at most 20 seconds, 2 MB after decompression and 4 redirects |
| One model turn of the loop, the whole loop | 60 seconds, 5 minutes |
| Snippet, page excerpt | 1,500 characters, 8,000 characters |
| Evidence pack | 100,000 bytes serialized; trimmed from the largest category, see [Research](#research) |
| Model call of the analysis | 120 seconds, retries included |
| Findings kept | 3 per category, 8 per run |
| Manual cooldown | `VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES` (10), per vendor |
| Daily cap | `VENDOR_RESEARCH_DAILY_RUN_CAP` (50), per organization, rolling 24 hours, automatic and manual runs together |
| A stuck run | 15 minutes |

- The cooldown applies to manual starts only, but it looks at the vendor's newest run of any trigger type, so an automatic run holds off a manual one. An automatic start does not wait for the cooldown; it is held to the daily cap.
- Both limits are plain count queries over `vendor_research_runs`. They count every run except two kinds that did no research and called no model, so they count for neither:
  - a run that **failed before it started** (its job could not be queued, or it was swept as stuck while still `queued`). A start refused with 503 can therefore be tried again at once;
  - a run that is **still `queued` more than 15 minutes after it was created** (`STALE_RUN_MINUTES`, the limit of the stuck-run sweep below). Its job was lost, for example because the backend empties the queue of waiting jobs each time it starts (`obliterate` in `scheduleVendorReviewDateNotification`, older than this feature). The sweep only looks at the vendor that is started or whose latest run is read, so without this rule such a run could use up a slot of the daily cap for the whole 24 hours. A worker that picks up the job of such a run later does not start it either (the start has the same 15-minute limit), so the run can only end as `timed out`, without a web request or a model call.

  A `running` run counts however long it has run, and so do a completed run and a run that failed after it started.
- A run that has been `queued` or `running` for more than 15 minutes (counted from `started_at`, or from `created_at` if it never started) is failed with the error `timed out`. There is no background sweep: it runs before a new run is created and whenever the latest run is read. So a worker that is down leaves a run `queued` until the next start or read, and neither a crash nor a restart blocks a vendor or leaves the UI on "Researching" for ever.
- A queued run also waits for a free worker slot. The automation worker runs 10 jobs at a time (`concurrency: 10` in `services/automations/automationWorker.ts`), for every kind of job in the shared `automation-actions` queue, and a research run can hold a slot for up to about 7 minutes (5 for the research loop, 2 for the analysis). A burst of runs can therefore leave the last one queued past the 15-minute limit, which the sweep ends as `timed out`; this takes many runs started at once (for example many vendors created in a short time, each with an automatic run), a worker that is down, or a long run of other jobs. The vendor then shows the run as `timed out`, which counts toward neither limit, and **Research again** starts a new one at once. A dedicated queue for research is the clean fix if this shows up.
- Each run costs at most 24 steps of the loop (each step is one structured call, which can be retried when the answer does not fit), the analysis call (more only when an answer has to be asked for again), 8 searches and 12 page reads. A typical run is 8 to 16 steps, roughly 60,000 to 130,000 input tokens for the loop and 20,000 to 30,000 for the analysis: cents on a DeepSeek-class price, a dollar or more on a frontier model. These are estimates. The organization pays on its own key, and the daily cap bounds it. `searches_used` and `pages_read` measure the tool side; the provider's usage page measures the model side.

### Accept and dismiss

`acceptFinding` and `dismissFinding` are in `services/vendorResearch/findings.service.ts`.

**Accept** is one transaction:

1. The finding row is locked with `FOR UPDATE NOWAIT` (organization and id). A lock that is not available means another decision on the finding is in progress, and it is answered 409 at once: a request that waits holds a pooled connection while the lock holder still needs more, and accepts that waited could use up the pool between them. A retry can succeed if the other decision let go without deciding.
2. A missing finding, or one whose vendor is gone, is a 404. A finding that is not `pending` is a 409.
3. The action owner is resolved (below).
4. The vendor risk is created with `createVendorRiskInTransaction` (`services/vendors/vendorRiskCreate.service.ts`): the insert into `vendorrisks` with the finding's description, impact, likelihood, severity, action plan and risk level (no order number, no frameworks), and the change-history record of the creation by the user. The vendor risk form (`createVendorRisk`) calls the same function, so a risk created either way is created by the same rules.
5. The finding is marked `accepted`, with `accepted_vendor_risk_id`, `decided_by` and `decided_at`.

Anything that goes wrong rolls the whole accept back and leaves the finding `pending`. Only after the commit does `runVendorRiskPostCommitEffects` run, again the same as for the form: the related-risk recompute job, the candidate notice to the owners of project risks in the vendor's use cases, and the action owner's assignment notice, each fire-and-forget. A rolled-back accept announces nothing.

**Default action owner.** With no `action_owner` in the request, the risk's owner is the vendor's assignee, but only if that person is a user of the organization; otherwise the risk has no owner. Nothing in the database ties an assignee to the vendor's organization, and an owner from another organization would be sent a notice with the risk's text and the vendor's name. The accept goes on without an owner and a log line with ids says why. `action_owner: null` means nobody, and a number must be a user of the organization.

**Dismiss** is one conditional update (`WHERE status = 'pending'`), so a finding is dismissed once and never after it was accepted. The reason is one of `not_applicable`, `already_covered`, `inaccurate`, `accepted_risk` and `other`. The note is optional: `null`, an empty string and blanks all mean no note, and a note is cleaned of control characters and trimmed before it is counted against the 500-character limit. The finding keeps its wording, which is what stops similar candidates from coming back (see [De-duplication](#de-duplication)).

### Notice to the assignee

After an **automatic** run that stored at least one finding, the vendor's assignee (when the vendor has one, and that person is a user of the vendor's organization) gets a `vendor_research_findings` in-app notification that links to `/vendors/risks?findingsVendorId=<vendor id>`. The organization check is the one the accept uses for the default action owner (`findUsersNotInOrganization`): vendor writes do not check the assignee, so it can be a user of another organization, and for such a person no notification is written, nothing is raised, the run is unaffected, and one debug line with ids only is logged. A manual run does not notify: the person who started it is looking at the result. The notification type, link, metadata and dedup index are described in [Notifications](./notifications.md#vendor-research-notice).

### Safety

- **Web text is untrusted.** It enters the prompts inside a delimited block with its markup characters escaped. The model of the loop can only name a search or an address, and code decides what happens (next bullet); the analysis has no actions, its answer is bound to a schema and then checked by code against the retrieved text, and nothing is written to the register unless a person accepts. The findings section says they are AI-suggested and must be verified, and the UI shows finding text, quotes and model notes as plain text, never as markup.
- **Email.** The text of an accepted finding reaches the action owner's assignment email like any risk text. That email HTML-escapes the names and the context it shows (`utils/escapeHtml.ts`, see [Notifications](./notifications.md#assignment-emails)), so text that a model wrote after reading a web page shows as typed and cannot add a tag, a link or an image.
- **Links.** A source is a link only when its URL is `http` or `https`; it opens in a new tab with `rel="noopener noreferrer"`. The server drops any other URL from the evidence before the model sees it.
- **The server fetches pages the model chose, behind a guard.** That is a server-side request forgery surface, so every request goes through `guardedFetch` of the [web research toolkit](../infrastructure/web-research.md#the-page-guard). Only `http` and `https` on ports 80 and 443 are used, and never an IP address, a URL with credentials, `localhost` or a name that is reserved for private networks. Every address the host resolves to must be public, checked on the connection itself, so DNS cannot answer differently afterwards. Redirects are followed by hand (4 at most) and each hop is checked again, and a redirect from https to http is refused. A page may be read only if a search of the run returned its address or it is on the vendor's domain, so a page cannot send the agent to an arbitrary address. The body is cut at 2 MB after decompression, and the whole fetch at 20 seconds. The bot says who it is (`VerifyWiseResearchBot`), sends no cookie, credential or `Referer`, and obeys each site's `robots.txt` for pages.
- **No search key.** The search needs no account and no key. The LLM key is the organization's own: it is never returned (the config endpoint returns booleans) and never logged. The pipeline logs ids only (organization, vendor and run), never page text, URLs, queries, model output or keys, and the errors of the page guard and of the search are fixed phrases that repeat nothing of the URL or the query.
- **Stored errors are fixed phrases.** A run is served to every role, so its `error` is always one of: `Vendor not found`; `No LLM key configured`; `Model call failed: HTTP <status>`, `... timed out`, `... the answer did not match the expected format` or `... unexpected error` (from the loop or from the analysis); `The run stopped because the web could not be reached`; `The model did not use the research actions`; `Unexpected error`; `Saving the findings failed`; `timed out`; `could not enqueue`. The message of a model or provider error is neither stored nor logged by the pipeline (the log line has the error's name and HTTP status), and the message of any other error, which can name a host, a port or a query, goes to the server log only. The client maps this closed set to translated sentences and shows a generic one for anything else.
- **Category notes.** The note of a category is a fixed phrase from the set under [Category outcomes](#category-outcomes), except for a `nothing_found` category in which no page failed and the model proposed nothing: there it may be the model's own text (200 characters at most). The UI shows that one as plain text under "AI note (unverified)".
- **Data sent out.** During a run the server requests `www.bing.com` (the queries the model writes: by its prompt the vendor's name and topic words, which the code does not enforce), the vendor's website and the sites of the articles that a search returned. Every request names the bot. The LLM provider, which the organization chose, receives the vendor's name, its domain and what the vendor provides, the queries, and the snippets and page text that the research read. No other organization data leaves. An air-gapped installation cannot use the feature: its runs fail with "The run stopped because the web could not be reached". The search itself reads a public feed whose own notice limits it to personal, non-commercial use, which is a release gate before the feature ships to customers (see the [web research toolkit](../infrastructure/web-research.md)).
- **Stored third-party text.** Page excerpts and snippets are kept in `vendor_research_runs.evidence` as an audit trail (up to 100 KB per run). The UI shows only the quotes (300 characters) and links. Pruning old evidence is out of scope.

### Permissions and multi-tenancy

- **Permissions.** Starting a run, accepting and dismissing need `risks.edit` (`authorize("risks.edit")`; Admin and Editor by default). Everything else, including the findings list, the latest run and the config, needs only a signed-in user, so every role can see what research found.
- **Tenant isolation.** Every query filters on `organization_id`. The organization and the user always come from the request, never from the body or the path. The `vendor_id` of a run or a finding is a foreign key to `vendors` only and is not tied to an organization in the database, so every id from a path is looked up in the caller's organization before it is used, and a vendor or finding of another organization is a 404, the same as one that does not exist. The job payload carries `organizationId`. Both tables are in the tenant-isolation registry with isolation tests.

### Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `VENDOR_RESEARCH_AUTO_RUN` | `true` | Research a vendor automatically after it is created. Only `false` (any case) turns it off; people can still start a run by hand |
| `VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES` | `10` | Minutes before the same vendor can be researched again by hand. `0` means no wait. Anything but a whole number of 0 or more falls back to 10 |
| `VENDOR_RESEARCH_DAILY_RUN_CAP` | `50` | Runs one organization may start in a rolling 24 hours, automatic and manual together. Anything but a whole number of 1 or more falls back to 50 |

The three variables are optional and are listed in `Servers/.env.example`. They are read from the process environment each time they are used, not at import. There is no search setting: research needs an LLM key saved for the organization, which an Admin adds in the LLM Keys section of Settings → API Keys, and nothing else. Without a key the feature reports "not set up" and nothing runs. The server also needs outbound internet access: HTTPS to `www.bing.com` and to public websites (and HTTP on port 80 for the sites that only offer that).

**The worker needs no search settings.** The backend reads the three variables, for the config endpoint, the automatic start, the cooldown and the daily cap. The worker reads none of them: it takes the organization's LLM key from the database and runs the pipeline. It needs outbound internet access, though. A worker that cannot reach the web ends every run as `failed` with `The run stopped because the web could not be reached`.

| Deployment | What to do |
|------------|------------|
| `docker-compose.prod.yml` | Nothing beyond setting the variables in `.env.prod`: the file hands the whole `.env.prod` to the backend and the worker |
| `docker-compose.override.yml` (development stack) | It gives `.env.dev` to the backend but not to the worker. That is fine: only the backend reads the three variables, so every worker can run a job, whichever container it is in |
| `kubernetes/backend-deployment.yaml`, `kubernetes/worker-deployment.yaml` | These list variables by name and are **not** updated by this branch. Only the backend needs the three variables. The branch `chore/deploy-vendor-research-settings` adds them to the backend deployment and the config map |
| Helm chart: `kubernetes/helm/verifywise/templates/backend-deployment.yaml`, `configmap.yaml`, `values.yaml` | Same: **not** updated by this branch. The same deployment branch adds the three variables to the backend and to the values |
| Ansible: `ansible/templates/.env.j2` | Renders `.env.prod`, which compose hands to both processes. **Not** updated by this branch; the deployment branch adds the three lines to the template |

Network egress is part of the deployment. The research runs in the worker (in the development stack also in the backend container, which runs a worker of its own), and its requests are made directly from that process: the page guard reads no proxy setting and resolves the public host names itself. A firewall or network policy that blocks outbound HTTPS from the worker, or a network whose only way out is a proxy, makes every run fail with "The run stopped because the web could not be reached".

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
| `AddNewRisk` | Create/edit risk modal (Risk details, Custom fields, Activity, Linked risks); `initialTab="linked-risks"` opens an existing risk on its links |
| `VendorRiskLinksPanel` | The Linked risks tab: child project risks and related vendor risks, plus Suggest children and the related scan |
| `RelateVendorRiskForm` | Picker that relates another vendor risk to this one |
| `InlineFormCard` | Bordered frame, title and Cancel/primary actions for the forms that open inside the Linked risks tab |
| `VendorRiskInsights` | Insights panel above the risks table: heat map, blast radius, duplicate and coverage tabs |
| `VendorResearchFindings` | Research findings section above the insights: pending findings with Accept and Dismiss, and the latest research run of a vendor (see [Vendor research](#vendor-research)) |
| `VendorResearchButton` | **Research risks** icon button in each row of the vendors table |
| `RiskTable` | Display vendor risks, including the Inherited by column |
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
| `useVendorExposure()`, `useVendorDuplicateCandidates()`, `useVendorFrameworkCoverage()` | Vendor risk insight reports (`hooks/useRiskLinks.ts`) |
| `useSuggestVendorRiskHierarchy(id)` | Suggest children on one vendor risk |
| `useRecomputeVendorRiskLinks()` | Scan every vendor risk for related vendor risks (Admin) |
| `useVendorResearchConfig()` | Whether research is set up (`hooks/useVendorResearch.ts`, as are the rows below) |
| `useVendorRiskFindings(filter)` | The findings list (one status, one vendor or all) |
| `useLatestVendorResearch(vendorId)` | The latest run of a vendor, polled while it is queued or running, and read again on window focus while it is active. `restartPolling()` starts a new two-minute window and reads the run at once |
| `useStartVendorResearch()` | Start a run |
| `useAcceptFinding()`, `useDismissFinding()` | Decide a finding |
| `followResearch(queryClient, vendorId)`, `useFollowedResearchVendor()` | Leave, and read once, the hint that makes the Risks tab follow a run started on the vendors table |

### Vendor research

**Findings section.** `pages/Vendors/VendorResearchFindings/` is mounted by `pages/Vendors/index.tsx` on the Risks tab (`/vendors/risks`), above the insights. It shows pending findings only: up to 200 at once, with a note when there are more, and accepted or dismissed findings are not listed.

- Collapsible like the Insights panel. It is open by default when something is pending, when a vendor comes from the URL, or when a run was followed from the vendors table (see **Following a run**), and the viewer's own toggle wins. The header says "Research findings", shows a "Pending: N" chip, and says "AI-suggested from web sources. Verify before accepting."
- A **Vendor** filter ("All vendors" or one vendor). It starts from the **`findingsVendorId`** URL parameter (digits only, above zero; anything else is ignored), and when the URL has none, from the vendor of a run followed from the vendors table (see **Following a run**); with neither it starts on all vendors. The parameter is the one that the assignee notification links to: `/vendors/risks?findingsVendorId=<vendor id>`. A new value in the URL while the page is mounted is followed. The existing `vendorId` parameter opens the vendor modal, so the section has a parameter of its own.
- Each row (`FindingRow`) shows the category, the vendor, the risk and impact text, the action plan under an "Action plan" caption (accepting copies it into the register, so the person who decides sees all three texts that will be written), chips for risk level, severity, likelihood and confidence, and the sources: the host as a link (`http` and `https` only), the publication date and the quote as plain text. The action plan is plain text like the other texts, and nothing is shown for a finding without one. The **Accept** and **Dismiss** buttons of a row are described by that row's risk text (`aria-describedby`), so a screen reader says which risk a button decides.
- **Accept** and **Dismiss** are hidden for users without `risks.edit`, who see the section read-only. Accept sends an empty body, so the default action owner rule applies, then shows a toast and a notice with an **Open risk** button for the new risk. Dismiss opens `DismissFindingModal` (a `StandardModal`) with a required reason and an optional note of up to 500 characters, counted in code points as the server counts them (most emoji are one, a flag or a skin-tone emoji are two), and announces "Finding dismissed." when it is done.
- After a decision, focus moves to the first button of the row that takes the decided row's place: the next row, else the previous one, else the "Research findings" heading. Focus moves only if it has fallen to the page, so it never pulls a user back who has moved on.
- A decision that the server refuses is settled once the list has been read again. If the finding has left the pending list (404 for a finding or vendor that is gone, or 409 for a finding decided elsewhere), the dismiss modal closes by itself and focus moves as after a decision. This holds for the modal's finding whichever decision was answered last (two answers can arrive together, for example the refusal of one dismissal and the success of an accept of another finding), except while a request about that finding is still on its way: then its own answer decides. If the finding is still pending (the 409 of another decision in progress, `FOR UPDATE NOWAIT`), the modal stays open with the reason and the note, and a retry can succeed. The global error toast skips 404 on purpose, so a 404 on accept or dismiss shows the warning "This finding no longer exists." through `onNotify`.
- With a vendor chosen, `RunSummary` shows the latest run: one line per category ("Security incidents: nothing found") with its note, the error of a failed run, the date of the last run, and **Research again** (`risks.edit` only). While the run is queued or running it shows "Researching…" and the latest run is polled every 3 seconds for up to 2 minutes. After that it says "Still running. Check back later." followed by **Check again** (a text button, shown to every role), which reads the run at once and polls for another 2 minutes; and a run that is still queued or running is also read again when the browser tab regains focus (the app turns window-focus refetching off everywhere else). **Research again** is enabled again, so that the server decides. When a run that was seen active ends, the findings lists are refetched once.
- **Following a run.** A run started with the **Research risks** button on the vendors table is followed on the Risks tab. The button leaves a one-shot hint in the query cache under its own key (`["vendorResearchFollow"]`, so invalidating the research queries does not clear it), for a started run and for an "already running" answer, not for a refusal. The findings section reads the hint when it mounts and opens on that vendor, even with nothing pending, as if `findingsVendorId` were in the URL, so `RunSummary` polls and the findings appear when the run ends. The URL parameter wins when both are present, and the hint is cleared by the first mount either way. It is not time-bound: it stays until the section mounts or the query cache collects it (10 minutes after the latest start).
- The section stays mounted, with its state, while the register of vendor risks reloads after the **Risk status** or the project filter changes. Only the insights and the table give way to the skeleton.
- A run that is not active also shows one caption with its counters, "Searches: N, pages read: M" (from `searches_used` and `pages_read`), when they are not both zero.
- States: loading, empty, a failed load with **Retry** (`InlineError`), and not set up. Research is not set up only when the organization has no LLM key (`hasLlmKey` is false): the section says "Vendor research is not set up." to everyone, and only Admins also see the hint "Add an LLM key under Settings → API Keys, in the LLM Keys section.". The outcome `search_failed` is labelled "could not be researched".

**Row button.** `components/VendorResearchButton/` is a microscope icon button (tooltip "Research risks") that `components/Table/WithPlaceholder` renders in the actions of each vendor row. It is hidden without `risks.edit`, and disabled while the settings load and when research is not set up (no LLM key). If the request for the settings fails, the button and the findings section treat research as set up and the server decides: a start without an LLM key is refused with a 409. The global error toast is off for the start call, so every click is answered with a message through `onNotify` (started, already running, cooldown, daily cap, not set up, queue unavailable, or a generic failure).

**Data layer.**

| File (under `Clients/src/`) | Purpose |
|-----------------------------|---------|
| `application/repository/vendorResearch.repository.ts` | The six calls. A failure is an `APIError` that keeps the HTTP status; `readVendorResearchError` reads `code` and `retryAfterSeconds` from the response body |
| `application/hooks/useVendorResearch.ts` | React Query hooks under the query key `["vendorResearch"]`. Accepting invalidates the vendor risks query, the research queries and `VENDOR_INSIGHTS_KEY`; dismissing invalidates the research queries. The follow hint has its own key, `["vendorResearchFollow"]` |
| `domain/interfaces/i.vendorResearch.ts` | Types that mirror `Servers/domain.layer/interfaces/i.vendorResearch.ts` (snake_case, dates as ISO strings) |
| `application/utils/vendorResearchText.ts` | Labels, and translated sentences for the closed set of phrases the server stores. A stored string it does not know is never shown; the model's own category note is shown as plain text under "AI note (unverified)" |
| `application/utils/vendorResearchAlerts.ts` | The messages for a start, shared by the findings section and the row button |

Strings are translated by the DOM translator from `i18n/translations.ts` (de, fr and es). The research feature adds no server message, so `Servers/locales` does not change: the stored phrases are English and the client maps them.

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
| `controllers/vendor.ctrl.ts` | Controller; `createVendor` starts the automatic research |
| `routes/vendor.route.ts` | Routes, including `POST /:id/research` and `GET /:id/research/latest` |
| `services/riskLinks/vendorReports.ts` | Exposure, duplicate and coverage reports |
| `utils/vendorRiskReport.utils.ts` | Queries behind those reports |
| `services/riskLinks/vendorCandidates.ts` | Vendor risk candidate notices |
| `services/riskLinks/vendorRelated.ts` | Related vendor risk scoring and recompute |
| `utils/vendorRiskLink.utils.ts` | Queries behind related vendor risk pairs |
| `controllers/vendorResearch.ctrl.ts` | Research endpoints: start, latest run, config, findings list, accept, dismiss |
| `routes/vendorResearch.route.ts` | `/vendor-research/config` |
| `routes/vendorRiskFindings.route.ts` | `/vendor-risk-findings` list, accept and dismiss |
| `services/vendorResearch/trigger.ts` | `startVendorResearch` (checks, queued run, job) and `triggerAutoResearch` |
| `services/vendorResearch/job.ts` | `handleVendorResearchJob`: runs the pipeline, then the assignee notice |
| `services/vendorResearch/pipeline.ts` | `runVendorResearch`: one run from `queued` to `completed` or `failed` |
| `services/vendorResearch/categories.ts`, `target.ts`, `evidence.ts` | The lookback windows and the categories a vendor allows, the vendor's name and domain, the evidence pack built from the ledger |
| `services/vendorResearch/researchAgent.ts` | `createVendorResearcher`: one web session, page reader and research loop per run, with the vendor's prompts |
| `services/vendorResearch/summary.ts` | The outcome and the fixed note of each category, made from the calls of the loop |
| `services/vendorResearch/prompts.ts`, `schema.ts` | The prompts of the loop and of the analysis (`PROMPT_VERSION`) and the output schema of the analysis |
| `services/vendorResearch/validation.ts`, `dedupe.ts`, `text.ts` | Validation of the answer, de-duplication, text cleaning |
| `services/vendorResearch/findings.service.ts` | `acceptFinding` and `dismissFinding` |
| `services/vendorResearch/assignee.ts` | `isUserOfOrganization`: whether a user that someone else named (the vendor's assignee, the action owner of an accepted finding) belongs to the organization; an id that cannot be a user id (zero, negative, a fraction, `NaN`, above `Number.MAX_SAFE_INTEGER`) is answered `false` without a lookup, and a failing lookup rejects |
| `services/vendorResearch/config.ts` | The three environment variables |
| `services/webResearch/` | The web research toolkit, see [Web research toolkit](../infrastructure/web-research.md): `publicUrl.ts` (URL and address policy), `guardedFetch.ts`, `robots.ts`, `pageText.ts`, `readPage.ts`, `webSearch.ts` (`SearchEngine` and Bing), `webSession.ts` (budgets, provenance, ledger), `promptText.ts`, `researchLoop.ts` |
| `services/vendors/vendorRiskCreate.service.ts` | Vendor risk creation shared by the vendor risk form and accept |
| `services/vendors/textSimilarity.ts` | Tokeniser and Jaccard score (risk suggestions and research de-duplication) |
| `services/inAppNotification.service.ts` | `notifyAssigneeOfVendorResearch`; the assignment email, which escapes the text it shows |
| `utils/escapeHtml.ts` | `escapeHtml`, for text that goes into an HTML email |
| `services/automations/automationProducer.ts` | `enqueueVendorResearch`, the `vendor_research` job id and options |
| `utils/vendorResearch.utils.ts` | Queries for runs and findings, and the rule of which runs count toward the limits |
| `domain.layer/interfaces/i.vendorResearch.ts` | Types and the category and dismissal-reason lists |
| `database/migrations/20261010012217-create-vendor-research-tables.js` | The two tables |
| `database/migrations/20261010161236-vendor-research-notification-type.js`, `20261010161240-vendor-research-notification-unique.js` | The notification type and its dedup index |
| `database/migrations/20261011025519-vendor-research-fk-indexes.js` | Four indexes behind the foreign keys of the research tables: three on the findings, one on the runs |
| `database/migrations/20261013021400-vendor-research-web-agent.js` | Drops `search_provider` from the runs and adds `pages_read` |

### Frontend

| File | Purpose |
|------|---------|
| `pages/Vendors/index.tsx` | Main page |
| `pages/Vendors/VendorRiskInsights/` | Heat map, blast radius, duplicates, coverage |
| `pages/Vendors/VendorResearchFindings/` | Research findings section: `index.tsx`, `FindingRow.tsx`, `RunSummary.tsx`, `DismissFindingModal.tsx`, `InlineError.tsx`, `parseVendorId.ts`, `styles.ts` |
| `components/VendorResearchButton/` | Row button that starts research and leaves the follow hint |
| `components/Modals/NewRisk/` | Vendor risk form; its text limits (500, 500, 1,000 characters) are the server's |
| `components/AddNewVendor/` | Vendor form |
| `hooks/useVendors.ts` | Data hook |
| `repository/vendor.repository.ts` | API calls |
| `hooks/useVendorResearch.ts` | Research hooks |
| `repository/vendorResearch.repository.ts` | Research API calls and `readVendorResearchError` |
| `domain/interfaces/i.vendorResearch.ts` | Research types |
| `utils/vendorResearchText.ts`, `utils/vendorResearchAlerts.ts` | Labels and sentences for stored phrases, start messages |

## Related Documentation

- [Risk Management](./risk-management.md)
- [Use Cases](./use-cases.md)
- [Models](./models.md)
- [Notifications](./notifications.md) (the vendor research notice)
- [Web research toolkit](../infrastructure/web-research.md) (the page guard, the search engine and the research loop)
- [Automations](../infrastructure/automations.md) (the `vendor_research` job)
