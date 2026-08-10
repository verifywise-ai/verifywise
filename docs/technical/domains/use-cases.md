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
├── owner (FK → users)       # Project owner
├── start_date
├── geography
├── ai_risk_classification   # PROHIBITED, HIGH_RISK, LIMITED_RISK, MINIMAL_RISK
├── type_of_high_risk_role   # DEPLOYER, PROVIDER, DISTRIBUTOR, etc.
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
}
```

### High Risk Role Types

```typescript
enum HighRiskRole {
  DEPLOYER = "Deployer"
  PROVIDER = "Provider"
  DISTRIBUTOR = "Distributor"
  IMPORTER = "Importer"
  PRODUCT_MANUFACTURER = "Product manufacturer"
  AUTHORIZED_REPRESENTATIVE = "Authorized representative"
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

## Create Project

### Request

```typescript
POST /projects
{
  project_title: string,           // Required
  owner: number,                   // Required, user ID
  members: number[],               // Optional, user IDs
  framework: number[],             // Required, framework IDs
  start_date: Date,                // Required
  ai_risk_classification: string,  // Required
  type_of_high_risk_role: string,  // Required
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
  type_of_high_risk_role?: string,
  goal?: string,
  geography?: number,
  target_industry?: string,
  description?: string,
  status?: string
}
```

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
├── Approval Workflow ────────────── N:1 (optional)
└── Change History ───────────────── 1:N
```

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
  type_of_high_risk_role: number,
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

### Frontend

| File | Purpose |
|------|---------|
| `pages/ProjectView/index.tsx` | Main view |
| `pages/ProjectView/ProjectSettings/` | Settings tab |
| `pages/ProjectView/RisksView/` | Risks tab |
| `application/repository/project.repository.ts` | API calls |
| `application/dtos/project.dto.ts` | DTOs |
| `application/mappers/project.mapper.ts` | Data mapping |

## Related Documentation

- [Risk Management](./risk-management.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Vendors](./vendors.md)
- [Approvals](./approvals.md)
