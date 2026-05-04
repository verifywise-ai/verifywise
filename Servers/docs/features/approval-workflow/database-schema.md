# Database Schema Documentation

## Overview

The approval workflow system uses 6 main tables organized into two categories:

1. **Workflow Templates** (3 tables): Define reusable workflow configurations
2. **Approval Requests** (3 tables): Track active approval processes

## Multi-Tenancy

All tables are created within tenant-specific schemas:

```sql
CREATE TABLE "${tenantId}".approval_workflows (...);
```

Example: For tenant `a4ayc80OGd`, tables are in schema `a4ayc80OGd`.

---

## Workflow Template Tables

### 1. approval_workflows

Stores workflow templates that can be assigned to use-cases.

```sql
CREATE TABLE approval_workflows (
  id SERIAL PRIMARY KEY,
  workflow_title VARCHAR(255) NOT NULL,
  entity INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:

- `id`: Unique workflow identifier
- `workflow_title`: Human-readable name (e.g., "Use Case Approval")
- `entity`: Entity type ID (1 = use_case, 2 = policy, etc.)
- `created_at`: When workflow was created
- `updated_at`: Last modification time

**Indexes**:

```sql
CREATE INDEX idx_approval_workflows_entity ON approval_workflows(entity);
```

**Example Data**:

```sql
id | workflow_title           | entity | created_at
---+-------------------------+--------+------------
1  | Marketing Approval       | 1      | 2024-01-01
2  | Finance Review Process   | 1      | 2024-01-02
```

---

### 2. approval_workflow_steps

Defines the steps within each workflow.

```sql
CREATE TABLE approval_workflow_steps (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_name VARCHAR(255) NOT NULL,
  requires_all_approvers BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:

- `id`: Unique step identifier
- `workflow_id`: Parent workflow (FK)
- `step_number`: Order of execution (1, 2, 3, ...)
- `step_name`: Human-readable step name
- `requires_all_approvers`:
  - `true` = ALL approvers must approve to proceed
  - `false` = ANY ONE approver can proceed
- `created_at`: When step was created

**Indexes**:

```sql
CREATE INDEX idx_workflow_steps_workflow_id ON approval_workflow_steps(workflow_id);
CREATE INDEX idx_workflow_steps_step_number ON approval_workflow_steps(step_number);
CREATE UNIQUE INDEX idx_workflow_steps_unique ON approval_workflow_steps(workflow_id, step_number);
```

**Example Data**:

```sql
id | workflow_id | step_number | step_name            | requires_all_approvers
---+-------------+-------------+----------------------+-----------------------
1  | 1           | 1           | Marketing Review     | false
2  | 1           | 2           | Finance Approval     | true
3  | 1           | 3           | CEO Sign-off         | true
```

---

### 3. approval_step_approvers

Lists who can approve each workflow step.

```sql
CREATE TABLE approval_step_approvers (
  id SERIAL PRIMARY KEY,
  workflow_step_id INTEGER NOT NULL REFERENCES approval_workflow_steps(id) ON DELETE CASCADE,
  approver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:

- `id`: Unique record identifier
- `workflow_step_id`: Which workflow step (FK)
- `approver_id`: User ID who can approve (FK)
- `created_at`: When approver was added

**Indexes**:

```sql
CREATE INDEX idx_step_approvers_workflow_step ON approval_step_approvers(workflow_step_id);
CREATE INDEX idx_step_approvers_approver ON approval_step_approvers(approver_id);
CREATE UNIQUE INDEX idx_step_approvers_unique ON approval_step_approvers(workflow_step_id, approver_id);
```

**Example Data**:

```sql
id | workflow_step_id | approver_id
---+------------------+------------
1  | 1                | 2           (Marketing Manager)
2  | 1                | 3           (Marketing Director)
3  | 2                | 4           (Finance Director)
4  | 3                | 5           (CEO)
```

**Note**: Step 1 has 2 approvers, but `requires_all_approvers = false`, so either User 2 OR User 3 can approve.

---

## Approval Request Tables

### 4. approval_requests

Tracks active approval processes for specific entities.

```sql
CREATE TABLE approval_requests (
  id SERIAL PRIMARY KEY,
  request_name VARCHAR(255) NOT NULL,
  workflow_id INTEGER NOT NULL REFERENCES approval_workflows(id),
  entity_id INTEGER,
  entity_type VARCHAR(50),
  entity_data JSONB,
  status VARCHAR(50) NOT NULL,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  current_step INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:

- `id`: Unique request identifier
- `request_name`: Display name (e.g., "Use Case: Q1 Campaign")
- `workflow_id`: Which workflow template is being used (FK)
- `entity_id`: ID of the entity being approved (e.g., project ID)
- `entity_type`: Type of entity (e.g., "use_case", "policy")
- `entity_data`: Snapshot of entity data (JSONB)
- `status`: Current status
  - `PENDING` - In progress
  - `APPROVED` - Fully approved
  - `REJECTED` - Rejected at any step
  - `WITHDRAWN` - Cancelled by requester
- `requested_by`: User who initiated the request (FK)
- `current_step`: Which step is currently active (1, 2, 3, ...)
- `created_at`: When request was created
- `updated_at`: Last modification time

**Indexes**:

```sql
CREATE INDEX idx_approval_requests_workflow ON approval_requests(workflow_id);
CREATE INDEX idx_approval_requests_entity ON approval_requests(entity_id, entity_type);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_requester ON approval_requests(requested_by);
CREATE INDEX idx_approval_requests_current_step ON approval_requests(current_step);
```

**Example Data**:

```sql
id | request_name              | workflow_id | entity_id | status  | current_step | requested_by
---+---------------------------+-------------+-----------+---------+--------------+-------------
14 | Use Case: Q1 Campaign     | 1           | 123       | PENDING | 2            | 1
15 | Use Case: Product Launch  | 1           | 124       | APPROVED| 3            | 2
16 | Use Case: Market Research | 2           | 125       | REJECTED| 1            | 1
```

---

### 5. approval_request_steps

Instances of workflow steps for each request.

```sql
CREATE TABLE approval_request_steps (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  date_assigned TIMESTAMP DEFAULT NOW(),
  date_completed TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:

- `id`: Unique step instance identifier
- `request_id`: Parent approval request (FK)
- `step_number`: Step order (copied from workflow)
- `step_name`: Step name (copied from workflow)
- `status`: Step status
  - `PENDING` - Waiting for approvals
  - `COMPLETED` - All required approvals received
  - `REJECTED` - Rejected by an approver
- `date_assigned`: When step became active
- `date_completed`: When step was completed/rejected (NULL if pending)
- `created_at`: When record was created

**Indexes**:

```sql
CREATE INDEX idx_request_steps_request ON approval_request_steps(request_id);
CREATE INDEX idx_request_steps_step_number ON approval_request_steps(step_number);
CREATE INDEX idx_request_steps_status ON approval_request_steps(status);
CREATE UNIQUE INDEX idx_request_steps_unique ON approval_request_steps(request_id, step_number);
```

**Example Data**:

```sql
id | request_id | step_number | step_name         | status    | date_completed
---+------------+-------------+-------------------+-----------+----------------
1  | 14         | 1           | Marketing Review  | COMPLETED | 2024-01-09
2  | 14         | 2           | Finance Approval  | PENDING   | NULL
3  | 14         | 3           | CEO Sign-off      | PENDING   | NULL
```

---

### 6. approval_request_step_approvals

Individual approver responses for each request step.

```sql
CREATE TABLE approval_request_step_approvals (
  id SERIAL PRIMARY KEY,
  request_step_id INTEGER NOT NULL REFERENCES approval_request_steps(id) ON DELETE CASCADE,
  approver_id INTEGER NOT NULL REFERENCES users(id),
  approval_result VARCHAR(50) DEFAULT 'PENDING',
  comments TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Columns**:

- `id`: Unique approval record identifier
- `request_step_id`: Which step instance (FK)
- `approver_id`: User who needs to approve (FK)
- `approval_result`: Response status
  - `PENDING` - Not yet responded
  - `APPROVED` - Approved
  - `REJECTED` - Rejected
- `comments`: Optional comment from approver
- `approved_at`: When response was given (NULL if pending)
- `created_at`: When record was created

**Indexes**:

```sql
CREATE INDEX idx_step_approvals_request_step ON approval_request_step_approvals(request_step_id);
CREATE INDEX idx_step_approvals_approver ON approval_request_step_approvals(approver_id);
CREATE INDEX idx_step_approvals_result ON approval_request_step_approvals(approval_result);
CREATE UNIQUE INDEX idx_step_approvals_unique ON approval_request_step_approvals(request_step_id, approver_id);
```

**Example Data**:

```sql
id | request_step_id | approver_id | approval_result | comments      | approved_at
---+-----------------+-------------+-----------------+---------------+-------------
1  | 1               | 2           | APPROVED        | Looks good!   | 2024-01-09
2  | 1               | 3           | APPROVED        | NULL          | 2024-01-09
3  | 2               | 4           | PENDING         | NULL          | NULL
4  | 3               | 5           | PENDING         | NULL          | NULL
```

---

## Related Tables

### projects

Modified to support deferred framework creation.

**Added Columns**:

```sql
ALTER TABLE projects ADD COLUMN approval_workflow_id INTEGER REFERENCES approval_workflows(id);
ALTER TABLE projects ADD COLUMN pending_frameworks JSONB;
ALTER TABLE projects ADD COLUMN enable_ai_data_insertion BOOLEAN DEFAULT false;
```

**Columns**:

- `approval_workflow_id`: Assigned workflow (NULL if no approval required)
- `pending_frameworks`: Framework IDs to create after approval (e.g., `[1, 2]`)
- `enable_ai_data_insertion`: Whether to enable AI data insertion for frameworks

**Example**:

```sql
id | project_title    | approval_workflow_id | pending_frameworks | enable_ai_data_insertion
---+------------------+----------------------+--------------------+------------------------
123| Q1 Campaign      | 1                    | [1, 2]             | true
124| Product Launch   | NULL                 | NULL               | false
```

**Flow**:

1. Create project with `pending_frameworks = [1, 2]`
2. Create approval request
3. Wait for approvals...
4. After final approval: Create frameworks, set `pending_frameworks = NULL`

---

## Table Relationships

```
┌─────────────────────┐
│ approval_workflows  │
│ (Workflow Template) │
└──────────┬──────────┘
           │ 1:N
           ▼
┌──────────────────────────┐
│ approval_workflow_steps  │
│ (Step Definition)        │
└──────────┬───────────────┘
           │ 1:N
           ▼
┌───────────────────────────┐         ┌────────────┐
│ approval_step_approvers   │─────────│   users    │
│ (Approver Assignment)     │  N:1    │            │
└───────────────────────────┘         └────────────┘


┌─────────────────────┐         ┌──────────────────────┐
│ approval_requests   │─────────│ approval_workflows   │
│ (Active Request)    │  N:1    │ (Workflow Template)  │
└──────────┬──────────┘         └──────────────────────┘
           │ 1:N
           ▼
┌──────────────────────────┐
│ approval_request_steps   │
│ (Step Instance)          │
└──────────┬───────────────┘
           │ 1:N
           ▼
┌────────────────────────────────┐         ┌────────────┐
│ approval_request_step_approvals│─────────│   users    │
│ (Individual Response)          │  N:1    │            │
└────────────────────────────────┘         └────────────┘


┌─────────────────────┐         ┌──────────────────────┐
│ approval_requests   │─────────│     projects         │
│                     │  N:1    │ (Use-Case Entity)    │
└─────────────────────┘         └──────────────────────┘
  (entity_id, entity_type)              (id)
```

---

## Common Queries

### Get Pending Approvals for User

```sql
SELECT DISTINCT
  ar.id,
  ar.request_name,
  ar.status,
  ar.current_step
FROM approval_requests ar
JOIN approval_request_steps ars ON ar.id = ars.request_id
JOIN approval_request_step_approvals arsa ON ars.id = arsa.request_step_id
WHERE arsa.approver_id = :userId
  AND ars.step_number = ar.current_step
  AND ar.status = 'PENDING'
  AND arsa.approval_result = 'PENDING'
ORDER BY ar.created_at DESC;
```

### Get Approvers for Current Step

```sql
SELECT DISTINCT asa.approver_id
FROM approval_step_approvers asa
INNER JOIN approval_workflow_steps aws
  ON asa.workflow_step_id = aws.id
INNER JOIN approval_requests ar
  ON aws.workflow_id = ar.workflow_id
WHERE ar.id = :requestId
  AND aws.step_number = ar.current_step;
```

### Get Request Details with Steps

```sql
SELECT
  ar.*,
  json_agg(
    json_build_object(
      'step_number', ars.step_number,
      'step_name', ars.step_name,
      'status', ars.status,
      'approvals', (
        SELECT json_agg(
          json_build_object(
            'approver_id', arsa.approver_id,
            'approval_result', arsa.approval_result,
            'comments', arsa.comments,
            'approved_at', arsa.approved_at
          )
        )
        FROM approval_request_step_approvals arsa
        WHERE arsa.request_step_id = ars.id
      )
    ) ORDER BY ars.step_number
  ) as steps
FROM approval_requests ar
LEFT JOIN approval_request_steps ars ON ar.id = ars.request_id
WHERE ar.id = :requestId
GROUP BY ar.id;
```

---

## Data Integrity

### Foreign Key Constraints

- All FK relationships use `ON DELETE CASCADE` for automatic cleanup
- Deleting a workflow deletes all its steps and approvers
- Deleting a request deletes all its steps and approvals
- User deletion handled separately (should reassign or block)

### Unique Constraints

- `(workflow_id, step_number)` - Each step number unique per workflow
- `(workflow_step_id, approver_id)` - No duplicate approvers per step
- `(request_id, step_number)` - Each step number unique per request
- `(request_step_id, approver_id)` - No duplicate approvals per step

### Check Constraints

```sql
ALTER TABLE approval_workflow_steps
ADD CONSTRAINT check_step_number_positive
CHECK (step_number > 0);

ALTER TABLE approval_requests
ADD CONSTRAINT check_current_step_positive
CHECK (current_step > 0);

ALTER TABLE approval_requests
ADD CONSTRAINT check_status_valid
CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'));
```

---

## Migration Considerations

### Creating Tables

Tables must be created in order due to foreign key dependencies:

1. `approval_workflows`
2. `approval_workflow_steps`
3. `approval_step_approvers`
4. `approval_requests`
5. `approval_request_steps`
6. `approval_request_step_approvals`

### Dropping Tables

Reverse order with CASCADE:

```sql
DROP TABLE IF EXISTS approval_request_step_approvals CASCADE;
DROP TABLE IF EXISTS approval_request_steps CASCADE;
DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS approval_step_approvers CASCADE;
DROP TABLE IF EXISTS approval_workflow_steps CASCADE;
DROP TABLE IF EXISTS approval_workflows CASCADE;
```

---

## Performance Optimization

### Recommended Indexes

Already listed above, but key ones for performance:

```sql
-- Most frequently queried
CREATE INDEX idx_approval_requests_current_step ON approval_requests(current_step);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);

-- For approver queries
CREATE INDEX idx_step_approvals_approver_result ON approval_request_step_approvals(approver_id, approval_result);

-- For step progression
CREATE INDEX idx_request_steps_request_status ON approval_request_steps(request_id, status);
```

### JSONB Indexes

For `entity_data` queries:

```sql
CREATE INDEX idx_approval_requests_entity_data_gin ON approval_requests USING GIN (entity_data);
```

For `pending_frameworks`:

```sql
CREATE INDEX idx_projects_pending_frameworks_gin ON projects USING GIN (pending_frameworks);
```
