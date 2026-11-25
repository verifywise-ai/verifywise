# Risk Management Domain

**Last Updated:** 2026-11-24

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
├── controls_mapping                  # free-text legacy field; the risk form does not set it
├── date_of_assessment
│
├── likelihood (ENUM)                 # current risk
├── severity (ENUM)                   # current risk
├── risk_level_autocalculated (ENUM)  # inherent level, calculated by the server from likelihood + severity
├── risk_severity (ENUM)              # RESIDUAL severity (mitigation)
├── current_risk_level (ENUM)         # picked by hand in the Mitigation tab; optional
│
├── mitigation_status (ENUM)
├── mitigation_plan
├── implementation_strategy
├── mitigation_evidence_document
├── likelihood_mitigation (ENUM)      # residual likelihood (mitigation)
├── final_risk_level                  # residual level, calculated by the server from the two residual fields
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

## Mitigation is optional

Every kind of risk can be created with only the fields that identify it. The
mitigation fields are optional on create and on update, so a risk can also be
saved later without them. A value that is sent is still checked (enums, dates,
lengths, members of the organization).

| Risk kind | Required on create | Optional mitigation fields |
|-----------|--------------------|----------------------------|
| Use case (project) risk | `risk_name`, `risk_owner` (REST; the form also asks for description, lifecycle phase, impact, category, likelihood and severity) | `mitigation_status`, `current_risk_level`, `deadline`, `mitigation_plan`, `implementation_strategy`, `mitigation_evidence_document`, `likelihood_mitigation`, `risk_severity` (residual), `risk_approval`, `approval_status`, `date_of_assessment` |
| Vendor risk | `vendor_id`, `risk_description`, `likelihood`, `risk_severity` (the form also asks for the impact and the action owner) | `action_plan` |
| Model risk | `risk_name`, `risk_category`, `likelihood`, `severity`, `owner` (v1) | `target_date`, `mitigation_plan` |

Where each path enforces it:

- **REST project risks** (`middleware/validators/risks.validator.ts`): the
  mitigation enums and dates go through `noneWhenEmpty`, so `""` and `null`
  mean none. Any other value, `0` and `false` included, is checked and
  refused when it is not valid. `createRiskService` stores an empty enum or date as NULL;
  `updateRiskByIdQuery` already did on update.
- **Risk form** (`AddNewRiskForm`): no mitigation field is required. A new risk
  starts with every mitigation field empty, including the deadline and the
  residual likelihood and severity (they used to default to today and to
  Rare/Negligible, which saved a made-up "No risk" residual level). The form
  sends unset values as `null`.
- **Vendor risk form and API**: the action plan is optional (at most 1,000
  characters). Accepting a vendor research finding takes an emptied plan.
- **Model risks** (`/api/v1/model-risks`): `target_date` is optional on create
  and can be cleared on update (`""` or `null`; `0` or `false` is refused). The
  form starts with no review date, and its picker can be cleared. The Advisor's
  `agent_suggest_model_risk` stores no date when none is given (it used to be
  today).
- **AI advisor** (`agent_create_risk`): the five mitigation fields are optional
  in the schema and are not in the tool's `required` list; the LLM is told not
  to ask for them.
- **MCP** (`create_risk`) and the **risk import** already took no mitigation.
  The import no longer invents a residual likelihood of Rare: an empty residual
  likelihood stays empty, and so does the residual level.
- **Suggestions** (AI suggestions on a use case, AI Detection): the form opens
  with only the suggested plan text filled in; no status or residual pair is
  pre-chosen.
- **Intake approval**: a suggested risk can be accepted without a mitigation
  plan. Approval still gives each new risk "Not Started" and a deadline of
  approval + 90 days unless the reviewer set one (see intake-forms.md).

### When a mitigation field is empty

| Field | Behaviour when empty |
|-------|----------------------|
| `deadline` / model `target_date` | No deadline reminders or escalations (the scans require a date). Tables show "NA" or "—", and sorting by date puts undated risks last in both directions |
| `mitigation_status` | Counts as Not Started in the Home queue, the advisor (`get_risk_analytics`, `get_executive_summary`, the `fetch_risks` filter), the mitigation status history chart and reports. The risk table shows, filters, sorts and exports it as Not Started (`getMitigationStatus` in `Clients/src/application/utils/mitigationStatus.ts`) |
| Residual pair and `final_risk_level` | The residual level stays NULL until both residual inputs are set. No chart, card or report reads the residual level; the effective level (current, else inherent) is what views show |
| `current_risk_level` | The effective level falls back to the inherent level |
| `action_plan` | Shown as "-" in reports |

## Enumerations

### Likelihood

```typescript
enum Likelihood {
  RARE = "Rare"
  UNLIKELY = "Unlikely"
  POSSIBLE = "Possible"
  LIKELY = "Likely"
  ALMOST_CERTAIN = "Almost Certain"
}
```

Project risks spell the top value "Almost Certain"; the vendor risk enum spells it "Almost certain". Vendor risk create and update accept either casing and store "Almost certain" (`normalizeVendorRiskLikelihood` in `utils/vendorRisk.utils.ts`).

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

### Risk Level

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

