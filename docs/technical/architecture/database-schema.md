# Database Schema

## Overview

VerifyWise uses PostgreSQL with Sequelize ORM. All data lives in a single `verifywise` schema, with tenant isolation enforced via `organization_id` columns on tenant-scoped tables. There are 60+ Sequelize models covering users, organizations, projects, vendors, risks, approvals, and compliance frameworks.

## Schema Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL Database                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  VERIFYWISE SCHEMA (All data)                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Shared tables (no organization_id):                                   │ │
│  │  organizations  │  users          │  roles         │  frameworks       │ │
│  │  subscriptions  │  tiers          │  *_struct_*                        │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │  Tenant-scoped tables (with organization_id):                          │ │
│  │  projects       │  vendors        │  risks         │  files            │ │
│  │  model_inventories │  tasks       │  approvals     │  assessments      │ │
│  │  policy_manager │  automations    │  datasets      │  ...30+ more      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  PUBLIC SCHEMA (Extensions only: uuid-ossp, pgcrypto)                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Entity Relationship Diagram

```
┌─────────────────┐     1:N     ┌─────────────────┐
│  organizations  │◄────────────│      users      │
└─────────────────┘             └────────┬────────┘
                                         │
                                    1:1  │ role_id
                                         ▼
                                ┌─────────────────┐
                                │      roles      │
                                └─────────────────┘

┌─────────────────┐     N:M     ┌─────────────────┐
│    projects     │◄───────────►│      users      │
└────────┬────────┘             └─────────────────┘
         │                      (via project_members)
         │ 1:N
         ▼
┌─────────────────┐     N:M     ┌─────────────────┐
│     vendors     │◄───────────►│    projects     │
└────────┬────────┘             └─────────────────┘
         │                      (via vendor_projects)
         │ 1:N
         ▼
┌─────────────────┐
│  vendor_risks   │
└─────────────────┘

┌─────────────────┐     N:M     ┌─────────────────┐
│    projects     │◄───────────►│   frameworks    │
└─────────────────┘             └─────────────────┘
                                (via project_frameworks)

┌─────────────────────────────────────────────────────────────┐
│                    APPROVAL WORKFLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    1:N    ┌────────────────────────┐ │
│  │ approval_workflows│─────────►│approval_workflow_steps │ │
│  └──────────────────┘           └───────────┬────────────┘ │
│           │                                 │              │
│      1:N  │                            1:N  │              │
│           ▼                                 ▼              │
│  ┌──────────────────┐           ┌────────────────────────┐ │
│  │ approval_requests │           │approval_step_approvers │ │
│  └──────────────────┘           └────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Core Tables

### Users

**Table:** `users` (verifywise schema)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,           -- First name (min 2 chars)
  surname VARCHAR(255) NOT NULL,        -- Last name (min 2 chars)
  email VARCHAR(255) UNIQUE NOT NULL,   -- Email (validated format)
  password_hash VARCHAR(255) NOT NULL,  -- Bcrypt hash (10 rounds)
  role_id INTEGER REFERENCES roles(id),
  organization_id INTEGER REFERENCES organizations(id),
  profile_photo_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_demo BOOLEAN DEFAULT FALSE
);
```

**Associations:**
- BELONGS_TO: RoleModel (`role_id`)
- BELONGS_TO: OrganizationModel (`organization_id`)
- HAS_MANY: ProjectsMembersModel, VendorModel, RiskModel, TasksModel

**Key Methods:**
- `createNewUser()` - Factory with bcrypt hashing
- `comparePassword()` - Constant-time password verification
- `updatePassword()` - With strength validation
- `isAdmin()`, `isDemoUser()` - Status checks

---

### Organizations

**Table:** `organizations` (verifywise schema, shared)

```sql
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,            -- 2-255 characters
  logo VARCHAR(500),                     -- Logo URL
  created_at TIMESTAMP DEFAULT NOW(),
  onboarding_status VARCHAR(20) DEFAULT 'pending'
);
```

