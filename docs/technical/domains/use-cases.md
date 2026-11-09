# Use Cases Domain

## Overview

A **Use Case** (internally called a **Project**) represents a discrete AI system or application that requires compliance assessment against governance frameworks. Each use case is uniquely identified by a `UC-ID` (e.g., "UC-1", "UC-2") and serves as the container for risks, vendors, models, and framework-specific compliance controls.

## Key Concepts

### What is a Use Case?

A Use Case in VerifyWise represents:
- An AI system requiring compliance assessment
- A container for risks, vendors, and models
- The primary entity for framework compliance tracking
- A collaborative workspace with stakeholder assignments

### Use Case ID (UC-ID)

Each use case receives a unique identifier generated from a database sequence:
- Format: `UC-{number}` (e.g., "UC-1", "UC-2", "UC-15")
- Auto-generated on creation
- Tenant-specific sequence
- Cannot be modified after creation

## Database Schema

### Projects Table

```
projects
├── id (PK)
├── uc_id (UNIQUE)           # Auto-generated UC-ID
├── project_title            # Display name
├── owner (FK → users)       # Project owner; NULL for an external owner
├── external_owner_name      # Owner with no account (#5256)
├── external_owner_email     # Lowercase; email notices only
├── start_date
├── geography
├── ai_risk_classification   # PROHIBITED, HIGH_RISK, LIMITED_RISK, MINIMAL_RISK
├── high_risk_roles          # text[]: Provider, Deployer or both (Provider first)
├── goal
├── target_industry
├── description
├── last_updated
├── last_updated_by (FK → users)
├── is_demo                  # Demo/test project flag
├── created_at
├── is_organizational        # Org vs personal project
├── status                   # NOT_STARTED, IN_PROGRESS, etc.
├── approval_workflow_id (FK → approval_workflows)
├── pending_frameworks       # JSONB array, awaiting approval
└── enable_ai_data_insertion
```

### AI Risk Classification

```typescript
enum AiRiskClassification {
  PROHIBITED = "Prohibited"
  HIGH_RISK = "High risk"
  LIMITED_RISK = "Limited risk"
  MINIMAL_RISK = "Minimal risk"
  GPAI = "GPAI"
  GENERAL_RISK = "General Risk"
  OUT_OF_SCOPE = "Out of scope"   // set by the EU AI Act questionnaire (Article 2(6)/(8))
}
```

