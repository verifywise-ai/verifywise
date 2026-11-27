# Compliance Frameworks Domain

## Overview

VerifyWise ships 28 compliance frameworks, all available to every organization. None of them needs to be installed or enabled.

- **4 core frameworks** (ids 1–4): EU AI Act, ISO 42001, ISO 27001 and NIST AI RMF. Each has hand-built tables, endpoints and pages. Most of this document describes these.
- **24 bundled frameworks** (ids 5–28): SOC 2, GDPR, HIPAA and others. They are declared in the structure registry (`Servers/structures/`) and served by generic endpoints and a generic UI. See [Bundled frameworks (ids 5–28)](#bundled-frameworks-ids-528).

- **Imported frameworks**: an organization's own frameworks, imported from Excel through the `framework-import` extension. They are stored per organization outside the bundled catalog, and use cases assess them like the bundled ones. See [Imported frameworks](#imported-frameworks).

All frameworks share the same patterns for progress tracking, status management and risk linking. New bundled frameworks are added in code. See [Adding a New Compliance Framework](../guides/adding-new-framework.md).

## Supported Frameworks

| Framework | ID | Purpose |
|-----------|-----|---------|
| EU AI Act | 1 | European AI regulation |
| ISO 42001 | 2 | AI management system |
| ISO 27001 | 3 | Information security management |
| NIST AI RMF | 4 | AI risk management |
| 24 bundled frameworks | 5–28 | See [Bundled frameworks](#bundled-frameworks-ids-528) |

## Framework Structures

### EU AI Act

```
Control Categories (13)
└── Controls
    ├── SubControls
    └── Risk Links

Topics (Assessment)
└── SubTopics
    └── Answers
```

**13 Control Categories:**
1. AI literacy
2. Transparency and provision of information
3. Human oversight
4. Corrective actions and duty of information
5. Responsibilities along the AI value chain
6. Obligations of deployers of high-risk AI systems
7. Fundamental rights impact assessments
8. Transparency obligations for providers
9. Registration
10. EU database for high-risk AI
11. Post-market monitoring by providers
12. Reporting serious incidents
13. General-purpose AI models

#### Organization-wide obligations (EU AI Act (organization))

Some EU AI Act obligations fall on the organization, not on one AI system. They are tracked once per organization, on the organizational project, as **EU AI Act (organization)** (framework id 29, organization level), not once per use case. Framework 29 is not a separate structure: it is these EU AI Act controls and assessment questions, in the EU AI Act's own tables, shown with the EU AI Act's own screens (`EuAiActTrackers`, `Clients/src/presentation/pages/ProjectView/EuAiActTrackers`, which renders both a use case's EU AI Act and the Frameworks page's EU AI Act (organization)). Their text and numbers are the EU AI Act's, so an obligation has the same number on both pages.

Controls (`EU_AI_ACT_ORGANIZATION_CONTROLS`, `Servers/structures/EU-AI-Act-Organization/euAiActOrganization.ts`, by category and control `order_no`), 18 controls with 42 subcontrols:

- 0 Prohibited AI practices (Art. 5): all 8 controls
- 1 AI literacy (Art. 4): both controls
- 6.1, 6.2 AI Act compliance policies and guidelines, and AI risk response planning (Art. 26)
- 7.1 Fundamental rights impact assessment process development (Art. 27)
- 10.2 The process to respond to national authority requests (Art. 71)
- 15 Quality management system (Art. 17): all 3 controls
- 17.1 The authorized representative in the Union (Art. 22)

Assessment questions (`EU_AI_ACT_ORGANIZATION_QUESTIONS`, by topic, subtopic and question `order_no`): 5.1.2 (how the organization communicates its AI values externally), 8.1.1–8.1.3 (its documented AI values, its AI governance framework, its self-assessment and certification schedule) and 11.1.1 (who ensures AI systems follow its values).

`controls_struct_eu.moved_to_framework_id` and `questions_struct_eu.moved_to_framework_id` are 29 on these items. An item belongs to the framework it moved to, else to the EU AI Act: `structItemInFrameworkSql` (`Servers/utils/euAiActStructItem.sql.ts`) is the one place that rule is written, and every query that tells them apart uses it (`structItemInEuAiActSql` is its EU AI Act case). So:

- **Building.** `createEUFrameworkQuery` and `deleteProjectFrameworkEUQuery` (`utils/eu.utils.ts`) take the framework id. For framework 1 they build or remove a use case's controls, subcontrols and assessment for the items still in the EU AI Act; for framework 29 (`createEUAIActOrganizationFrameworkQuery`, `deleteProjectFrameworkEUAIActOrganizationQuery`, wired into `frameworkAdditionMap` / `frameworkDeletionMap`) the same rows for the moved items. Its evidence uses the EU AI Act's file sources and links.
- **Reading.** The requirements, assessments, progress and report-section queries scoped to a project framework, and readiness's assessment completion, read the items of its framework. A use case's EU AI Act no longer lists or counts the moved items, and framework 29 lists only them. Framework 29 shows all its categories, whatever the project's risk classification (`getVisibleEuCategoryIdsForProject` applies the tier and role filter to framework 1 only). The EU AI Act catalogue (`GET /eu-ai-act/controlCategories` without a project framework, `GET /eu-ai-act/topics`) leaves out categories and topics whose items all moved, and the assessment tree leaves out subtopics and topics with no question of its framework. Reports give framework 29 the EU AI Act compliance and assessment sections, and the Frameworks page dashboard shows its EU AI Act requirements progress.
- **Existing data.** Rows a use case already had for the moved items stay in `controls_eu` / `subcontrols_eu` / `answers_eu`, hidden and unchanged; migration `20261126150000` copies their work to framework 29 once (below). The File Manager does not show their file links (`HIDDEN_EU_AI_ACT_LINK_SQL`, `utils/files/attachLinkProjections.ts`), and a notification or task email link to one opens the organizational project's row of the same item (`buildEntityUrlAsync`, `services/inAppNotification.service.ts`), or nothing when there is none. Task links stay on them. Risk-link graphs and coverage scans (`utils/riskLink.utils.ts`) still read those rows. Removing a risk's link to framework 1 or 29 deletes its mappings to either framework's rows (`deleteRiskMappingsForProjectFrameworksQuery`).
- **Copied, review it.** `controls_eu` / `subcontrols_eu` / `answers_eu.copied_from_project_id` is the use case a framework-29 row's work was copied from on upgrade. The tracker reads return it with `copied_from_use_case` ("<title> (<UC id>)"). Any save of the row (`updateControlEUByIdQuery`, `updateSubcontrolEUByIdQuery`, `updateQuestionEUByIdQuery`) clears it.
- **Who sees the use case name.** `copied_from_use_case` goes through `projectVisibilitySql` (`copiedFromJoinSql`, `utils/eu.utils.ts`). Admins and super admins get it for every use case. Other roles get it only for a use case they own, are a member of or reach through a group. For other viewers the label is null while `copied_from_project_id` is returned, so the drawer note reads "Copied from a use case when this moved to the organization. Review it, then save." A loader called without a viewer (the advisor, seeding) returns no label at all. The five reads in `eu.ctrl.ts` that return these rows (`getAssessmentsByProjectId`, `getCompliancesByProjectId`, `getTopicById`, `getControlById`, `getControlsByControlCategoryId`) pass `{ userId, role }`.
- **Known gap.** The column is `ON DELETE SET NULL`. Deleting the source use case therefore also clears the review mark on rows no user has reviewed yet. A separate `needs_review` flag would keep it.

Framework 29 is never added by hand. `buildProjectFrameworkQuery` (`utils/framework.utils.ts`), which every path that enables EU AI Act on a use case goes through (creation, approval of pending frameworks, "add framework", intake approval), calls `ensureEuAiActOrganizationFrameworkQuery` (`utils/euAiActOrganization.utils.ts`) in the same transaction:

- Demo use cases (`is_demo`) don't trigger it, and the demo data seeder doesn't add framework 29.
- If a non-demo organizational project already has framework 29, nothing happens (idempotent). An advisory lock per organization keeps two concurrent enables from both creating it.
- Otherwise it goes on the organizational project the Frameworks page shows (`created_at DESC, id ASC`, first), skipping demo ones, since deleting the demo data removes them. If the organization has none, one is created, named after the organization and owned by its first Admin (earliest `organization_members.joined_at`, then lowest `user_id`), else the user who enabled EU AI Act, else the use case owner; the user who enabled it is its creator.
- The response says whether this call added it: `organization_framework_added` on `POST /frameworks/toProject` and on `frameworks.eu` of `POST /projects`. The client then shows a toast, and the use case's EU AI Act Requirements tab shows a notice pointing to the Frameworks page.
- After the outermost transaction commits (a savepoint's own hook would run before that), every Admin of the organization plus the organizational project's owner get one in-app notification (`notifyEuAiActOrganizationAdded`, type `system`, linking to `/framework`): "Organizational project created" when the project was made for it, "EU AI Act (organization) added" otherwise. A non-Admin who enabled EU AI Act gets no notification, because they are not a member of that project and the link would not open for them. Their toast says that Admins fill it in on the Frameworks page. A failed notification is logged and does not undo the add.

Adding framework 29 by hand is refused (400): `addFrameworkToProjectQuery` and `createNewProjectQuery` reject it, and the client leaves it out of the add lists. Removing it is refused (400) while any non-demo use case has EU AI Act. Deleting the organizational project that holds it is refused (400) under the same condition (`assertProjectDeletableForEuAiActQuery`, called by `deleteProjectWithSideEffects`, the one delete path); the delete dialog shows the reason.

Migration `20261119235846-add-eu-ai-act-organization-framework.js` is the whole change: it inserts frameworks row 29, sets `moved_to_framework_id` on the listed controls and questions, and attaches framework 29, with its rows, to every organization that already had EU AI Act on a non-demo use case, by the rules above, without notifications. It is idempotent.

Migration `20261126150000-eu-ai-act-organization-copy-forward.js` then copies the work, for each organization whose non-demo organizational project has framework 29:

- **Fields.** Each framework-29 row no user has worked on (default status, every user field empty, not copied before) takes the work of the best hidden row of the same item among the organization's non-demo use cases. Subcontrols and answers rank by status first (Done, then In progress, then Waiting / Not started), then a row with any work, then the latest change-history entry, then the highest id. A control's status is derived from its subcontrols, so controls rank on their own fields and links only. Users who left the organization are left out of owner, reviewer or approver. Copied controls and subcontrols get a system "Copied from use case" change-history entry. Every copied row gets `copied_from_project_id`.
- **Links.** Each framework-29 subcontrol or answer gets every evidence or feedback file link of the hidden rows of its item. Each control, subcontrol or answer gets every risk link of those rows. Rows a user already filled in get them too, because the File Manager no longer shows links to hidden rows.
- **Controls already worked on.** When one of its subcontrols was copied, such a control keeps its own fields. Its status is derived again, as `saveControls` does, and it is marked for review with that subcontrol's use case.
- **Notification.** Every Admin gets one in-app notification in their language, saying how many items were copied and linking to `/framework?framework=eu-ai-act-organization`.

Hidden rows are not changed, and task links remain on them. A re-run copies nothing.

### ISO 42001 / ISO 27001

```
Clauses (4-10)
└── SubClauses
    ├── Implementation Details
    ├── Evidence Links
    └── Risk Links

Annexes
└── Annex Categories / Controls
    ├── Implementation Details
    └── Evidence Links
```

**Clause Numbers:** 4, 5, 6, 7, 8, 9, 10

### NIST AI RMF

```
Functions (4)
└── Categories
    └── Subcategories
        ├── Implementation Details
        ├── Evidence Links
        └── Risk Links
```

**Four Core Functions:**
- **GOVERN** - Establish policies, processes, accountability
- **MAP** - Identify AI systems and risk context
- **MEASURE** - Assess, analyze, track risks
- **MANAGE** - Prioritize, respond to, monitor risks

## Database Models

### Project-Framework Link

```
project_frameworks
├── project_id (FK)
├── framework_id (FK)
└── is_demo
```

### EU AI Act Tables

```
controls_eu
├── id (PK)
├── control_meta_id
├── projects_frameworks_id (FK)
├── status (Waiting, In progress, Done)
├── risk_review (Acceptable, Residual, Unacceptable)
├── owner (FK → users)
├── reviewer (FK → users)
├── approver (FK → users)
├── due_date
└── implementation_details

subcontrols_eu
├── id (PK)
├── control_id (FK)
├── title
└── status

answers_eu
├── id (PK)
├── topic_id
├── projects_frameworks_id (FK)
├── status (Not started, In progress, Done)
└── evidence_links (JSONB)
```

### ISO 42001/27001 Tables

```
subclauses_iso / iso27001_subclauses
├── id (PK)
├── subclause_struct_id (FK)
├── projects_frameworks_id (FK)
├── implementation_description
├── evidence_links (JSONB)
├── status (Status enum)
├── owner / reviewer / approver (FK → users)
├── due_date
└── auditor_feedback

annexcategories_iso / iso27001_annexcontrols
├── id (PK)
├── annex_struct_id (FK)
├── projects_frameworks_id (FK)
├── is_applicable
├── justification_for_exclusion
├── implementation_description
├── evidence_links (JSONB)
└── status
```

### NIST AI RMF Tables

```
nist_ai_rmf_functions
├── id (PK)
├── type (Govern, Map, Measure, Manage)
├── title
├── description
└── framework_id

nist_ai_rmf_categories
├── id (PK)
├── function_id (FK)
├── title
├── index
└── description

nist_ai_rmf_subcategories
├── id (PK)
├── category_id (FK)
├── projects_frameworks_id (FK)
├── title
├── index
├── description
├── implementation_description
├── evidence_links (JSONB)
├── tags (ARRAY)
├── status
├── owner / reviewer / approver (FK → users)
└── due_date
```

## Status Enumerations

### Implementation Status (ISO frameworks)

```typescript
enum Status {
  NOT_STARTED = "Not started"
  DRAFT = "Draft"
  IN_PROGRESS = "In progress"
  AWAITING_REVIEW = "Awaiting review"
  AWAITING_APPROVAL = "Awaiting approval"
  IMPLEMENTED = "Implemented"
  NEEDS_REWORK = "Needs rework"
}
```

### Compliance Status (EU AI Act)

```typescript
enum StatusCompliance {
  WAITING = "Waiting"
  IN_PROGRESS = "In progress"
  DONE = "Done"
}
```

### Assessment Status

```typescript
enum StatusAnswers {
  NOT_STARTED = "Not started"
  IN_PROGRESS = "In progress"
  DONE = "Done"
}
```

## Implementation Workflow

### ISO 42001/27001 Workflow

```
[Not started]
    ↓
[Draft] → Create implementation description
    ↓
[In progress] → Add evidence links
    ↓
[Awaiting review] → Reviewer evaluates
    ↓
[Awaiting approval] or [Needs rework]
    ↓
[Implemented] ← Approver confirms
```

### EU AI Act Workflow

```
[Waiting]
    ↓
[In progress] → Implementation work
    ↓
[Done] ← Control completed
```

## API Endpoints

### Framework Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/frameworks/` | List all frameworks |
| GET | `/frameworks/:id` | Get framework |
| POST | `/frameworks/toProject` | Add to project |
| DELETE | `/frameworks/fromProject` | Remove from project |

### ISO 42001

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/iso-42001/clauses` | All clauses |
| GET | `/iso-42001/clauses/struct/byProjectId/:id` | Structure |
| GET | `/iso-42001/clauses/byProjectId/:id` | Project clauses |
| GET | `/iso-42001/subClauses/byClauseId/:id` | SubClauses |
| GET | `/iso-42001/subClause/byId/:id` | Single subclause |
| GET | `/iso-42001/subclauses/:id/risks` | Linked risks |
| GET | `/iso-42001/annexes` | All annexes |
| GET | `/iso-42001/annexes/byProjectId/:id` | Project annexes |
| GET | `/iso-42001/annexCategories/byAnnexId/:id` | Categories |
| GET | `/iso-42001/annexCategories/:id/risks` | Linked risks |
| GET | `/iso-42001/clauses/progress/:id` | Progress |
| GET | `/iso-42001/annexes/progress/:id` | Progress |
| GET | `/iso-42001/clauses/assignments/:id` | Assignments |
| PATCH | `/iso-42001/saveClauses/:id` | Save clauses |
| PATCH | `/iso-42001/saveAnnexes/:id` | Save annexes |
| DELETE | `/iso-42001/clauses/byProjectId/:id` | Delete |

### ISO 27001

Same structure as ISO 42001 with `/iso-27001` prefix.

### NIST AI RMF

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/nist-ai-rmf/functions` | All functions |
| GET | `/nist-ai-rmf/functions/:id` | Single function |
| GET | `/nist-ai-rmf/categories/:title` | Categories |
| GET | `/nist-ai-rmf/subcategories/byId/:id` | Subcategory |
| GET | `/nist-ai-rmf/subcategories/:id/risks` | Linked risks |
| GET | `/nist-ai-rmf/overview` | Full hierarchy |
| GET | `/nist-ai-rmf/progress` | Total counts |
| GET | `/nist-ai-rmf/progress-by-function` | By function |
| GET | `/nist-ai-rmf/status-breakdown` | By status |
| GET | `/nist-ai-rmf/assignments` | Assignments |
| PATCH | `/nist-ai-rmf/subcategories/:id` | Update |
| PATCH | `/nist-ai-rmf/subcategories/:id/status` | Status only |

### EU AI Act

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/eu-ai-act/controlCategories` | All categories |
| GET | `/eu-ai-act/controls/byControlCategoryId/:id` | Controls |
| GET | `/eu-ai-act/topics` | Assessment topics |
| GET | `/eu-ai-act/topicById` | Single topic |
| GET | `/eu-ai-act/controlById` | Single control |
| GET | `/eu-ai-act/compliances/byProjectId/:id` | Compliance |
| GET | `/eu-ai-act/assessments/byProjectId/:id` | Assessments |
| GET | `/eu-ai-act/compliances/progress/:id` | Progress |
| GET | `/eu-ai-act/assessments/progress/:id` | Progress |
| PATCH | `/eu-ai-act/saveControls/:id` | Save controls |
| PATCH | `/eu-ai-act/saveAnswer/:id` | Save answer |
| DELETE | `/eu-ai-act/compliances/byProjectId/:id` | Delete |
| DELETE | `/eu-ai-act/assessments/byProjectId/:id` | Delete |

## Progress Tracking

### Progress Calculation

```typescript
// Completion
Total Items = COUNT(*)
Completed Items = COUNT(*) WHERE status = 'Implemented' (ISO) or 'Done' (EU)
Completion % = (Completed / Total) × 100

// Assignment
Assigned Items = COUNT(*) WHERE owner IS NOT NULL
Assignment % = (Assigned / Total) × 100
```

### Progress Response

```typescript
{
  total: number,
  completed: number,
  completionPercentage: number,
  assigned: number,
  assignmentPercentage: number
}
```

## Risk Linking

Controls and subclauses can be linked to organizational risks through junction tables:

```
subclauses_iso__risks
├── subclause_id (FK)
└── risk_id (FK)

annexcategories_iso__risks
├── annexcategory_id (FK)
└── risk_id (FK)

controls_eu__risks
├── control_id (FK)
└── risk_id (FK)
```

### Risk Link Data

```typescript
{
  risk_id: number,
  risk_name: string,
  risk_description: string,
  risk_level: string,
  risk_owner: number
}
```

## Assignment Management

Each implementation item can have three role assignments:

| Role | Purpose |
|------|---------|
| Owner | Primary responsibility |
| Reviewer | Technical review |
| Approver | Final approval |

### Assignment Endpoints

```
GET /iso-42001/clauses/assignments/:projectFrameworkId
GET /iso-42001/annexes/assignments/:projectFrameworkId
GET /nist-ai-rmf/assignments
GET /nist-ai-rmf/assignments-by-function
```

## Evidence Management

Evidence is stored as JSONB arrays in `evidence_links` columns:

```typescript
evidence_links: [
  {
    file_id: number,
    file_name: string,
    uploaded_at: string,
    uploaded_by: number
  }
]
```

### Upload Pattern

Evidence files are uploaded via multipart form data to save endpoints:
- `PATCH /iso-42001/saveClauses/:id`
- `PATCH /nist-ai-rmf/subcategories/:id`
- `PATCH /eu-ai-act/saveControls/:id`

## Frontend Structure

### Framework Dashboard

**Location:** `pages/Framework/`

**Components:**
- `FrameworkProgressCard` - Overall completion
- `AnnexOverviewCard` - Annex/category overview
- `ControlCategoriesCard` - Category breakdown
- `AssignmentStatusCard` - Assignment tracking
- `NISTFunctionsOverviewCard` - NIST function breakdown
- `StatusBreakdownCard` - Status distribution

### Framework Views

| View | Location |
|------|----------|
| ISO 42001 Clauses | `Framework/ISO42001/Clause/` |
| ISO 42001 Annexes | `Framework/ISO42001/Annex/` |
| ISO 27001 Clauses | `Framework/ISO27001/Clause/` |
| ISO 27001 Annexes | `Framework/ISO27001/Annex/` |
| NIST Functions | `Framework/NIST-AI-RMF/` |
| EU AI Act | `Framework/EU-AI-Act/` |
| Framework Risks | `Framework/FrameworkRisks/` |

### View Features

- Hierarchical navigation
- Status indicators
- Implementation detail editor
- Evidence upload
- Assignment UI
- Due date picker
- Workflow status buttons
- Auditor feedback

## Adding Framework to Project

### Request

```typescript
POST /frameworks/toProject?frameworkId=2&projectId=5
```

### Process

`Servers/controllers/framework.ctrl.ts` → `Servers/utils/framework.utils.ts`:

1. Reject the change if the use case has a pending approval request ("This use case has a pending approval request and cannot be modified until the approval process is complete.").
2. Reject a framework that is already on the project.
3. Reject a mismatch between `frameworks.is_organizational` and `projects.is_organizational`. Organizational frameworks only go on the organizational project, and use-case frameworks only on use cases.
4. Insert the `projects_frameworks` row.
5. Call `frameworkAdditionMap[frameworkId]` (`Servers/types/framework.type.ts`). This creates the per-project implementation rows with status "Not started".

The routes only require authentication. The "manage frameworks" restriction (Admin, Editor) is applied in the client through the `frameworks.manage` permission.

### Remove Framework

```typescript
DELETE /frameworks/fromProject?frameworkId=2&projectId=5
```

Calls `frameworkDeletionMap[frameworkId]` and deletes all of that project's implementation data for the framework (status, assignments, risk links, evidence links). The UI asks for confirmation ("Confirm framework removal") first.

## Bundled frameworks (ids 5–28)

These frameworks shipped as plugins until PR #4443 (August 2026). They are now core and are declared in TypeScript:

- `Servers/structures/<Name>/<key>.structure.ts`: one file per framework (`FrameworkStructure`, see `Servers/structures/types.ts`)
- `Servers/structures/index.ts`: `FRAMEWORK_STRUCTURES`, `getStructureById`, `getStructureByKey`, `requireStructureByKey`
- Migrations `20260805125946-create-framework-struct-tables.js` (frameworks row + struct tables + seed), `20260805130326-create-framework-impl-tables.js` (impl + `__risks` tables) and `20260805131033-migrate-framework-data.js` (copied data from the legacy `custom_framework_*` tables, which were kept)

### Catalog

Names and flags come from each structure's `seed.name` and `seed.is_organizational`.

**Organization-level (14)**: added under **Frameworks → Manage frameworks → Add/remove frameworks**

| ID | Key | Name | Levels |
|----|-----|------|--------|
| 5 | `soc2` | SOC 2 Type II Framework | 2 |
| 6 | `gdpr` | GDPR Compliance Framework | 2 |
| 8 | `ccpa` | CCPA Compliance Framework | 2 |
| 9 | `dora` | DORA Compliance Framework | 2 |
| 13 | `cis-controls` | CIS Controls v8 | 2 |
| 16 | `data-governance` | Data Governance Framework | 2 |
| 17 | `uae-pdpl` | UAE Personal Data Protection Law | 2 |
| 18 | `saudi-pdpl` | Saudi Arabia Personal Data Protection Law | 2 |
| 19 | `qatar-pdpl` | Qatar Personal Data Privacy Law | 2 |
| 20 | `bahrain-pdpl` | Bahrain Personal Data Protection Law | 2 |
| 21 | `quebec-law25` | Quebec Law 25 Compliance Framework | 2 |
| 25 | `nist-csf` | NIST Cybersecurity Framework | 3 |
| 26 | `osfi-e23` | OSFI E-23 Model Risk Management | 2 |
| 27 | `en-18286` | EN 18286 | 2 |

**Use-case-level (10)**: added from a use case's **Frameworks/regulations** tab

| ID | Key | Name | Levels |
|----|-----|------|--------|
| 7 | `pci-dss` | PCI-DSS Lite Framework | 2 |
| 10 | `altai` | ALTAI - Assessment List for Trustworthy AI | 2 |
| 11 | `ftc-ai-guidelines` | FTC AI Guidelines | 2 |
| 12 | `nyc-local-law-144` | NYC Local Law 144 - Automated Employment Decision Tools | 2 |
| 14 | `ai-ethics` | AI Ethics & Governance Framework | 2 |
| 15 | `oecd-ai-principles` | OECD AI Principles | 2 |
| 22 | `texas-ai-act` | Texas Responsible AI Governance Act Framework | 2 |
| 23 | `colorado-ai-act` | Colorado Artificial Intelligence Act Framework | 2 |
| 24 | `hipaa` | HIPAA Security Rule Framework | 3 |
| 28 | `en-18286-ai-systems` | EN 18286 AI systems | 2 |

Total: 4 core + 24 bundled = **28 frameworks**.

EN 18286 is split into two frameworks: `en-18286` (id 27, organization level: clauses 4–7, 9.6, 9.7 and 10) and `en-18286-ai-systems` (id 28, use-case level: clause 8 and 9.1–9.5, tracked per AI system). The standard defines one QMS; the split follows the organization / AI system division Modulos uses. Both were added after the August 2026 migrations, by `20261110121006-add-en-18286-framework.js`, which skips each framework whose `frameworks` row the `20260805*` migrations already created.

### Tables

Each structure names its own tables. SOC 2, for example, uses `soc2_trust_service_categories_struct` → `soc2_controls_struct` (global structure), `soc2_controls` (per org/project implementation) and `soc2_controls__risks` (risk junction). Three-level frameworks add an `l3_struct`, `l3_impl` and `l3_risks` table. Implementation status values match the ISO frameworks: Not started, Draft, In progress, Awaiting review, Awaiting approval, Implemented, Audited, Needs rework.

Evidence is stored in `file_entity_links` with `framework_type` set to the structure's `framework_type` (e.g. `soc2`, `nyc_local_law_144`) and `entity_type` from `entity_types`.

### Generic endpoints

Adding and removing use the shared `POST /api/frameworks/toProject` and `DELETE /api/frameworks/fromProject`. `Servers/utils/frameworkRegistry.utils.ts` provides `makeCreate(key)` / `makeDelete(key)`, which are wired into `frameworkAdditionMap` / `frameworkDeletionMap`.

A bundled framework picked when a use case or the organizational project is created is built the same way, at creation or, with an approval workflow, when the request is approved. Creation, approval and "add framework" all go through `buildProjectFrameworkQuery` (`Servers/utils/framework.utils.ts`), which calls `frameworkAdditionMap`; see [Use cases](./use-cases.md#processing). The builders are not idempotent (each call inserts a full set of rows), so they only run right after the `projects_frameworks` row is inserted. Links created before this, with no implementation rows, are built by migration `20261117140851-build-empty-bundled-frameworks.js`, which only touches links that have no level-2 rows.

Implementation work goes through `Servers/routes/frameworkImpl.route.ts`, mounted at `/api/frameworks` next to `frameworks.route.ts`. It is handled by `Servers/controllers/frameworkImpl.ctrl.ts` and `Servers/utils/frameworkImpl.utils.ts`. All routes require JWT. `:level` is `l2` or `l3`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/frameworks/:frameworkId/tree/:projectId` | Full L1 → L2 (→ L3) tree with implementation rows for the project |
| GET | `/api/frameworks/:frameworkId/dashboard/:projectFrameworkId` | Progress summary |
| GET | `/api/frameworks/:frameworkId/impl/:level/:id` | One implementation row |
| GET | `/api/frameworks/:frameworkId/impl/:level/:id/risks` | Linked risks |
| PATCH | `/api/frameworks/:frameworkId/impl/:level/:id` | Multipart. Fields: `status`, `implementation_description`, `owner`, `reviewer`, `approver`, `due_date`, `auditor_feedback`, `risksMitigated` / `risksDelete` (JSON number arrays). Uploaded files become evidence in `file_entity_links`. |

Table and column names are resolved from the structure by `frameworkId`. Invalid parameters return 400. A framework id or level the structure doesn't define returns 404.

### Generic UI

| Piece | Path |
|-------|------|
| Page | `Clients/src/presentation/pages/Framework/Generic/index.tsx` (`GenericFramework`). Also routed at `/projects/:projectId/framework/:frameworkId`, and embedded in the Frameworks page and the use-case Frameworks/regulations tab. |
| Drawer | `Clients/src/presentation/components/Drawer/GenericFrameworkDrawer/`: Details, Evidence, Cross mappings and Notes tabs |
| Dashboard card | `Clients/src/presentation/pages/Framework/Dashboard/GenericFrameworkOverviewCard.tsx` |
| Badges | `Clients/public/assets/badges/*.svg` via `Clients/src/presentation/tools/frameworkBadge.ts` (keyed by exact framework name) |

The **Notes** tab uses `notesAttachedTo = "<FRAMEWORK_TYPE>_<ENTITY_TYPE>"` (e.g. `SOC2_CONTROL`). Its values come from `NotesAttachedToEnum` in `Servers/domain.layer/models/notes/notes.model.ts`.

### Reporting

Generated reports cover bundled frameworks (ids 5–28) through the `frameworkRequirements` section: per framework, requirement progress by group with owners, due dates and evidence. See [Reporting](./reporting.md#framework-requirements-section). Imported (Excel) frameworks are not covered.

### Known gaps

- The Frameworks page **Settings** tab (`Clients/src/presentation/pages/Framework/Settings/index.tsx`) only offers ISO 27001, ISO 42001 and NIST AI RMF. Organizational bundled frameworks are added through **Manage frameworks → Add/remove frameworks**.
- The legacy `custom_framework_*` tables are still in the database. `GET /api/extensions/jira-assets/projects/:projectId/custom-frameworks-progress` still reads them.

## Imported frameworks

An organization with the `framework-import` extension enabled imports its own framework from Excel (`POST /api/v1/framework-import/import`), then adds it to a use case and assesses it with the same page and drawer as the bundled frameworks (#5254).

The imported frameworks list, with **Import from Excel** and **Delete**, is on the Frameworks page **Settings** tab (`pages/Framework/Settings/ImportedFrameworksSettings.tsx`), shown only while the extension is enabled. **Manage frameworks → Import framework from Excel** on the Frameworks page opens the same import dialog.

### Storage

Imported frameworks never enter `frameworks` or `projects_frameworks`. Those tables hold the global bundled catalog, and ids 26+ are kept for future bundled frameworks. Every table below carries `organization_id` and the `tenant_isolation` RLS policy.

| Table | Holds |
|-------|-------|
| `imported_frameworks` | One row per imported framework per organization (`is_active`) |
| `imported_framework_topics`, `imported_framework_subtopics` | The structure. `is_retired` marks an item a re-import dropped but a use case had assessed. |
| `projects_imported_frameworks` | Use case ↔ imported framework link. FK to the framework is RESTRICT. |
| `imported_framework_topic_impl` (L2), `imported_framework_subtopic_impl` (L3) | One assessment row per topic / subtopic per link. Same columns and status values as the bundled impl tables; FKs to topics / subtopics are RESTRICT. |
| `imported_framework_topic_impl__risks`, `imported_framework_subtopic_impl__risks` | Linked risks |

Migrations: `20261111092002-imported-framework-storage.js`, `20261111094001-imported-framework-assessment.js`.

The hierarchy is three-level: L1 is the imported framework itself (one group node, no status), L2 the topics and L3 the subtopics. A topic with no subtopics is assessed at L2. Evidence is stored in `file_entity_links` with `framework_type = 'imported'` and `entity_type` `imported_topic` / `imported_subtopic`; uploads get the file source "Imported framework items".

### Endpoints

`Servers/routes/v1/importedFrameworkAssessment.route.ts`, mounted at `/api/v1/imported-framework-assessments`; controller and service in `Servers/extensions/framework-import/importedAssessment.{ctrl,service}.ts`. All routes need a token and access to the use case (403 otherwise). Another organization's ids are 404 and ids that are not positive integers are 400.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/:projectId` | Imported frameworks on the use case |
| POST | `/projects/:projectId` | Attach `{ imported_framework_id }`. Needs `useCase.edit` and the extension enabled. 400 for the organizational project or an inactive import, 403 while an approval request is pending, 409 if already attached. Seeds an assessment row ("Not started") for every non-retired topic and subtopic in the same transaction. |
| DELETE | `/projects/:projectId/:linkId` | Detach. Needs `useCase.edit`. Deletes the link's assessment data and evidence links. 403 while an approval request is pending. |
| GET | `/links/:linkId/tree` | Same shape as the bundled tree (`framework.framework_type = "imported"`, `hierarchy_type = "three_level"`). Nodes also carry `number` (the spreadsheet number) and `retired`. |
| GET | `/links/:linkId/dashboard` | Same counts as the bundled dashboard, over the rows the tree shows |
| GET / PATCH | `/links/:linkId/impl/:level/:implId` | `:level` is `l2` or `l3`. PATCH takes the bundled multipart fields. Owner, reviewer and approver must be organization members; status must be one of the eight values. |
| GET / PUT | `/links/:linkId/impl/:level/:implId/risks` | Linked risks. PUT `{ risk_ids }` replaces them. A newly linked risk must belong to the use case. |

Reading and assessing keep working when the extension is turned off; only attaching needs it. Assessing needs access to the use case, like the bundled impl PATCH.

### Re-import and delete

Re-importing a framework with the same name updates it in place. Topics match on topic number, subtopics on topic + subtopic number. Matched items take the new name, description and order, new items get assessment rows on every attached use case, and items missing from the file are retired if any use case holds data on them (a status other than "Not started", text, people, a due date, evidence or a linked risk) or deleted otherwise. A retired item that comes back is un-retired. The import result reports `added`, `updated`, `retired` and `removed`. Retired items stay in a use case's tree, flagged, only where that use case has data on them.

An imported framework cannot be deleted while a use case uses it: the delete answers 409 and lists the use cases in `use_cases`. Setting `is_active = false` only hides it from the attach picker; attached use cases keep it. Deleting a use case removes its imported framework links and their evidence links (`Servers/utils/project.utils.ts`). The project payload lists them in `imported_frameworks: [{ project_imported_framework_id, imported_framework_id, name }]`.

### Not covered

- Imported frameworks attach to use cases only, not to the organizational project, and are not part of the use case defaults (`default_framework_ids`).
- Reports do not include them (bundled frameworks 5–28 are not in reports either).
- The drawer has no Notes tab for them: `NotesAttachedToEnum` has no imported values.

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/frameworks/` | Core models |
| `domain.layer/frameworks/ISO-42001/` | ISO 42001 models |
| `domain.layer/frameworks/ISO-27001/` | ISO 27001 models |
| `domain.layer/frameworks/NIST-AI-RMF/` | NIST models |
| `domain.layer/frameworks/EU-AI-Act/` | EU AI Act models |
| `utils/framework.utils.ts` | Framework queries |
| `utils/iso42001.utils.ts` | ISO 42001 queries |
| `utils/nistAiRmfCorrect.utils.ts` | NIST queries |
| `utils/eu.utils.ts` | EU AI Act queries |
| `routes/iso-42001.route.ts` | ISO 42001 routes |
| `routes/nist-ai-rmf.route.ts` | NIST routes |
| `routes/eu-ai-act.route.ts` | EU AI Act routes |
| `structures/index.ts`, `structures/<Name>/*.structure.ts` | Bundled framework registry (ids 5–28) |
| `utils/frameworkRegistry.utils.ts` | Add/remove bundled frameworks on a project |
| `routes/frameworkImpl.route.ts`, `controllers/frameworkImpl.ctrl.ts`, `utils/frameworkImpl.utils.ts` | Generic implementation endpoints |
| `types/framework.type.ts` | `frameworkAdditionMap` / `frameworkDeletionMap` by framework id |
| `extensions/framework-import/frameworkImport.service.ts` | Import, re-import diff, list / rename / delete imported frameworks |
| `extensions/framework-import/importedAssessment.service.ts`, `importedAssessment.ctrl.ts`, `routes/v1/importedFrameworkAssessment.route.ts` | Imported frameworks on use cases: attach, tree, dashboard, assessment rows |

### Frontend

| File | Purpose |
|------|---------|
| `pages/Framework/index.tsx` | Main dashboard |
| `pages/Framework/Dashboard/` | Dashboard components |
| `pages/Framework/ISO42001/` | ISO 42001 views |
| `pages/Framework/NIST-AI-RMF/` | NIST views |
| `utils/frameworkDataUtils.ts` | Data utilities |
| `constants/frameworks.ts` | Framework constants |
| `pages/Framework/Generic/` | Generic framework page (bundled frameworks) |
| `components/Drawer/GenericFrameworkDrawer/` | Generic requirement drawer |
| `pages/ProjectView/AddNewFramework/` | "AI Frameworks" add/remove modal |

## Related Documentation

- [Use Cases](./use-cases.md)
- [Risk Management](./risk-management.md)
- [Evidence](./evidence.md)
- [Adding New Framework Guide](../guides/adding-new-framework.md)