**Onboarding Status Values:**
- `pending` - Initial state
- `in_progress` - Setup in progress
- `completed` - Fully onboarded

---

### Roles

**Table:** `roles` (verifywise schema, shared)

```sql
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
);
```

**Standard Roles (Seeded):**

| ID | Name | Permissions |
|----|------|-------------|
| 1 | Admin | Full system access, user management |
| 2 | Reviewer | Review and approval permissions |
| 3 | Editor | Content modification |
| 4 | Auditor | Read-only audit access |

---

### Projects

**Table:** `projects`

```sql
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  uc_id VARCHAR(50) UNIQUE,              -- Unique code (e.g., "UC-001")
  project_title VARCHAR(255) NOT NULL,
  owner INTEGER REFERENCES public.users(id),
  start_date DATE,
  geography INTEGER,
  ai_risk_classification ai_risk_classification_enum,
  type_of_high_risk_role high_risk_role_enum,
  goal TEXT,
  target_industry VARCHAR(255),
  description TEXT,
  last_updated TIMESTAMP,
  last_updated_by INTEGER REFERENCES public.users(id),
  is_demo BOOLEAN DEFAULT FALSE,
  is_organizational BOOLEAN DEFAULT FALSE,
  status project_status_enum DEFAULT 'NOT_STARTED',
  approval_workflow_id INTEGER,
  pending_frameworks JSONB DEFAULT '[]',
  enable_ai_data_insertion BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**AI Risk Classification Values:**
- Unacceptable risk
- High risk
- Limited risk
- Minimal risk

**Project Status Values:**
- NOT_STARTED
- IN_PROGRESS
- COMPLETED
- ON_HOLD
- ARCHIVED

---

### Project Members (Junction Table)

**Table:** `project_members`

```sql
CREATE TABLE project_members (
  user_id INTEGER REFERENCES public.users(id),
  project_id INTEGER REFERENCES projects(id),
  is_demo BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, project_id)
);
```

---

### Vendors

**Table:** `vendors`

```sql
CREATE TABLE vendors (
  id SERIAL PRIMARY KEY,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_provides VARCHAR(500),
  assignee INTEGER REFERENCES public.users(id),
  website VARCHAR(500),
  vendor_contact_person VARCHAR(255),
  order_no INTEGER,
  review_result TEXT,
  review_status vendor_review_status_enum DEFAULT 'Not started',
  reviewer INTEGER REFERENCES public.users(id),
  review_date DATE,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP,
  -- Scorecard fields
  data_sensitivity data_sensitivity_enum,
  business_criticality business_criticality_enum,
  past_issues past_issues_enum,
  regulatory_exposure regulatory_exposure_enum,
  risk_score INTEGER
);
```

**Review Status Values:**
- Not started
- In review
- Reviewed
- Requires follow-up

**Data Sensitivity Values:**
- None
- Internal only
- Personally identifiable information (PII)
- Financial data
- Health data
- Model weights
- Other

**Business Criticality Values:**
- Low
- Medium
- High

---

### Vendor Risks

**Table:** `vendor_risks`

```sql
CREATE TABLE vendor_risks (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER REFERENCES vendors(id) NOT NULL,
  risk_description TEXT NOT NULL,
  impact_description TEXT,
  impact impact_enum,
  likelihood likelihood_enum,
  risk_severity severity_enum,
  action_plan TEXT,
  action_owner INTEGER REFERENCES public.users(id),
  risk_level VARCHAR(50),
  order_no INTEGER,
  is_demo BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,      -- Soft delete
  deleted_at TIMESTAMP,                   -- Soft delete timestamp
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

---

### Project Risks

**Table:** `project_risks`

```sql
CREATE TABLE project_risks (
  id SERIAL PRIMARY KEY,
  risk_name VARCHAR(255) NOT NULL,
  risk_owner INTEGER REFERENCES public.users(id),
  ai_lifecycle_phase lifecycle_phase_enum,
  risk_description TEXT,
  risk_category TEXT[],                   -- Array of categories
  impact TEXT,
  assessment_mapping TEXT,
  controls_mapping TEXT,
  likelihood likelihood_enum,
  severity severity_enum,
  risk_level_autocalculated risk_level_enum,
  review_notes TEXT,
  mitigation_status mitigation_status_enum DEFAULT 'Not Started',
  current_risk_level risk_level_enum,
  deadline DATE,
  mitigation_plan TEXT,
  implementation_strategy TEXT,
  mitigation_evidence_document TEXT,
  likelihood_mitigation likelihood_enum,
  risk_severity severity_enum,
  final_risk_level VARCHAR(50),
  risk_approval INTEGER REFERENCES public.users(id),
  approval_status VARCHAR(50),
  date_of_assessment DATE,
  is_demo BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

**AI Lifecycle Phase Values:**
- Problem definition & planning
- Data collection & processing
- Model development & training
- Model validation & testing
- Deployment & integration
- Monitoring & maintenance
- Decommissioning & retirement

**Likelihood Values:**
- Rare
- Unlikely
- Possible
- Likely
- Almost Certain

**Severity Values:**
- Negligible
- Minor
- Moderate
- Major
- Catastrophic (or Critical)

**Risk Level Values (Auto-calculated):**
- No risk
- Very low risk
- Low risk
- Medium risk
- High risk
- Very high risk

**Mitigation Status Values:**
- Not Started
- In Progress
- Completed
- On Hold
- Deferred
- Canceled
- Requires review

---

### Files

**Table:** `files`

```sql
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  content BYTEA,                          -- File binary content
  project_id INTEGER REFERENCES projects(id),
  uploaded_by INTEGER REFERENCES public.users(id) NOT NULL,
  uploaded_time TIMESTAMP DEFAULT NOW(),
  size BIGINT,                            -- File size in bytes
  file_path VARCHAR(500),                 -- File system path
  org_id INTEGER REFERENCES public.organizations(id),
  model_id INTEGER,
  source file_source_enum,
  type VARCHAR(100),                      -- MIME type
  is_demo BOOLEAN DEFAULT FALSE
);
```

**File Source Values:**
- Assessment tracker group
- Compliance tracker group
- Management system clauses group
- Reference controls group
- Main clauses group
- Annex controls group
- Project risks report
- Compliance tracker report
- Assessment tracker report
- Vendors and risks report
- All reports
- Clauses and annexes report
- AI trust center group
- ISO 27001 report
- Models and risks report
- Training registry report
- Policy manager report
- File Manager
- policy_editor
- Post-Market Monitoring report

---

### Frameworks

**Table:** `frameworks` (verifywise schema, shared)

```sql
CREATE TABLE frameworks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  is_organizational BOOLEAN DEFAULT FALSE
);
```

**Standard Frameworks:**
- EU-AI-Act
- ISO-42001
- ISO-27001
- NIST-AI-RMF
- CE-Marking

---

### Model Inventories

**Table:** `model_inventories`

```sql
CREATE TABLE model_inventories (
  id SERIAL PRIMARY KEY,
  provider_model VARCHAR(255),
  provider VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  version VARCHAR(100) NOT NULL,
  approver VARCHAR(255) NOT NULL,
  capabilities TEXT NOT NULL,
  security_assessment BOOLEAN DEFAULT FALSE,
  status model_status_enum DEFAULT 'PENDING',
  status_date DATE NOT NULL,
  reference_link TEXT NOT NULL,
  biases TEXT NOT NULL,
  limitations TEXT NOT NULL,
  hosting_provider TEXT NOT NULL,
  security_assessment_data JSONB DEFAULT '[]',
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

**Model Status Values:**
- PENDING
- APPROVED
- REJECTED

---

### Tasks

**Table:** `tasks`

```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  creator_id INTEGER REFERENCES public.users(id),
  organization_id INTEGER NOT NULL,
  due_date DATE,
  priority task_priority_enum DEFAULT 'MEDIUM',
  status task_status_enum DEFAULT 'OPEN',
  categories JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

**Task Priority Values:**
- LOW
- MEDIUM
- HIGH

**Task Status Values:**
- OPEN
- IN_PROGRESS
- COMPLETED
- OVERDUE
- DELETED

---

## Approval Workflow Tables

### Approval Workflows

**Table:** `approval_workflows`

```sql
CREATE TABLE approval_workflows (
  id SERIAL PRIMARY KEY,
  workflow_title VARCHAR(255) NOT NULL,
  entity_type entity_type_enum NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES public.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

### Approval Workflow Steps

**Table:** `approval_workflow_steps`

```sql
CREATE TABLE approval_workflow_steps (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES approval_workflows(id) NOT NULL,
  step_number INTEGER NOT NULL,
  step_name VARCHAR(255) NOT NULL,
  description TEXT,
  requires_all_approvers BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Approval Step Approvers

**Table:** `approval_step_approvers`

```sql
CREATE TABLE approval_step_approvers (
  id SERIAL PRIMARY KEY,
  workflow_step_id INTEGER REFERENCES approval_workflow_steps(id) NOT NULL,
  user_id INTEGER REFERENCES public.users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Approval Requests

**Table:** `approval_requests`

```sql
CREATE TABLE approval_requests (
  id SERIAL PRIMARY KEY,
  request_name VARCHAR(255) NOT NULL,
  workflow_id INTEGER REFERENCES approval_workflows(id) NOT NULL,
  entity_id INTEGER,                      -- ID of entity being approved
  entity_type entity_type_enum,
  entity_data JSONB,                      -- Snapshot of entity data
  status approval_status_enum DEFAULT 'PENDING',
  requested_by INTEGER REFERENCES public.users(id) NOT NULL,
  current_step INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

**Approval Status Values:**
- PENDING
- APPROVED
- REJECTED
- IN_PROGRESS

---

## Post-Market Monitoring Tables

### PMM Configurations

**Table:** `post_market_monitoring_configs`

```sql
CREATE TABLE post_market_monitoring_configs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  frequency_value INTEGER NOT NULL,       -- e.g., 30
  frequency_unit VARCHAR(20) NOT NULL,    -- days/weeks/months
  start_date DATE NOT NULL,
  reminder_days INTEGER DEFAULT 3,
  escalation_days INTEGER DEFAULT 7,
  escalation_contact_id INTEGER REFERENCES public.users(id),
  notification_hour INTEGER DEFAULT 9,
  created_by INTEGER REFERENCES public.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

### PMM Questions

**Table:** `post_market_monitoring_questions`

```sql
CREATE TABLE post_market_monitoring_questions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER,                -- NULL = system default
  config_id INTEGER REFERENCES post_market_monitoring_configs(id),
  question_text TEXT NOT NULL,
  question_type question_type_enum,       -- yes_no, multi_select, multi_line_text
  options JSONB,                          -- For multi_select
  suggestion_text TEXT,                   -- Shown when "No"
  is_required BOOLEAN DEFAULT TRUE,
  is_system_default BOOLEAN DEFAULT FALSE,
  allows_flag_for_concern BOOLEAN DEFAULT FALSE,
  display_order INTEGER,
  eu_ai_act_article TEXT
);
```

### PMM Cycles

**Table:** `post_market_monitoring_cycles`

```sql
CREATE TABLE post_market_monitoring_cycles (
  id SERIAL PRIMARY KEY,
  config_id INTEGER REFERENCES post_market_monitoring_configs(id) NOT NULL,
  cycle_number INTEGER NOT NULL,
  status cycle_status_enum DEFAULT 'pending',
  started_at TIMESTAMP,
  due_at TIMESTAMP NOT NULL,
  reminder_sent_at TIMESTAMP,
  escalation_sent_at TIMESTAMP,
  completed_at TIMESTAMP,
  completed_by INTEGER REFERENCES public.users(id),
  assigned_stakeholder_id INTEGER REFERENCES public.users(id)
);
```

**Cycle Status Values:**
- pending
- in_progress
- completed
- escalated

---

## Key Constraints & Indexes

### Unique Constraints

```sql
-- Users
UNIQUE (email)

-- Projects
UNIQUE (uc_id)

-- Composite Keys
PRIMARY KEY (user_id, project_id) ON project_members
PRIMARY KEY (vendor_id, project_id) ON vendor_projects
```

### Foreign Key Relationships

```
users.role_id → roles.id
users.organization_id → organizations.id
projects.owner → users.id
projects.last_updated_by → users.id
project_members.user_id → users.id
project_members.project_id → projects.id
vendors.assignee → users.id
vendors.reviewer → users.id
vendor_risks.vendor_id → vendors.id
vendor_risks.action_owner → users.id
vendor_projects.vendor_id → vendors.id
vendor_projects.project_id → projects.id
project_risks.risk_owner → users.id
project_risks.risk_approval → users.id
files.uploaded_by → users.id
files.project_id → projects.id
files.org_id → organizations.id
tasks.creator_id → users.id
task_assignees.task_id → tasks.id
task_assignees.user_id → users.id
approval_workflows.created_by → users.id
approval_workflow_steps.workflow_id → approval_workflows.id
approval_step_approvers.workflow_step_id → approval_workflow_steps.id
approval_step_approvers.user_id → users.id
approval_requests.workflow_id → approval_workflows.id
approval_requests.requested_by → users.id
```

### Recommended Indexes

```sql
-- Performance indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_projects_owner ON projects(owner);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_vendors_assignee ON vendors(assignee);
CREATE INDEX idx_vendor_risks_vendor ON vendor_risks(vendor_id);
CREATE INDEX idx_project_risks_owner ON project_risks(risk_owner);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_org ON files(org_id);
CREATE INDEX idx_tasks_organization ON tasks(organization_id);
CREATE INDEX idx_tasks_status ON tasks(status);
```

---

## Soft Delete Pattern

Several tables implement soft delete:

```sql
-- Common soft delete columns
is_deleted BOOLEAN DEFAULT FALSE,
deleted_at TIMESTAMP

-- Tables with soft delete:
-- - project_risks
-- - vendor_risks
-- - model_risks
```

**Query Pattern:**
```typescript
// Active records only
WHERE is_deleted = FALSE OR is_deleted IS NULL

// Include deleted (for audit)
WHERE 1=1  -- No filter
```

---

## Migration Conventions

### File Naming

```
YYYYMMDDHHMMSS-description.js
Example: 20250319225827-initial-setup.js
```

### Migration Structure

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('table_name', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // ... other columns
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('table_name');
  }
};
```

### Adding Columns

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('table_name', 'new_column', {
      type: Sequelize.STRING,
      allowNull: true,  // Always nullable for existing data
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('table_name', 'new_column');
  }
};
```

### Adding ENUMs

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create ENUM type
    await queryInterface.sequelize.query(`
      CREATE TYPE enum_status AS ENUM ('active', 'inactive', 'pending');
    `);

    // Add column using ENUM
    await queryInterface.addColumn('table_name', 'status', {
      type: 'enum_status',
      defaultValue: 'pending',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('table_name', 'status');
    await queryInterface.sequelize.query(`DROP TYPE enum_status;`);
  }
};
```

---

## Key Files

| File | Purpose |
|------|---------|
| `Servers/database/db.ts` | Sequelize instance and model registration |
| `Servers/database/migrations/` | Schema migrations |
| `Servers/domain.layer/models/` | Sequelize model definitions |
| `Servers/database/db.ts` | Sequelize instance, search_path hook |
| `Servers/utils/*.utils.ts` | Database query functions |

## Related Documentation

- [Architecture Overview](./overview.md)
- [Multi-tenancy](./multi-tenancy.md)
- [API Endpoints](../api/endpoints.md)