The same formula runs in the form, the server, the risk import, the AI advisor,
the MCP tools, intake and AI suggestions. Client:
`Clients/src/presentation/tools/riskCalculator.ts` (`getRiskLevel` /
`getRiskScore`). Server: `calculateRiskLevel(likelihood, severity)` in
`Servers/utils/riskLevel.utils.ts` (argument order is likelihood, then severity;
labels are matched case-insensitively, and "Critical" scores like "Catastrophic"
because residual severity is stored under that label). It returns null when
either input is missing or unknown. Views that show a score, including the risk
heat map on the use case's **Use case risks** tab, must call these helpers
rather than re-deriving the score.

### Risk levels: inherent, current, residual, effective

| Level | Column | How it is set |
|-------|--------|---------------|
| Inherent | `risk_level_autocalculated` | Server, from `likelihood` and `severity`, on every create and update |
| Residual | `final_risk_level` | Server, from `likelihood_mitigation` and `risk_severity`, with the same formula |
| Current | `current_risk_level` | Picked by hand in the Mitigation tab; may be empty |
| Effective | none (derived) | `current_risk_level` when set, otherwise `risk_level_autocalculated` |

A level sent by a client for the inherent or residual column is ignored: the
server drops it and recomputes it (`createRiskService` and `updateRiskService` in
`Servers/services/risk.service.ts`). On update the level is recomputed only when
one of its two inputs is in the payload.

The effective level is what the risk table chip and sort, summary cards, filters,
grouping, export, the use case risks view, the dashboard, the timeline, risk
categories, DOCX and PDF reports, risk trend snapshots, the compliance score's
high and very high counts, proactive detection, link coverage, the home queue and
the AI advisor read. Do not read `risk_level_autocalculated` directly for those;
use:

- Server: `effectiveRiskLevelSql(alias)` (`COALESCE(current, inherent)`) and
  `riskLevelRankSql(expr)` (No risk 0 to Very high risk 5) in
  `Servers/utils/riskLevel.utils.ts`.
- Client: `getEffectiveRiskLevel`, `riskLevelBucket` and `riskLevelRank` in
  `Clients/src/application/utils/riskLevel.ts`. "No risk" and "Very low risk" share
  the very-low summary card.

The heat map is the exception: it plots likelihood and severity, so it shows the
inherent level, and its tab reads "Heat map (inherent level)". The table chip has
a tooltip with the inherent level (`VWProjectRisksTableBody.tsx`).

"Very low risk" is still a valid stored value for the current level, but the
formula never produces it, and the current level has no "No risk" value.

### Spelling of the current level

The current level used to be stored as "Very Low risk". Migration
`20261114090307-current-risk-level-spelling.js` renames the enum value to
"Very low risk" so it matches the inherent level. The API now returns "Very low
risk". Every input that accepts a current level accepts both spellings and stores
"Very low risk" (`normalizeCurrentRiskLevel` in `Servers/utils/riskLevel.utils.ts`).

### Example Calculation

```
Likelihood: Likely (4)
Severity: Major (4)

Score = (4 × 1) + (4 × 3) = 4 + 12 = 16
Result: High risk
```

## Risk-Control Linking

The real control links are the junction tables below. `controls_mapping` on the risk row is a free-text legacy field that the risk form does not set. The risk table's Controls column does not show it: its "View controls" link opens the linked controls, so the column is not sortable, and the risk register export has no controls column.

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
| DELETE | `/projectRisks/:id` | Archive risk (soft delete) |

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

### Archiving and bulk actions

Archiving a risk (single, bulk or through the AI advisor) goes through one server path. In one transaction it soft-deletes the risk, records a deletion entry in its change history, runs the "risk deleted" automation (once per bulk action, see below) and removes the risk from every policy it was linked to. The client no longer sends a separate unlink request. `DELETE /policy-linked/risk/:riskId/unlink-all` still exists for API callers.

Bulk "set owner" and "set category" go through the single-edit path, so each changed risk still gets its change-history entries. Risks that already hold the value are skipped and not counted.

Bulk archive, set owner and set category run the organization's automation once per bulk action, not once per risk: the per-risk paths take `runAutomations: false` and the controller calls `enqueueBulkRiskAutomation` ("risk deleted" for archive, "risk updated" for the edits) with the changed risks. With one changed risk the variables are exactly those of a single edit or delete. With several, `{{risk.name}}` is "<n> risks: <names>" (10 names, then "and <k> more"), `{{risk.id}}` is empty, every other variable keeps its value only when all the changed risks share it (for example `{{risk.owner}}` after set owner) and is empty otherwise, and `{{changes_summary}}` has one line per risk such as "• Risk A: Owner: Ann → Bo" (50 lines, then "• and <k> more"). Owner and approver names come from one query for the batch.

A risk trigger (added, updated, deleted) runs every action of every active automation for it, ordered by automation id and then action order. The jobs are enqueued after the save commits; one failing action is logged and does not stop the others.

Automations that existed before every-action dispatch keep their old behaviour until someone edits and saves them: only the event's first action runs (`automations.legacy_first_action_only`, set by migration `20261114200100-legacy-automation-first-action`; the dispatch keeps the single first legacy row by action order, then automation id). Saving the automation in the editor clears the flag; the active toggle does not. New automations run every action.

A bulk set owner that gives the new owner two or more risks sends one in-app notification and one assignment email, "<n> risks were assigned to you", listing the risks (20, then "and <k> more") with a link to the risk list (`notifyUserAssignedMany`). With one changed risk the owner gets the usual single-risk notice.