The EU AI Act questionnaire produces only Prohibited, High risk, Limited risk, Minimal risk and Out of scope. See [EU AI Act classification](#eu-ai-act-classification).

### High Risk Role Types

```typescript
enum HighRiskRole {
  DEPLOYER = "Deployer"
  PROVIDER = "Provider"
}
```

### Project Status

```typescript
enum ProjectStatus {
  NOT_STARTED = "Not started"
  IN_PROGRESS = "In progress"
  UNDER_REVIEW = "Under review"
  COMPLETED = "Completed"
  CLOSED = "Closed"
  ON_HOLD = "On hold"
  REJECTED = "Rejected"
}
```

## Related Tables

### Projects Members

Many-to-many relationship between users and projects.

```
projects_members
├── user_id (PK, FK → users)
├── project_id (PK, FK → projects)
└── is_demo
```

### Projects Frameworks

Links projects to compliance frameworks.

```
projects_frameworks
├── framework_id (PK, FK → frameworks)
├── project_id (PK, FK → projects)
└── is_demo
```

Supported frameworks:
1. EU AI Act (framework_id: 1)
2. ISO 42001 (framework_id: 2)
3. ISO 27001 (framework_id: 3)
4. NIST AI RMF (framework_id: 4)

## Status Workflow

```
NOT_STARTED → IN_PROGRESS → UNDER_REVIEW → COMPLETED → CLOSED
                                  ↓
                          REJECTED / ON_HOLD → IN_PROGRESS
```

### Status Transitions

| From | To | Trigger |
|------|-----|---------|
| NOT_STARTED | IN_PROGRESS | Work begins |
| IN_PROGRESS | UNDER_REVIEW | Assessment complete |
| UNDER_REVIEW | COMPLETED | Review approved |
| UNDER_REVIEW | REJECTED | Review failed |
| UNDER_REVIEW | ON_HOLD | Paused |
| ON_HOLD | IN_PROGRESS | Resumed |
| COMPLETED | CLOSED | Archived |

## Lifecycle (#5187)

`projects.lifecycle_stage` is separate from `status` (a project-management state that keeps working unchanged):

```
in_review → planned → live → retired
               └────────────────↑   (a planned use case can be retired before launch)
```

| Column | Meaning |
|--------|---------|
| `lifecycle_stage` | `in_review` / `planned` / `live` / `retired`, VARCHAR + CHECK, default `planned` |
| `go_live_date` | DATE the use case went live (today or earlier) |
| `retired_at` | When it was retired |
| `last_confirmed_at`, `last_confirmed_by` | Last "still live?" confirmation |
| `confirmation_reminded_at` | Last reminder email; dedups the daily sweep to once per period |
| `department` | Free text (there is no org-level department list) |

Backfill (migration `20261031015101`): a pending approval request → `in_review` (status `Under review` alone is not enough: intake approval set it after the review); `Closed` → `retired`; everything else → `planned` (`Completed` is not assumed to be live).

Transitions:

| Trigger | Change |
|---------|--------|
| Approval request opened (`services/projects/approvalRequest.service.ts`) | `planned → in_review` |
| Approval approved, auto-approved, rejected or withdrawn; workflow cleared or replaced (`releaseUseCaseFromReview`) | `in_review → planned` |
| Use case created (any path, incl. intake approval) | `planned`; the request body never sets the stage |
| `POST /api/v1/use-case-lifecycle/:id/go-live` | `planned → live`, sets `go_live_date`, resets the confirmation period |
| `POST /api/v1/use-case-lifecycle/:id/confirm` | live only; sets `last_confirmed_*` |
| `POST /api/v1/use-case-lifecycle/:id/retire` | `planned`/`live → retired`, sets `retired_at` |
| `PATCH /api/v1/use-case-lifecycle/:id/department` | sets `department` |

Writes are allowed for holders of `useCase.edit` and for the use case owner; Auditors never. The stage guard is part of the UPDATE, so a conflicting transition returns 409. Every change, including the automatic ones above, is recorded in `use_case_change_history`. Soft-deleting a workflow leaves its pending requests pending, so their use cases stay in review until the request is decided or withdrawn. Lifecycle columns are not accepted in legacy `POST/PATCH /api/projects` bodies; `department` on creation is only set by server code and goes through `parseDepartment`, the validator the PATCH endpoint uses.

Read models: `GET /api/v1/use-case-lifecycle/summary` (stale ids and the interval) and `GET /api/v1/use-case-lifecycle/dashboard` (went live / retired this quarter, live by department/risk tier/regulation, stale). Both use `projectVisibilitySql` (`utils/projectVisibility.utils.ts`), the rule behind the use cases list. Stage counts are computed on the client from the use cases list (`countLifecycleStages`) on both the Use cases page and the dashboard, so the two never disagree.

**Still live? check.** `lifecycle_org_settings.confirmation_interval_days` (30/90/180, default 90; `GET/PATCH /api/v1/lifecycle-settings`, PATCH needs `organization.admin`). A live use case is stale when `COALESCE(last_confirmed_at, go_live_date)` is older than the interval (`staleSql` in `utils/lifecycle.utils.ts`). The `lifecycle_confirmation_sweep` BullMQ job (daily 06:30) emails each owner once per period (`lifecycle-confirmation-due.mjml`).

**Intake requests in review (#5188).** Pending use case intake submissions have no project until approval, so `GET /api/v1/use-case-lifecycle/intake-submissions` lists them from `intake_submissions` (status `pending`, entity type `use_case`; approved, rejected and superseded never appear). The response is `{ total, items, limit }`: `total` counts every pending request, `items` holds the oldest 500. Each item has the title (read from the field each form maps to `project_title`; schemas are read once per form, not sent per row), form name, submitter name, `submitted_at` and whole `days_in_review`, both measured from the first submission of its resubmission chain (`original_submission_id`, walked recursively). The In review tab and the dashboard both count `total` through `useUseCaseStageCounts`; the requests table sits under the list toolbar, follows its search (title, form, submitter), is not exported, and links each row to `/intake-forms/submissions?submission=<id>`. The dashboard response carries `review_time` (approved use case submissions, first submission → approval, last 12 months: count, median and average days); non-admins only count submissions whose created use case they can see (`projectVisibilitySql`). Comparing it with an agreed review time waits for #5189's per-form setting.

**AI apps (#5193).** `LIFECYCLE_ENTITIES.ai_app` reuses the columns (no `department`; AI apps keep `ai_apps_departments`), the shared `lifecycle_org_settings` interval, the daily sweep and `controllers/lifecycle.ctrl.ts` (`lifecycleActionHandlers`). Routes: `GET /api/v1/ai-apps` (legacy list plus lifecycle columns and `?lifecycle_stage=`; `/api/ai-apps` is unchanged), `/api/v1/ai-app-lifecycle/summary` (server counts: the AI apps list is paged), `/:id`, `/:id/history` (`ai_app_change_history`), and `/:id/go-live|retire|confirm` (`aiApp.edit` or owner, never Auditors). Going live also needs status `approved` or `restricted` (`goLiveCondition` on the entity config; a planned draft gets 409 "Approve this AI app before marking it as live"; `GET /:id` returns `can_go_live` from the same condition, and setting a live app back to draft moves it to planned). Pending AI app intake requests: `GET /api/v1/ai-app-lifecycle/intake-submissions`, the same `getPendingIntakeSubmissions` as use cases (title from the field mapped to `name`), counted in and listed on the AI apps In review tab (hidden under a status filter). Backfill: `under_review` → in review, `banned` → retired, else planned. After that, `syncAiAppStageWithStatus` (called by `createAiAppQuery` and `updateAiAppByIdQuery`, so every status change) keeps it in step: under_review → in review (from planned); leaving under_review → planned (if still in review); banned → retired (sets `retired_at`, records history, ends still-live checks). The AI apps page pages, sorts and searches on the server per tab (`GET /api/v1/ai-apps?lifecycle_stage=&search=&page=&limit=&sortBy=&order=`).

**Reuse.** Everything is keyed by `LIFECYCLE_ENTITIES` in `utils/lifecycle.utils.ts`; AI apps add an entry and the same columns. The frontend `LifecycleTabs` takes `extraCounts` for rows that are not entities yet (pending intake submissions in In review, #5188).

## API Endpoints

### CRUD Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | Get all projects |
| GET | `/projects/:id` | Get project by ID |
| POST | `/projects` | Create project |
| PATCH | `/projects/:id` | Update project |
| PATCH | `/projects/:id/status` | Update status |
| DELETE | `/projects/:id` | Delete project |

### Progress Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/stats/:id` | Get statistics |
| GET | `/projects/compliance/progress/:id` | Compliance progress |
| GET | `/projects/assessment/progress/:id` | Assessment progress |
| GET | `/projects/all/compliance/progress` | All compliance |
| GET | `/projects/all/assessment/progress` | All assessment |

### Risk Calculation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/calculateProjectRisks/:id` | Project risks |
| GET | `/projects/calculateVendorRisks/:id` | Vendor risks |

### Access to a single use case

A permission such as `useCase.edit` says what a role may do, not on which use case. `requireProjectAccess` (`middleware/projectAccess.middleware.ts`) adds the use case: the caller must be an Admin, its owner or a member, the rule that scopes the use case list (`projectVisibilitySql`). It runs after authentication and param validation.

| Guarded route |
|---------------|
| `DELETE /api/projects/:id` |
| `PATCH /api/projects/:id/status` |
| `POST /api/projects/:id/eu-ai-act-classification` |
| `GET /api/projects/stats/:id` |
| `POST /api/v1/use-case-lifecycle/:id/go-live`, `/retire`, `/confirm` |
| `PATCH /api/v1/use-case-lifecycle/:id/department` |

- **No access:** 403 with "Access denied", logged with `logFailure`, nothing written. A refused write also reaches the event log; a refused `GET` only reaches the file log, because `logFailure` skips the event log for `Read`. Never use a detail listed in `SESSION_DENIED_DETAILS` (`customAxios.ts`): those end the user's session.
- **Not found or another organization:** passed on, so the controller answers its 404.
- **An error in the check:** 500, never allowed.
- **Adds to route rules, does not replace them.** The lifecycle rule (`useCase.edit` or owner, Auditors never) and the `useCase.edit` / `useCase.classify` checks still apply.
- **`PATCH /api/projects/:id` and `PATCH /api/v1/projects/:id`** keep their own check in `updateProjectById` (`canViewProjectQuery`), inside the update's transaction.
- **`GET /api/projects/:id` is not guarded.** A task can be assigned to anyone in the organization and linked to an EU AI Act requirement; its email links to `/project-view`, which needs this read, and EU AI Act requirements have no page outside the use case. Scoping the read needs a decision on those users first. A refused or failed load shows the empty state in `ProjectView`.
- **MCP tools** call services directly and are not behind this guard.

## Create Project

### Request

```typescript
POST /projects
{
  project_title: string,           // Required
  owner?: number | null,           // User ID; required unless an external owner is given
  external_owner_name?: string,    // With external_owner_email, instead of owner (max 255)
  external_owner_email?: string,   // Valid email, stored lowercase (max 254)
  members: number[],               // Optional, user IDs
  framework: number[],             // Required, framework IDs
  start_date: Date,                // Required
  ai_risk_classification: string,  // Required
  high_risk_roles?: ("Provider" | "Deployer")[], // replaces the list; or legacy type_of_high_risk_role
  goal: string,                    // Required
  geography?: number,
  target_industry?: string,
  description?: string,
  is_organizational?: boolean,
  approval_workflow_id?: number,
  enable_ai_data_insertion?: boolean
}
```

### Processing

1. Generate unique `UC-ID` from sequence
2. Create project record
3. Assign members to project
4. **If no approval workflow:**
   - Create framework records immediately
   - Initialize framework-specific data
5. **If approval workflow set:**
   - Store frameworks in `pending_frameworks`
   - Create ApprovalRequest
   - Wait for approval before framework creation
6. Trigger `project_added` automation
7. Send email to project owner
8. Send Slack notification

### Response

```typescript
{
  project: ProjectModel,
  frameworks: { [key: string]: Object }
}
```

## Update Project

### Request

```typescript
PATCH /projects/:id
{
  project_title?: string,
  owner?: number,
  members?: number[],
  start_date?: Date,
  ai_risk_classification?: string,
  high_risk_roles?: ("Provider" | "Deployer")[] | null,
  goal?: string,
  geography?: number,
  target_industry?: string,
  description?: string,
  status?: string
}
```

### Access

The caller needs the `useCase.edit` permission and must be able to see the use case: an Admin, its owner or a member. Anyone else gets 403 and nothing is written. See [Access to a single use case](#access-to-a-single-use-case).

### Processing

1. Get current project state
2. Compare member lists (old vs new)
3. Add new members, remove deleted members
4. Notify newly added members via email
5. Record all changes in change history
6. Trigger `project_updated` automation

## Delete Project

### Cascading Deletions

When a project is deleted, the following are removed:

1. Withdraw pending approval requests
2. Record deletion in change history
3. Delete associated risks (`projects_risks`)
4. Delete members (`projects_members`)
5. Delete framework-specific data (controls, assessments)
6. Delete framework associations (`projects_frameworks`)
7. Delete associated files
8. Delete project record
9. Trigger `project_deleted` automation

## Stakeholder Management

### Project Owner

- Single user responsible for the project
- Has administrative access
- Receives project notifications
- Stored in `projects.owner` field

### External Owners

A use case can instead be owned by someone with no account (#5256): a name and email in `projects.external_owner_name` and `projects.external_owner_email`, with `owner` NULL.

- **API.** External owners exist only on `POST /api/v1/projects` and `PATCH /api/v1/projects/:id` (`routes/v1/projects.route.ts`), thin adapters over the same controllers with their own validators. Reads stay on the legacy routes. On legacy `POST /api/projects` and `PATCH /api/projects/:id` the contract is unchanged: `owner` stays required on create, `owner: null` still clears it on update, and `external_owner_*` are ignored. The router sets `res.locals.acceptsExternalOwner`; without it the controllers drop those fields. A legacy update that sets a numeric owner on an externally owned row clears the external fields, so a row never has both.
- **Either a user or an external owner, never both.** Selecting one clears the other. `utils/externalOwner.utils.ts` (`resolveOwnerForCreate`, `resolveOwnerForUpdate`) enforces this, normalises the email to lowercase and, on v1, rejects a write that would leave no owner. A partial update that does not mention ownership is left alone. `owner: null` on a row with no user owner (external, or its user was deleted) is a no-op.
- **Writing needs access to the use case.** `updateProjectById` requires being an Admin, the owner or a member, the rule that scopes the use case list, on both `PATCH /api/v1/projects/:id` and `PATCH /api/projects/:id`; `useCase.edit` alone is a 403, with no write and no email.
- **The MCP update tool skips the controller.** It is open only to super admins and organization Admins, who see every use case, and calls `updateUseCaseService` with a `SuperAdmin` role, so the service's external owner check never refuses it. That check is a backstop for any future caller that passes a narrower role.
- **Naming a new external owner resets the still-live reminder.** `confirmation_reminded_at` is cleared when the email changes, so a reminder sent to the previous owner does not delay theirs. Correcting the name of the same person does not reset it.
- **Nobody loses access when a use case moves to an external owner.** Non-Admins see a use case only as owner or member, so the previous non-Admin owner and a non-Admin who makes the change are added to `projects_members` in the same transaction, as is a non-Admin who creates a use case with an external owner.
- **No database CHECK requires an owner.** `owner` is `ON DELETE SET NULL`, so such a CHECK would make deleting a user fail. A row can therefore have neither kind of owner after its user is deleted.
- **External owners never gain access.** Every access check compares `owner` to a user id, and SQL `NULL = :userId` matches nothing. They are not in `projects_members`, and they cannot sign in.
- **Notifications are email only** (`services/externalOwnerNotification.service.ts`, template `external-owner-notice.mjml`): no in-app rows, and no link they could not open. Each email names someone to contact: on assignment, the person who assigned them; for the still-live check, the last editor of the use case, falling back to an organization Admin. A failed email never fails a save. A failed still-live reminder is not stamped and is retried the next day. Assignment emails are capped at 30 per person per organization per clock hour (UTC), counted in Redis, because the address and title are free text. Callers await `notifyExternalOwnerAssigned` before responding, since with RLS on a later query would run on the request's finished transaction; it does not wait for the mail provider. Over the cap the save still succeeds, the email is skipped and a warning is logged. If Redis is unavailable the email is sent uncounted. Still-live reminders are not capped.
- **Only the assignment notice and the still-live check reach external owners.** Task and risk assignment notices go to their own assignees and never reach an external owner. Automatic governance tasks that default to the use case owner stay unassigned for an externally owned use case. Post-market monitoring falls back from the first member to the user owner, so a cycle for an externally owned use case with no members has no stakeholder and the external owner is not notified.
- **Display:** "Name (external)" with a Mail icon in the list and overview (`components/ExternalOwner/ExternalOwnerName.tsx`).
- **Reports and automations** use "Name (external)" as the owner name.

### Project Members

Stored in `projects_members` junction table.

**Member Types:**

| Type | Access | Permissions |
|------|--------|-------------|
| Demo | Read-only | `["read_only", "demo_access"]` |
| Regular | Full | `["full_access", "read_write"]` |

### Role-Based Notifications

When members are added, they receive role-specific emails:

```typescript
roleMap = {
  1: "admin",
  2: "reviewer",
  3: "editor",
  4: "auditor"
}
```

## Entity Relationships

```
Project
├── Owner (User) ─────────────────── 1:1
├── Members (Users) ──────────────── M:N via projects_members
├── Frameworks ───────────────────── M:N via projects_frameworks
│   ├── EU AI Act
│   ├── ISO 42001
│   ├── ISO 27001
│   └── NIST AI RMF
├── Risks ────────────────────────── M:N via projects_risks
├── Vendors ──────────────────────── M:N via vendors_projects
├── Models ───────────────────────── 1:N
├── Files ────────────────────────── 1:N
├── AI Apps ──────────────────────── M:N via ai_apps_projects
├── Approval Workflow ────────────── N:1 (optional)
└── Change History ───────────────── 1:N
```

**Linked AI apps (#5259).** `ai_apps_projects` links use cases and AI apps (`utils/aiAppProject.utils.ts`). `GET /api/v1/projects/:id/ai-apps` lists a use case's AI apps; `GET /api/v1/ai-apps/:id/use-cases` lists an AI app's use cases the caller can see, plus `hidden_count` for the rest; `POST` to that path (`{ project_id }`, idempotent) and `DELETE .../:projectId` change the links. `POST /api/v1/projects/:id/create-ai-app` creates a draft AI app in one transaction, copying the title (or `{ name }`), description, `is_demo`, the models on its Linked models tab (`model_inventories_projects_frameworks` rows with no `framework_id`), and the owner when they belong to the organization, otherwise the caller (external owners leave `owner` null); `GET` on that path returns `model_count` and `caller_becomes_owner` (same owner rule as the create) for the confirmation modal. Writes need `aiApp.edit`. A use case the caller cannot see (`projectVisibilitySql`) answers 404, organizational use cases and ones whose approval is pending or rejected (`getApprovalStatusQuery`) cannot be linked (400), and a taken AI app name answers 409. Create, link and unlink are recorded in `ai_app_change_history` by `uc_id`, never title, because that history is readable by people who cannot see the use case.

## Change History

All project modifications are tracked in `use_case_change_history`:

```typescript
{
  change_id: number,
  use_case_id: number,
  user_id: number,
  field_name: string,
  old_value: string,
  new_value: string,
  change_type: "created" | "updated" | "deleted",
  timestamp: Date
}
```

### Tracked Changes

- Project creation with initial values
- Field modifications (old → new value)
- Status changes
- Member additions/removals
- Framework additions
- Project deletion

## Automation Triggers

| Trigger | Event | Actions |
|---------|-------|---------|
| `project_added` | Create | Email, Slack, custom |
| `project_updated` | Update | Email, Slack, custom |
| `project_deleted` | Delete | Email, Slack, custom |

### Available Variables

Automations can use these template variables:
- Project title, owner name
- Creation/update date
- Risk classification
- Target industry
- Framework information
- Use case ID

## Frontend Structure

### Project View Page

**Location:** `Clients/src/presentation/pages/ProjectView/`

**Tabs:**

1. **Overview** - Summary, statistics, progress
2. **Risks** - Risk identification and analysis
3. **Frameworks/regulations** - Per-framework compliance tracking (see below)
4. **Project Settings** - Metadata, members, frameworks
5. **Activity** - Change history audit trail
6. **Post-Market Monitoring** - Ongoing monitoring config

#### Frameworks/regulations sub-tabs

`ProjectFrameworks` renders one framework at a time (selected with the framework toggle) and splits it into sub-tabs:

| Sub-tab | Value | Shown for |
|---------|-------|-----------|
| Requirements | `compliance` | All frameworks |
| Assessments | `assessment` | EU AI Act — the only framework with an assessment tracker |
| AI readiness | `readiness` | Frameworks in `READINESS_FRAMEWORK_TYPES` (EU AI Act, ISO 42001) |

A sub-tab is only rendered when the selected framework has a panel for it, and selecting a framework
that doesn't (or deep-linking to it with `?subtab=`) falls back to Requirements, so the panel area is
never blank. The active sub-tab can be deep-linked with the `?subtab=` query parameter.

**AI readiness** renders `pages/ReadinessDashboard` scoped to the use case and the selected framework
(`projectId` + `frameworkType` props). In this scoped mode the dashboard hides its own framework tabs,
shows a single framework score card, and "Calculate readiness" recalculates only that framework for that
use case. Rendered without props (the org-wide dashboard tab), behaviour is unchanged.
Readiness types are mapped from the framework **name** — the backend falls back to EU AI Act controls for
unknown types, so unmapped frameworks must not expose the tab.

### Key Components

| Component | Purpose |
|-----------|---------|
| `ProjectView/index.tsx` | Main tab container |
| `ProjectView/ProjectFrameworks` | Frameworks/regulations tab |
| `ProjectView/RisksView` | Risk management tab |
| `ProjectView/ProjectSettings` | Settings form |
| `ProjectView/Activity` | Change history |
| `ProjectView/AddNewFramework` | Framework modal |

## Client-Side Services

### Repository

```typescript
// Clients/src/application/repository/project.repository.ts

getAllProjects({signal?})
getProjectById({id, signal?})
createProject({body})
updateProject({id, body})
deleteProject({id})
getProjectProgressData({routeUrl, signal?})
```

### DTOs

```typescript
// CreateProjectDTO
{
  project_title: string,
  owner: number,
  members: ProjectMemberDTO[],
  start_date: string,
  ai_risk_classification: number,
  high_risk_roles?: HighRiskRole[],
  goal: string,
  framework_type?: string,
  geography?: number,
  target_industry?: string,
  description?: string,
  enable_ai_data_insertion?: boolean
}

// ProjectResponseDTO
{
  id: number,
  uc_id: string,
  project_title: string,
  owner: number,
  members: number[],
  framework: ProjectFrameworkDTO[],
  doneSubcontrols?: number,
  totalSubcontrols?: number,
  answeredAssessments?: number,
  totalAssessments?: number
  // ...other fields
}
```

## High-risk roles

A use case holds its EU AI Act roles in `projects.high_risk_roles` (`TEXT[] NOT NULL DEFAULT '{}'`, CHECK: only `Provider` and `Deployer`). It is stored normalised: no duplicates, Provider first. All role logic lives in `Servers/utils/highRiskRoles.utils.ts` (frontend mirror: `Clients/src/application/utils/highRiskRoles.ts`).

- **API read:** project responses carry `high_risk_roles` and the deprecated, derived `type_of_high_risk_role`: `Provider` when the list contains Provider, `Deployer` when it contains only Deployer, `null` when empty. Rows read with `SELECT *` go through `withLegacyHighRiskRole` so readers of the old name do not silently get `undefined`.
- **API write:** `high_risk_roles` replaces the list. `type_of_high_risk_role: X` keeps the list when it already holds X (a client writing back the derived value cannot drop a role), otherwise sets `[X]`; `null` clears. Both fields present and disagreeing → 400.
- **SQL:** arrays are bound with `highRiskRolesArraySql` — `ARRAY[:name]::text[]`, or the literal `'{}'::text[]` for an empty list (Sequelize would bind `[]` as `NULL`).
- **Requirements filter:** `getVisibleEuCategoryIdsForProject` shows a High risk or GPAI category when its role is any of the use case's roles (`r.name = ANY(...)`); no roles shows none of those categories.
- **Questionnaire:** the role question is a multi-select. Answers saved when it was single-select (`role: "deployer"`) still validate (`acceptsSingleValue`) and are read as a one-item list. Results carry `roles` and the derived `role`.
- **Intake:** a select or multi-select question mapped to `type_of_high_risk_role` is matched option by option (label or value, case-insensitive); unmatched options are shown to the reviewer.

## EU AI Act classification

A server-scored questionnaire that sets a use case's `ai_risk_classification` (and `high_risk_roles` when the answers name a role). It is used by the use case risk wizard (`ProjectView/RiskAnalysisModal`) and by the optional risk step on use case intake forms. The client only renders the definition and decides which questions are visible; scoring always happens on the server.

### Module

`Servers/services/euAiActClassification/`

| File | Purpose |
|------|---------|
| `types.ts` | `Questionnaire`, `Question`, `Condition`, `Answers`, `ClassificationResult` |
| `questionnaire.v2.ts` | Version 2 questions: Article 2 scope, role, Article 5 practices, Annex I, Annex III areas and follow-ups, Article 6(3) profiling and exemptions, Article 50 |
| `score.v2.ts` | `scoreV2(answers, now)`: level, role, reasons and obligations, each with article and `appliesFrom` date |
| `registry.ts` | `CURRENT_QUESTIONNAIRE_VERSION`, `getQuestionnaire(version)`, `scoreClassification(version, answers, now)` |
| `visibility.ts` | `visibleQuestions()` from declarative `showWhen` groups (mirrored in `Clients/src/application/utils/euAiActQuestionnaire.ts`) |
| `validate.ts` | `validateAnswers()`: rejects unknown questions and invalid options, drops answers to hidden questions |
| `intakeStep.ts` | `prepareIntakeRiskStep()` for public intake submissions |

Annex III follow-up questions (`*_use`) are multi-select. The system is high risk when any selected use is in `ANNEX_III_HIGH_RISK_USES`; "Another use in this area" alone does not make it high risk.

High-risk obligations depend on the route that matched: Annex I Section B gets only the sectoral-legislation obligation (Article 2(2), Articles 102-109); Annex I Section A has no Article 49 registration and uses the sectoral conformity procedure (Article 43(3)); Annex III point 2 registers at national level (Article 49(5)) and has no Article 27 assessment; other Annex III routes, including real-time biometric identification for an authorised objective, register under Article 49(1). Deployer Articles 26(11) and 27 apply only on Annex III routes. Each obligation carries its own route's date, and obligations shared by several routes are listed once. The Article 6(3) exemption counts only when no other route makes the system high risk.

### Versioning rule

A stored run is always re-scored with the rules of the version it was answered under. To change questions or scoring, add `questionnaire.vN.ts` and `score.vN.ts`, register both in `registry.ts` and raise `CURRENT_QUESTIONNAIRE_VERSION`. Keep the old files: existing runs still reference them. A run whose version is no longer registered shows no panel in the intake review, and approving that submission behaves as if it had no run.

When you add `questionnaire.vN.ts` and `score.vN.ts`, also add both files to the `SOURCE` list in `Clients/src/i18n/__tests__/euAiActQuestionnaire.translations.test.ts`. That test reads the files by name, so strings in a new version are otherwise never checked for translations.

User-facing text in both files must be whole string literals on `text`, `label`, `description` or `help` (no template strings). The DOM translator matches them against `Clients/src/i18n/translations.ts`, and `Clients/src/i18n/__tests__/euAiActQuestionnaire.translations.test.ts` fails when one lacks a de, fr or es entry.

### Table `eu_ai_act_classifications`

One row per completed questionnaire (a "run"). Rows are only inserted, never updated, so every saved classification is kept; reads take the latest row.

| Column | Notes |
|--------|-------|
| `organization_id` | Tenant scope; every query filters on it |
| `use_case_id` / `intake_submission_id` | Owner. Check constraint `eu_ai_act_classifications_one_owner`: exactly one is set. `ON DELETE CASCADE` from either owner |
| `questionnaire_version` | Version the answers were given under |
| `role` | `Provider`, `Deployer` or null (an out-of-scope run never asks the role) |
| `answers`, `result` | JSONB; answers contain visible questions only |
| `reviewer_level`, `reviewer_justification`, `reviewed_by` | Set when an intake reviewer changed the computed level |
| `source` | `wizard` or `intake` |

On intake approval the submission's run is copied to the new use case (a new row with `source = 'intake'`), not shared. Only an approval that carries over a scorable run attaches the EU AI Act framework (`frameworks: [1]` plus `createEUFrameworkQuery`). A submission without a run, or whose run can no longer be scored, keeps the level from the mapped fields or the reviewer dialog and gets no framework, as before the step existed. The table is registered in `tests/integration/tenant-isolation/tenantIsolation.registry.ts`.

`intake_forms.eu_ai_act_risk_step_enabled` (boolean, default false) turns the step on for a form. Only use case forms can enable it, and a form with the step cannot also map a field to `ai_risk_classification` (400 on create/update).

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/eu-ai-act-classification/questionnaire` | JWT | Current questionnaire definition |
| POST | `/api/eu-ai-act-classification/score` | JWT | Score `{ answers }` without saving |
| GET | `/api/projects/:id/eu-ai-act-classification` | JWT | Latest run for the use case, or null |
| POST | `/api/projects/:id/eu-ai-act-classification` | JWT + `useCase.classify` | Validate and score `{ answers }`, insert a `wizard` run, set the use case's level and role, record change history |

Permission key `useCase.classify` (module "Use cases") is granted to Admin and Editor; Reviewer and Auditor get 403.

Public intake submissions send `euAiActRiskAnswers` with the form data. When the form has the step, the server validates and scores them; on failure it returns 400 with `step: "eu_ai_act_risk"`, and the public form returns to the risk step only for that response. The submission preview returns `euAiActClassification` (questionnaire, answers, role, current result, `changedSinceSubmission`). On approval the reviewer may send `euAiActOverride: { level, justification }`; the level must be one of the five questionnaire levels, and a level different from the computed one needs a justification of at least 10 characters. Submissions without a run approve as before.

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/project/project.model.ts` | Project model |
| `domain.layer/models/projectsMembers/projectsMembers.model.ts` | Members model |
| `domain.layer/models/projectFrameworks/projectFrameworks.model.ts` | Frameworks model |
| `controllers/project.ctrl.ts` | API controller |
| `utils/project.utils.ts` | Database queries |
| `routes/project.route.ts` | Route definitions |
| `services/euAiActClassification/` | EU AI Act questionnaire, scoring and validation |
| `controllers/euAiActClassification.ctrl.ts` | Questionnaire, score and use case classification endpoints |
| `utils/euAiActClassification.utils.ts` | `eu_ai_act_classifications` queries and `setUseCaseClassificationQuery` |

### Frontend

| File | Purpose |
|------|---------|
| `pages/ProjectView/index.tsx` | Main view |
| `pages/ProjectView/ProjectSettings/` | Settings tab |
| `pages/ProjectView/RiskAnalysisModal/` | EU AI Act risk classification wizard |
| `components/EuAiActQuestionnaire/` | Questionnaire renderer shared by the wizard and the public intake form |
| `pages/IntakeFormBuilder/EuAiActClassificationPanel.tsx` | Reviewer panel in the intake submission dialog |
| `pages/ProjectView/RisksView/` | Risks tab |
| `application/repository/project.repository.ts` | API calls |
| `application/dtos/project.dto.ts` | DTOs |
| `application/mappers/project.mapper.ts` | Data mapping |

## Related Documentation

- [Risk Management](./risk-management.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Vendors](./vendors.md)
- [Approvals](./approvals.md)

## Intake form logic

Intake forms support calculated fields, show/hide rules and risk dimension tags
(spec: `docs/superpowers/specs/2026-10-13-intake-form-logic-design.md`).

- **Logic module.** `Servers/services/intakeFormLogic/` (formula parser and
  evaluator, conditions, `evaluateForm`, `cleanSubmission`,
  `validateSchemaLogic`) is copied byte for byte to
  `Clients/src/application/utils/intakeFormLogic/`. Change both together: a
  Vitest test compares the files, and both Jest and Vitest run the cases in
  `Servers/services/intakeFormLogic/__fixtures__/intakeFormLogic.cases.json`.
- **Server is authoritative.** Both public submit handlers call
  `cleanSubmission` before validation: answers to hidden fields and unknown
  keys are dropped, calculated values are recomputed, and a visible calculated
  field with no result is stored as `null` (hidden ones are left out).
  The public form endpoints leave `riskDimension` out of the schema they
  return, so submitters cannot see which answers feed which risk score.
- **Save checks.** Create and update of a form that will be active reject
  invalid formulas, conditions on fields that are not above, stale option
  values, duplicate field ids, rules on fields mapped to required entity fields
  (`REQUIRED_ENTITY_FIELDS`) and unknown risk dimensions. Drafts skip the check
  so unfinished logic can be saved; publishing runs it. The builder runs the
  same checks live.
- **Risk scoring.** `intakeRiskScoring.service.ts` matches keywords at the start
  of a word (plurals and compounds count, "renamed" does not hit "name") in text
  answers, option labels and ticked checkbox labels. A dimension uses its tagged
  answers when they match any keyword, and all answers otherwise; high-risk
  keywords in any untagged answer set a floor the tagged score cannot go below.
## Intake live checks

Hints on the public intake form while the submitter types, plus vendor document
prefill (spec: `docs/superpowers/specs/2026-10-28-intake-live-checks-design.md`).
One per-form toggle, `intake_forms.live_checks_enabled` (default true), covers
rules, AI and prefill.

- **Rule checks.** `Servers/services/intakeLiveChecks/rules.ts`, mirrored line
  for line in `Clients/src/application/utils/intakeLiveChecks/`. Both run the
  same fixtures (`__fixtures__/ruleCases.json`, `ruleCopy.json`). Kinds in order:
  `prohibited`, `regulation`, `contradiction`, `vague`. English keywords only.
- **AI checks.** Only on request: the submitter selects **Check my answers** in
  the intake assistant (`useIntakeLiveChecks.checkWithAi`). The button is off
  while a check runs and until a text answer changes, so typing never calls the
  model. `POST /api/intake/public/by-id/:publicId/live-checks` and
  `/public/:tenantSlug/:formSlug/live-checks` (no JWT). Visible answers only,
  capped by `buildScoringAnswers`; one model call, 15 s, at most 8 hints; output
  quoting text that is not in the answer, or a quote under 15 characters (unless
  the answer is shorter), is dropped. Errors answer 200 with
  `error: "unavailable"`.
- **Prefill.** `POST .../prefill`, multipart, PDF or DOCX up to 10 MB, held in
  memory only. DOCX zip size and entry count are checked before extraction,
  which has its own deadline. Each suggestion carries a signed token
  (`utils/signedToken.utils.ts`); at submit only a verified token becomes
  provenance.
- **Rate limits.** Per visitor and form (in memory): live checks 10/min, prefill
  3 per 10 min. Per form (Redis, hourly key, 300 ms timeout, fails closed):
  live checks 300, prefill 20. The count is refused outright while Redis is
  disconnected, so the client's offline queue never replays refused calls.
- **Storage.** `intake_submissions.live_checks` (JSONB): server-run rule hints
  and verified prefill at submit; AI hints from the `liveChecks` stage of the
  assessment job (`ai.status` pending, done, failed or skipped). The review
  preview returns it as `liveChecks`.
- **Submit.** Submit waits at most 2 s for the live-check write. A slower
  write carries on after the response and queues the `liveChecks` stage itself
  once it has stored a pending status.
