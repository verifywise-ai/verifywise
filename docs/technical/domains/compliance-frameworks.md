# Compliance Frameworks Domain

## Overview

VerifyWise ships 25 compliance frameworks, all available to every organization. None of them needs to be installed or enabled.

- **4 core frameworks** (ids 1–4): EU AI Act, ISO 42001, ISO 27001 and NIST AI RMF. Each has hand-built tables, endpoints and pages. Most of this document describes these.
- **21 bundled frameworks** (ids 5–25): SOC 2, GDPR, HIPAA and others. They are declared in the structure registry (`Servers/structures/`) and served by generic endpoints and a generic UI. See [Bundled frameworks (ids 5–25)](#bundled-frameworks-ids-525).

All frameworks share the same patterns for progress tracking, status management and risk linking. Users cannot create, import or export their own frameworks. New frameworks are added in code. See [Adding a New Compliance Framework](../guides/adding-new-framework.md).

## Supported Frameworks

| Framework | ID | Purpose |
|-----------|-----|---------|
| EU AI Act | 1 | European AI regulation |
| ISO 42001 | 2 | AI management system |
| ISO 27001 | 3 | Information security management |
| NIST AI RMF | 4 | AI risk management |
| 21 bundled frameworks | 5–25 | See [Bundled frameworks](#bundled-frameworks-ids-525) |

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

## Bundled frameworks (ids 5–25)

These frameworks shipped as plugins until PR #4443 (August 2026). They are now core and are declared in TypeScript:

- `Servers/structures/<Name>/<key>.structure.ts`: one file per framework (`FrameworkStructure`, see `Servers/structures/types.ts`)
- `Servers/structures/index.ts`: `FRAMEWORK_STRUCTURES`, `getStructureById`, `getStructureByKey`, `requireStructureByKey`
- Migrations `20260805125946-create-framework-struct-tables.js` (frameworks row + struct tables + seed), `20260805130326-create-framework-impl-tables.js` (impl + `__risks` tables) and `20260805131033-migrate-framework-data.js` (copied data from the legacy `custom_framework_*` tables, which were kept)

### Catalog

Names and flags come from each structure's `seed.name` and `seed.is_organizational`.

**Organization-level (12)**: added under **Frameworks → Manage frameworks → Add/remove frameworks**

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

**Use-case-level (9)**: added from a use case's **Frameworks/regulations** tab

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

Total: 4 core + 21 bundled = **25 frameworks**.

### Tables

Each structure names its own tables. SOC 2, for example, uses `soc2_trust_service_categories_struct` → `soc2_controls_struct` (global structure), `soc2_controls` (per org/project implementation) and `soc2_controls__risks` (risk junction). Three-level frameworks add an `l3_struct`, `l3_impl` and `l3_risks` table. Implementation status values match the ISO frameworks: Not started, Draft, In progress, Awaiting review, Awaiting approval, Implemented, Audited, Needs rework.

Evidence is stored in `file_entity_links` with `framework_type` set to the structure's `framework_type` (e.g. `soc2`, `nyc_local_law_144`) and `entity_type` from `entity_types`.

### Generic endpoints

Adding and removing use the shared `POST /api/frameworks/toProject` and `DELETE /api/frameworks/fromProject`. `Servers/utils/frameworkRegistry.utils.ts` provides `makeCreate(key)` / `makeDelete(key)`, which are wired into `frameworkAdditionMap` / `frameworkDeletionMap`.

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

### Reporting limitation

Generated reports cover only the four core frameworks. `Servers/services/reporting/dataCollector.ts` builds framework sections for ids 1–4 only. A bundled framework on a project adds no framework section to a report. See [Reporting](./reporting.md).

### Known gaps

- The Frameworks page **Settings** tab (`Clients/src/presentation/pages/Framework/Settings/index.tsx`) only offers ISO 27001, ISO 42001 and NIST AI RMF. Organizational bundled frameworks are added through **Manage frameworks → Add/remove frameworks**.
- The legacy `custom_framework_*` tables are still in the database. `GET /api/extensions/jira-assets/projects/:projectId/custom-frameworks-progress` still reads them.

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
| `structures/index.ts`, `structures/<Name>/*.structure.ts` | Bundled framework registry (ids 5–25) |
| `utils/frameworkRegistry.utils.ts` | Add/remove bundled frameworks on a project |
| `routes/frameworkImpl.route.ts`, `controllers/frameworkImpl.ctrl.ts`, `utils/frameworkImpl.utils.ts` | Generic implementation endpoints |
| `types/framework.type.ts` | `frameworkAdditionMap` / `frameworkDeletionMap` by framework id |

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