`PATCH /projectRisks/bulk` answers `{ updated, changed, action }`. `updated` keeps its original meaning, the number of ids sent; `changed` is the number of risks actually archived or edited. The risk table reports `changed`. The risk added, updated and deleted automations are enqueued after the transaction commits, so a bulk action that rolls back sends none, and the owner notice is sent after the commit too. A bulk action records the risk history snapshots once, after its loop.

Removing a use case or framework from a risk removes the risk's mappings in every framework of that use case: EU AI Act, ISO 42001, ISO 27001, NIST AI RMF, the 24 bundled frameworks, custom frameworks and imported frameworks.

### Archived risks are excluded from

- use-case and organization reports (DOCX and PDF), including the NIST section
- use-case risk totals, which the advisor and the MCP use-case tool also use
- ISO 42001 subclause and annex risk panels, generic framework control panels and imported-framework control panels
- the advisor's readiness risk count
- the post-market monitoring cycle snapshot, which counts the use case's active risks by risk level (high = High or Very high, medium = Medium, low = Low, Very low or No risk)

The report's Severity column shows the inherent severity, not the post-mitigation severity.

The Owner column sorts by the owner's display name (name and surname, case-insensitive), not by user id (`riskSort.ts`, `userSortName` and `compareNames` in `Clients/src/application/utils/userSort.ts`). A risk with no known owner sorts as an empty name. The risk register export uses the filtered list. With a filter or search that matches nothing, the export is empty and the export button is disabled.

## Visibility

Which project risks a user can see depends on the use cases each risk is linked to. Vendor risks and model risks are outside this rule.

### The rule

Admins and SuperAdmins (`seesAllProjects` in `utils/projectVisibility.utils.ts`) see every risk in the organization. Other users see a risk when at least one of these holds:

- it is not archived (`is_deleted = false`) and has no `projects_risks` row. A link to a framework or one of its elements does not tie a risk to a use case, so a risk linked only to frameworks counts as unlinked;
- it is linked to at least one use case the user can access as owner, team member or member of a group attached to the use case (`projectAccessSql`, the rule behind the use case list);
- the user is its action owner (`risk_owner`) or approver (`risk_approval`), so an assignee can act on it.

Task assignees and workflow approvers can open a use case read-only (`getProjectReadAccessQuery`). That access does not show them the use case's risks.

An archived risk with no use case link is private: only Admins, SuperAdmins, its owner and its approver see it, in the archived and "all" lists and everywhere else the rule applies. This holds for every archived unlinked risk, including one that was never on a use case. An archived risk that is linked follows the link rule like an active one. Restoring an archived unlinked risk (setting `is_deleted` back to false) makes it visible to everyone again. There is no restore action for project risks today: no route, screen or advisor tool sets `is_deleted` back to false, and `PUT /projectRisks/:id` answers 404 for any archived risk.

An active risk whose last use case link is removed becomes visible to everyone in the organization. This includes deleting the use case, which deletes its `projects_risks` rows and keeps the risks.

#### Deleting a use case

`DELETE /api/v1/projects/:id?archive_risks_linked_only_here=true|false` deletes a use case and, with `true`, archives the active risks linked to it and to no other use case, so they stay private. The flag is required, so an API caller always decides; any other value, a missing one or a repeated one answers 400. The flag is a query parameter because no v1 `DELETE` takes a body. The gate is the legacy delete's: `useCase.edit` and write access to the use case (`requireProjectAccess`). With `true` the caller also needs `risks.edit`, the bulk archive's permission, or the route answers 403 before anything changes. A role can lack it only as a custom role, since every built-in role holds both permissions or neither.

Everything runs in one transaction (`deleteProjectWithSideEffects` with `archiveRisksLinkedOnlyHere`): lock the use case row, withdraw a pending approval, record the use case deletion, lock the risks linked to this use case and every `projects_risks` row of those risks, including their links to other use cases (`lockRiskLinksOfProjectQuery`), read the risks linked only here at that moment (`getRisksLinkedOnlyToProjectQuery` with the transaction), archive them through `archiveRisksInBulkQuery` (the bulk archive's path: a deletion entry in each risk's change history, its policy links removed, the history snapshots once and one "risk deleted" automation for the batch, enqueued after commit), then delete the use case. Any failure rolls all of it back. The response is 202 with `{ deleted: true, archived_risk_ids }`. The legacy body is a bare `true`, which cannot carry a list, so the v1 body is an object. A use case outside the organization answers 404.

The locks keep a concurrent unlink from changing the set between the read and the commit. Every path that removes a link deletes its `projects_risks` row (the risk update's link diff, a risk delete, another use case's delete), and that `DELETE` waits for the row lock. When the other transaction commits first, the lock skips the removed row and the read that follows no longer sees it, so the risk counts as linked only here and is archived. A new link waits too, because its foreign key check takes a key share lock on the risk row. The risk rows are locked before the link rows, each in key order. The risk update path updates the risk row before it deletes the risk's links, so the two take their locks in the same order and cannot deadlock on them. An integration test (`riskVisibility`, "use case delete against a concurrent unlink") drives the two transactions and checks that the delete waits and then archives the risk.

`DELETE /api/projects/:id` is frozen and unchanged: it never archives and still answers `true`. Its orphaned risks stay visible to everyone while they are active, so API clients that want them private should call the v1 route with `archive_risks_linked_only_here=true`. No screen calls it any more: the use case table, the use case Settings tab and the Framework page's organizational project delete (the page menu and its Settings tab) all use the delete dialog and the v1 route.

Every caller of `deleteProjectWithSideEffects`:

| Caller | Archives the risks linked only here |
|--------|-------------------------------------|
| `DELETE /api/v1/projects/:id` | When the flag is `true` |
| `DELETE /api/projects/:id` (legacy, frozen) | Never |
| Advisor `agent_delete_use_case` | Always, and refuses without `risks.edit` |
| Jira Assets removals (`DELETE /api/extensions/jira-assets/use-cases/:id` and the remove missing action, both `extension.admin`) | Always, recorded as the Admin who asked |
| Demo data removal (`autoDriver.driver.ts`) | Never: it deletes the demo risks before the demo use cases |

The advisor's `agent_delete_use_case` always archives the risks linked only to the use case. It deletes through `deleteProjectWithSideEffects` with `archiveRisksLinkedOnlyHere`, so it also withdraws a pending approval, records the use case deletion and runs the "project deleted" automation after the commit, like the console. It acts as the user who asked for the action (`_requesterId`, else `_userId`): that user must hold `risks.edit` (`userHasPermission`, the permission the v1 route asks for with `true`), or the tool answers that the use case was not deleted because their role does not allow archiving risks, and changes nothing. It never deletes without archiving. Its result keeps `deleted_use_case` and adds `archived_risk_ids` and a message saying how many risks were archived and that an archived risk with no use case is visible only to Admins and its owner and approver. The approval description and the tool description say so too. A use case that is not in the organization answers "not found" and changes nothing.

The Jira Assets removals delete their use cases with `archiveRisksLinkedOnlyHere: true` too. Both are actions of an Admin (`extension.admin`); the scheduled sync only flags missing objects and deletes nothing. The use case and risk history entries record that Admin.

`GET /api/v1/projects/:id/risks-linked-only-here` feeds the delete dialog. It returns `{ count, risks: [{ id, risk_name }] }`: the active risks in the organization linked to this use case and to no other (archived ones are already private once unlinked). It is one query, driven from the use case's `projects_risks` rows joined to their risks with `NOT EXISTS` for any other link, under a `LEFT JOIN` from the use case row: no row means the use case is not in the organization (404) and one row with no risk means none. The delete reads its set through the same function, so the dialog and the archive cannot drift apart. Like the visibility rule, the "no other use case" test ignores `projects_risks.organization_id`. The route has the same gate as the delete: `useCase.edit` and write access to the use case (`requireProjectAccess` with its `"write"` option, so a task assignee's read access does not pass). Every caller who passes can see all the risks it lists, because they are linked to a use case the caller has write access to.

The dialog (`Modals/DeleteUseCase`) reads the count when it opens. With some risks it shows a warning and two choices: archive the risks (the default) or keep them visible to everyone. Deleting is one request to the v1 route with that choice; the server works the set out again in the transaction, so a risk linked or unlinked after the dialog opened is handled correctly. While the request runs the dialog cannot be closed (Cancel, Escape and the backdrop do nothing). If it fails the dialog stays open with an error and nothing changed. A user whose role lacks `risks.edit` sees the warning without the choice and the delete keeps the risks. If the count request fails, the dialog shows one line saying that linked risks may become visible to everyone, and still offers the choice (archive selected). The archive flag does not depend on the count: with `risks.edit` and archive chosen it is always sent, also when the count was 0, so a risk that became linked only here after the dialog opened is archived too; with an empty set the server archives nothing. Every successful delete refreshes the cached project risk queries and the project lists. To keep such a risk active and private, link it to another use case before deleting.

The check is a pair of `EXISTS` subqueries, so it decides which risks a user sees without narrowing their aggregates. The use cases a visible risk names are narrowed separately. For a non-Admin, the `projects` array of the list, by-use-case, by-framework and by-id reads, and the framework mapping rows of the by-id read, list only the use cases the user can access (`accessibleProjectIdSql`). The by-id mapping queries join a mapping to every use case that runs its framework, so for a non-Admin each mapping is kept only under its own use case, the one its element row belongs to (`projects_frameworks_id` on the ISO 42001, ISO 27001 and EU AI Act control rows, and on the assessment of an EU AI Act answer), and only when that use case is accessible. A mapping on a hidden use case never shows, not even under an accessible use case on the same framework. Admins and the system viewer get the mapping rows exactly as before, one per use case running the framework. An owner of a risk whose only use case is hidden from them gets an empty `projects` array. Admins and the system viewer get every use case. Because an edit keeps links to hidden use cases (see Writes), sending the narrowed array back loses nothing.

The "no `projects_risks` row" test does not filter on `projects_risks.organization_id`. That column is nullable, and a row with NULL there still counts as a link, so a linked risk never looks unlinked. The risk id already ties the row to the organization. The "linked to a use case the user can access" test keeps the filter, so a NULL row hides the risk there.

### Risks of one use case

`GET /projectRisks/by-projid/:id` adds a second condition (`projectRiskVisibilitySql`). A user who cannot access that use case gets only the risks they own or approve on it. This holds even when a risk is shared with another use case they can access, so the list never reveals what a hidden use case holds. The route filters in the query instead of using `requireProjectAccess`, which keeps its status codes unchanged. The per-use-case quantitative portfolio and the AI advisor's `get_risk_analytics` for one use case use the same condition. Every caller already joins the risk to the use case, so the condition is only "the user can access this use case, or owns or approves the risk": under that join it implies the general rule.

### Writes

A risk the user cannot see answers like a missing one, with the existing status and message. The legacy routes gained no new status codes.

| Action | Hidden risk answers |
|--------|--------------------|
| `GET /projectRisks/:id` | 204, as a missing risk |
| `PUT` and `DELETE /projectRisks/:id` | 404 "Project risk not found" |
| `PATCH /projectRisks/bulk` | 403 "One or more ids are not accessible" (`assertOrgOwnsIds` with the visibility fragment as `extra`) |
| Risk change history | 200 with an empty page |
| `POST /quantitative-risks/:riskId/apply-benchmark/:benchmarkId` | 404 "Risk not found", nothing written |
| `POST /riskLinks` with a hidden source or target | 404 "Risk not found" (`getLiveRiskIdsQuery` leaves the hidden id out) |
| `PATCH /riskLinks/:id` and `POST /riskLinks/:id/acknowledge-parent-change` on a link with a hidden source or target | 404 "Risk link not found", nothing written |
| `POST /policy-linked/:policyId/linked-objects` with a hidden risk id | 403 "One or more ids are not accessible" (`assertOrgOwnsIds` with the visibility fragment as `extra`), nothing linked |
| `DELETE /policy-linked/risk/:riskId/unlink-all` | 200, as for an unknown id, and the risk keeps its policy links |
| `DELETE /policy-linked/:policyId/linked-objects` (the id is the link row's id) on a link to a hidden risk | 200 "Unlinked successfully", as for a missing row, and the link is kept |

`getRiskByIdQuery`, `archiveRiskQuery` and `updateRiskByIdQuery` take a required viewer and answer a hidden risk like a missing one, so the by-id routes, `PUT`, `DELETE`, the bulk archive and the advisor need no separate visibility check. `updateRiskByIdQuery` checks visibility in its transaction before it validates anything, so a hidden risk returns `null` and never a validation error, and its `UPDATE` repeats the rule in the `WHERE`. Callers map `null` to their missing-risk answer. Every bulk action checks every id at once (`assertOrgOwnsIds`) and then archives or edits each risk as the system viewer, since the hidden ids were already rejected in the same transaction.

Linking a risk to a use case needs write access to that use case: owner, team member or group member, or an Admin. A use case the user cannot access gets 400 "Linked use cases must belong to this organization", the error for a use case outside the organization (`assertRiskReferencesInOrganization` in `utils/risk.utils.ts`). Only newly added links are checked.

When a non-Admin edits a risk, links to use cases they cannot access are kept. The update replaces only the links among use cases they can see, so an edit never unlinks a use case hidden from the editor. The risk form's **Applicable use cases** field lists only the use cases `GET /projects` returns for the user, so those hidden links do not appear in it.

### Secondary reads covered

The rule also applies to:

- search (`utils/search.utils.ts`, `riskVisibilityCondition` on the risks entity);
- risk change history (`controllers/projectRiskChangeHistory.ctrl.ts`);
- risk links of a risk or a vendor risk, plus the shared-project candidates (`utils/riskLink.utils.ts`). A hidden subject returns an empty list. A hidden related risk drops out;
- the vendor risk link picker (`getVendorRiskChildCandidatesQuery`). It lists a project risk under the titles of the use cases it shares with the vendor, and only the ones the user can access. A risk reached only through hidden use cases is left out, even one the user owns;
- the shared-project candidates of a risk (`getSharedProjectCandidatesQuery`), which use only the subject's use cases the user can access. A vendor or model risk reached only through a hidden use case is left out, and no hidden use case title is named;
- the vendor exposure report (`GET /riskLinks/vendor-exposure`, `getVendorExposureRowsQuery`). For a non-Admin it counts only the inheriting project risks they can see, confirmed and suggested, and names only the use cases they can access. Vendor risks are outside the rule and are all listed. Same response shape and status;
- the per-use-case quantitative portfolio and its trend. Use case snapshots total every risk on the use case, so a non-Admin without access to the use case gets an empty trend;
- policy linked objects (`utils/policyLinkedObject.utils.ts`), which leave out links to hidden risks, and the AI advisor's `get_policy_linked_objects`, which applies the same filter (`hiddenRiskLinksFilter`) for the chatting user and counts only the links it returns in `total_count`;
- apply benchmark (`controllers/quantitativeRisk.ctrl.ts`);
- AI risk suggestions for a use case, which pass the model only the existing risks the user can see;
- the AI advisor's read tools `fetch_risks` and `get_executive_summary` (which names its most urgent risks, so its counts cover only visible risks too), and its search tools `global_search` and `search_within_entity`. They run for the chatting user (`_userId`, which `toolBridge` adds to every tool call), and with no user they fail closed (`UNKNOWN_RISK_VIEWER`). `get_risk_analytics` for the whole organization returns counts only and stays organization-wide, like the dashboard (see Aggregates). For one use case it runs for the chatting user under the by use case rule, and with no user it fails closed;
- the AI advisor's write tools: create, update, delete, link to a use case, link to a policy, unlink from a policy, assign owner, change status and bulk status change. They run for the user who asked for the action. After an approval that is the requester stored on the approval record (`requested_by`, passed to the tool as `_requesterId`), not the approver; when the record has no requester, the approver. With no user at all the tool fails closed (`UNKNOWN_RISK_VIEWER`): it sees only risks linked to no use case. A hidden risk is a missing one to them. Update, delete, assign owner and change status report "Risk not found" when nothing was written. Unlinking a hidden risk from a policy deletes nothing and answers as for a link that does not exist. Bulk status change reports the ids it updated in `updated_ids` and the rest in `not_found_ids`.

### Helpers

All in `Servers/utils/riskVisibility.utils.ts`:

| Helper | Use |
|--------|-----|
| `riskVisibilitySql(alias, viewer)` | `" AND ..."` fragment for a risk query, empty for a viewer who sees every risk. The query must bind `:organizationId` |
| `riskVisibilityCondition(alias, viewer)` | The same condition without the leading `AND`, or `null` |
| `riskIdVisibilitySql(column, viewer)` | `EXISTS (...)` over the risk with the id in `column`, in the organization, that the viewer can see. Empty for a viewer who sees every risk. A NULL id matches nothing, so a nullable column needs its own `IS NULL OR`. Used for policy links and risk link ends |
| `accessibleProjectIdSql(column, viewer)` | `" AND EXISTS (...)"` keeping only use case ids the viewer can access. Narrows the use cases a risk names. Empty for a viewer who sees every use case |
| `projectRiskVisibilitySql(alias, viewer)` | The rule for the risks of one use case (binds `:projectId`). Only for a query that already joins the risk to that use case |
| `isRiskVisibleQuery(riskId, orgId, viewer)` | Whether one risk is visible. Admins skip the query |
| `getAccessibleProjectIdsQuery(ids, orgId, viewer)` | Which of these use cases the viewer can access and write to |
| `riskViewer(req)` | The signed-in user as a viewer |
| `riskViewerForUserQuery(userId, orgId)` | A viewer for a user known only by id (advisor), with their role in the organization from `organization_members` (`getUserRoleInOrganization`) |
| `UNKNOWN_RISK_VIEWER` | The viewer for a write that names no user. User id 0 matches no owner, approver or member, so it sees only risks linked to no use case |
| `scopedRiskViewer(viewer)` | The user to scope by, or `null` when the viewer sees every risk |

### The system viewer

The risk list, by-id, archive and link queries take a `viewer` with no default. A new caller must pass a user or `SYSTEM_RISK_VIEWER`, so leaving the argument out fails the build instead of returning every risk. `SYSTEM_RISK_VIEWER` is for callers that act on the whole organization with no user to scope by:

| Caller | Why |
|--------|-----|
| MCP risk tools (`mcp/tools/risks.ts`) | MCP is open only to Admins and super admins |
| Demo seed (`infrastructure.layer/driver/autoDriver.driver.ts`) | Links its risks to the use cases it creates in the same run |
| Intake approval (`controllers/intakeForm.ctrl.ts`) | Links the risk to the use case the same approval creates, which the approver may not be a member of |
| Risk link hierarchy pass (`controllers/riskLinks.ctrl.ts`, `services/riskLinks/direction/candidates.ts`) | An organization-wide `riskLinks.admin` job |
| Portfolio snapshots (`recordPortfolioSnapshot` in `utils/quantitativeRisk.utils.ts`) | Snapshots are organization data, not one user's view |
| `get_risk_analytics` for the whole organization (`advisor/functions/riskFunctions.ts`) | Counts only, organization-wide like the dashboard |
| `updateRiskByIdQuery`'s read of the risk before the update | Only feeds the change diff. The visibility check runs in the transaction before it |
| Bulk archive, set owner and set category (`bulkUpdateProjectRisks`), per id | The batch check already rejected hidden ids in the same transaction. Set owner and set category name no use case, so they touch no link |

Accepting an AI Detection suggested risk runs for the signed-in user.

### SuperAdmins

REST routes treat the SuperAdmin role like Admin. The advisor looks up the user's role in the organization (`riskViewerForUserQuery`). A SuperAdmin with no role there gets an empty role and is scoped like a non-Admin. A SuperAdmin is a cross-tenant organization and user admin, never an in-org Admin. One who is also a member of the organization follows their role in it.

### Aggregates are organization-wide

These totals count every risk in the organization for every user:

- dashboard and compliance risk counts;
- risk history snapshots and the timeseries (`/riskHistory/*`);
- the organization quantitative portfolio and its trend;
- the home queue's untreated risk count;
- the AI advisor's risk analytics for the whole organization (`get_risk_analytics` with no use case), which return counts only.

### Not scoped yet

These read every risk in the organization. A follow-up will scope them:

- the organization section of reports;
- deadlines;
- the evidence hub;
- FRIA;
- risk names shown in approvals;
- the home queue's list of risks the user owns.

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
- `risk_level` - Distribution of risk levels. From this release snapshots are keyed by the effective level (the current level when set, otherwise the inherent level). Older snapshots are keyed by the inherent level, so the trend chart can step once after deploy for organizations that set current levels. The compliance score's high and very high counts use the same effective level, so they now include risks with no current level but a high inherent level.

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

The validator (`middleware/validators/risks.validator.ts`) enforces the column limits, so overlong text is a 400, not a 500. The other text columns are `TEXT` and have no limit.

| Field | Max length | Column |
|-------|------------|--------|
| risk_name | 255 chars | VARCHAR(255) NOT NULL |
| impact | 255 chars | VARCHAR(255) |
| mitigation_evidence_document | 255 chars | VARCHAR(255) |
| final_risk_level | 255 chars | VARCHAR(255) |
| approval_status | 255 chars | VARCHAR(255) |

### Required Fields

- `risk_name` - non-empty string (create). An empty `risk_name` on update is ignored.
- `risk_owner` - positive user id (create)

Approver, approval status and assessment date are optional everywhere (validators, form, advisor). A new risk starts without an assessment date. Import leaves an empty assessment date empty.

### Saving and clearing fields

`updateRiskByIdQuery` writes every key present in the request and leaves absent keys alone, so a partial edit does not touch the owner or log an owner change. A present key clears the field: `""` is stored on text columns, and `""`, `null` or user id `0` become `NULL` on enum, date and user columns. The form sends unset selects, dates and the approver as `null`. Change history diffs the row the update returned (`writtenValues`), so it records what was stored.

Delete is a soft delete (`is_deleted = true`). It keeps the risk's custom field values and returns 404 when the risk does not exist or is already deleted, before any automation runs.

### Calendar dates (deadline, date of assessment)

`deadline` and `date_of_assessment` are `TIMESTAMP WITH TIME ZONE` but hold calendar dates. A calendar date is stored at 12:00 UTC on its day:

- The form sends the picked day as `"YYYY-MM-DD"`. The server (`toRiskCalendarDate` in `utils/riskCalendarDate.utils.ts`) stores a date-only string, or a value at exactly 00:00 UTC (a date-only value something already parsed: import, the advisor, a JSON client), at noon UTC on that day.
- Any other time, such as an explicit API or MCP timestamp, is stored as sent.
- Risk import reads a cell without a time ("05/01/2026") as that calendar day (`riskCalendarDateFromCell`), whatever the server's time zone.
- The client (`riskCalendarDay` in `Clients/src/presentation/tools/isoDateToString.ts`) reads `"YYYY-MM-DD"` as that day, exactly 12:00 UTC as that UTC date, and any other value as the local date of the instant. The risk form, table, sort, filters, export, timeline, entity graph sidebar and linked policies table use it, so every time zone sees the same day and saving the form never changes the date.

Migration `20261114120000-risk-dates-utc-noon` rewrote existing rows on every deployment. A value that looks like a browser's local midnight (a whole quarter hour with no seconds) was set to 12:00 UTC on the UTC date of the value plus 13 hours: 00:00 to 10:45 UTC keep their day (UTC and the Americas), 11:00 to 23:45 UTC take the next day (New Zealand summer time, Asia, Europe). Values at exactly 12:00 UTC and values with seconds were left alone, so the migration can run twice safely. Picks from UTC+12 (New Zealand winter, Fiji), UTC+14 and UTC-11, and whole-quarter-hour times sent on purpose through the API, can be a day off.

A deadline now passes at 12:00 UTC on its day, so overdue checks (`deadline < NOW()`) fire up to 12 hours later than they did with the picker's local midnight.

### Organization references

Every risk write (REST, bulk `set_owner`, import, MCP, advisor, intake, AI Detection, demo seed) goes through `assertRiskReferencesInOrganization` in `utils/risk.utils.ts`, called by `createRiskQuery` and `updateRiskByIdQuery`. A request returns 400 when:

- `risk_owner` or `risk_approval` is not a member of the caller's organization (`organization_members`). On update, an unchanged owner or approver is not re-checked, so a risk whose owner left the organization can still be edited.
- a `projects` id is not a use case of the caller's organization.
- a `frameworks` id does not exist (frameworks are a global catalog).

Ids fail closed: a value that is not a positive integer (for example `5.5`, which PostgreSQL would round to another id) is rejected, never skipped. The advisor's `agent_assign_risk_owner` and `agent_link_risk_to_project` run the same guard. Risk import reports a non-member or malformed owner or approver as a row error. REST create ignores a client-sent `is_demo`.

`POST /riskHistory/snapshot` requires `risks.edit`.

## Approval Status

`approval_status` is one of `Pending`, `Approved`, `Rejected`, `Not required` (the incident approval values). The column is `NOT NULL DEFAULT 'Not required'` with the CHECK `risks_approval_status_check`. `risk_approval` holds the approver.

### Rules

`resolveRiskApproval` in `utils/riskApproval.utils.ts` decides the stored approver and status. It runs in `createRiskService` and `updateRiskService` (REST, MCP, advisor create) and in the advisor's update executor.

- **Unknown values are ignored.** `/api/projectRisks` is frozen and unversioned. A submitted status that is not one of the four (after ignoring case, spaces, `_` and `-`) counts as not supplied: the stored value is kept on update, `Not required` is used on create. Old clients that send `"In Progress"` or `""` get no 400.
- **Who decides.** "Decides" means an Admin (`organization.admin` via `roleHasPermission`) or the risk's saved approver. The approver named in the same request never counts.
- **Status changes (R1).** While the risk has a saved approver, any change of `approval_status`, to any of the four values, needs a caller who decides. A status sent back unchanged is not a change. Other fields save normally for any editor.
- **Approver changes (R2).** Changing `risk_approval` (to another user or to `null`) on an `Approved` or `Rejected` risk needs a caller who decides. On a `Pending` or `Not required` risk anyone with edit rights may change it. A new approver sets `Pending`; in that save only an Admin may set `Approved` or `Rejected` instead, and a non-Admin who asks for a decision gets the 403. Clearing the approver sets `Not required`.
- **Naming yourself (R3).** A non-Admin cannot name themself as the new approver (403, "You can't name yourself as the approver. Ask an Admin or pick someone else."). Keeping yourself when you already are the saved approver is fine.
- **No approver (R4).** On create, and when a save clears the approver, the status is `Not required`. When neither the approver nor the status changes, the stored status is kept, so a legacy `Approved` row whose approver is `NULL` (kept by the migration, or left by a deleted user) is not erased by an unrelated save. A status change on a risk with no approver before or after the save can only be `Not required`; `Pending`, `Approved` and `Rejected` are ignored there, with no 403.
- **Concurrent saves.** `updateRiskService` and the advisor's update executor re-read `risk_approval` and `approval_status` with `SELECT ... FOR UPDATE` (scoped by `organization_id`, `lockRiskApprovalQuery`) inside the write transaction and resolve against that row, not the caller's earlier read.
- **Notification.** A newly named approver who is not the caller gets the assignment notice (`notifyUserAssigned`, role `"Risk Approver"`, the Risk Owner notification type): an in-app notification and the assignment email. `notifyRiskAssignee` in `services/riskApproverNotification.service.ts` sends both the approver notice (`notifyNewRiskApprover`) and the owner notice on create, after commit, fire and forget, from REST create and update and from the advisor's create and update. The assigner's name is looked up through `organization_members` for the risk's organization.

A refused change returns 403. `RiskApprovalForbiddenError` is a `ForbiddenException`, so the risk controllers and the AI Detection `handleException` map it to:

```json
{ "message": "Forbidden", "data": "Only the risk's approver or an Admin can change its approval." }
```

`data` is translated (en, de, fr). The advisor checks the same rule before it files an approval request (`advisor/aiActions/riskApprovalPrecheck.ts`) and tells the user the reason. It looks up the requester's role only when an approval field is sent.

Bulk actions do not touch approval.

Risk import (`extensions/risk-import/riskImport.service.ts`) stores `Pending` for a row with an approver and `Not required` for a row without one; `Approved` or `Rejected` from the file is kept only when an Admin imports (and the row names an approver). The two routes differ on input they cannot store as asked:

- `POST /api/v1/risk-import/import` (strict) refuses the whole file, with keyed row errors from `approvalErrors`, when a row's approval status is not one of the four (`approvalStatusInvalid`), when a non-Admin imports `Approved` or `Rejected` (`approvalDecisionAdminOnly`, with or without an approver), or when a non-Admin names themself as the approver (`approverSelf`, R3). A blank status is not an error.
- `POST /api/extensions/risk-import/import` (legacy, frozen) maps instead of refusing: an unknown status and a non-Admin's decision become `Pending` or `Not required`, and a non-Admin who names themself keeps the row as `Pending`. That last case is a legacy-only gap in R3.

After the import commits, each approver it named, except the importing user, is notified once, fire and forget, on both routes (`notifyRiskApprovers`): one assignment notice listing all their imported risks (`notifyUserAssignedMany`), or the single-risk notice when they have one.

### Migration

`20261116120000-risk-approval-status-values` rewrote existing rows, matching case, whitespace, `_` and `-` insensitively:

| Stored value | Becomes |
|--------------|---------|
| Approved, Rejected, Not required | the same value, canonical spelling |
| Pending, Requires review, with an approver | Pending |
| Pending, Requires review, without an approver | Not required |
| anything else (`NULL`, `""`, mitigation values such as `In Progress`) | Not required |

`Approved` and `Rejected` are kept even when the risk has no approver: the migration does not erase a recorded decision. Such a row keeps its status until someone clears it to `Not required` or an Admin names an approver (R4). It then sets the default, `NOT NULL` and the CHECK. It sends no notifications. `down()` drops the CHECK, `NOT NULL` and default only; the rewritten values are not restored.

### Code

- `domain.layer/enums/risk-approval-status.enum.ts`: the four values, `normalizeRiskApprovalStatus`, `isRiskApprovalDecision`
- `utils/riskApproval.utils.ts`: `resolveRiskApproval`, `callerCanDecideAnyRisk`, `RiskApprovalForbiddenError`
- `services/riskApproverNotification.service.ts`: `notifyRiskAssignee`, `notifyNewRiskApprover`, `notifyRiskApprovers`, `getUserNameById`
- `utils/risk.utils.ts`: `lockRiskApprovalQuery`
- `extensions/risk-import/riskImport.service.ts`: `importedApprovalStatus`, `approvalErrors`

### Follow-ups

- Editing a risk's content after approval does not reset the approval.
- The MCP risk tools take no approver or approval status, so they never name one.
- The legacy risk import route does not apply R3: a non-Admin importer can name themself as approver (the row gets `Pending`). The `/api/v1` route refuses it.

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

- Risk list with filtering
- Search functionality
- Table view with sorting/pagination
- Bulk actions (multi-select)
- Export functionality
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
| `utils/riskVisibility.utils.ts` | Risk visibility rule (see [Visibility](#visibility)) |
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
