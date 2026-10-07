# Approval Workflows Domain

## Overview

The Approval Workflows domain provides a comprehensive multi-step approval process for 15 entity types in VerifyWise (use cases, files, risks, vendors, models, policies, incidents, tasks, datasets, training, evidence, AI actions, automations, post-market monitoring configs and notes). It supports configurable workflow templates, multiple approval steps, flexible approver requirements, and, for use cases, automatic framework creation upon final approval.

## Key Features

- Multi-step approval workflows
- Configurable approver requirements per step
- Approval request lifecycle management
- Automatic framework creation on approval
- Withdrawal support for pending requests
- Complete approval timeline tracking
- Role-based access control

## Database Schema

### Approval Workflows Table

```
approval_workflows
├── id (PK, SERIAL)
├── workflow_title (VARCHAR(255))
├── entity_type (VARCHAR(50), values from EntityType enum)
├── description (TEXT)
├── created_by (FK → users)
├── is_active (BOOLEAN, default: true)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### Approval Workflow Steps Table

```
approval_workflow_steps
├── id (PK, SERIAL)
├── workflow_id (FK → approval_workflows)
├── step_number (INTEGER)
├── step_name (VARCHAR(255))
├── description (TEXT)
├── requires_all_approvers (BOOLEAN)
├── created_at (TIMESTAMP)
└── UNIQUE(workflow_id, step_number)
```

### Approval Step Approvers Table

```
approval_step_approvers
├── id (PK, SERIAL)
├── workflow_step_id (FK → approval_workflow_steps)
├── approver_id (FK → users)
├── created_at (TIMESTAMP)
└── UNIQUE(workflow_step_id, approver_id)
```

### Approval Requests Table

```
approval_requests
├── id (PK, SERIAL)
├── request_name (VARCHAR(255))
├── workflow_id (FK → approval_workflows)
├── entity_id (INTEGER)
├── entity_type (VARCHAR(50), values from EntityType enum)
├── entity_data (JSONB) -- Snapshot at request time
├── status (ENUM)
├── requested_by (FK → users)
├── current_step (INTEGER)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### Approval Request Steps Table

```
approval_request_steps
├── id (PK, SERIAL)
├── request_id (FK → approval_requests)
├── step_number (INTEGER)
├── step_name (VARCHAR(255))
├── status (ENUM)
├── date_assigned (TIMESTAMP)
├── date_completed (TIMESTAMP)
├── created_at (TIMESTAMP)
└── UNIQUE(request_id, step_number)
```

### Approval Request Step Approvals Table

```
approval_request_step_approvals
├── id (PK, SERIAL)
├── request_step_id (FK → approval_request_steps)
├── approver_id (FK → users)
├── approval_result (ENUM)
├── comments (TEXT)
├── approved_at (TIMESTAMP)
├── created_at (TIMESTAMP)
└── UNIQUE(request_step_id, approver_id)
```

## Enumerations

### Request Status

```typescript
enum ApprovalRequestStatus {
  PENDING = "Pending"     // Initial state
  APPROVED = "Approved"   // All steps completed
  REJECTED = "Rejected"   // Rejected at any step
  WITHDRAWN = "Withdrawn" // Requestor withdrew
}
```

### Step Status

```typescript
enum ApprovalStepStatus {
  PENDING = "Pending"     // Awaiting approvals
  COMPLETED = "Completed" // Step requirements met
  REJECTED = "Rejected"   // Rejected by approver
}
```

### Approval Result

```typescript
enum ApprovalResult {
  PENDING = "Pending"   // Approver hasn't responded
  APPROVED = "Approved" // Approver approved
  REJECTED = "Rejected" // Approver rejected
}
```

### Entity Types

```typescript
// Servers/domain.layer/enums/approval-workflow.enum.ts
enum EntityType {
  USE_CASE = "use_case",
  FILE = "file",
  RISK = "risk",
  VENDOR = "vendor",
  MODEL_INVENTORY = "model_inventory",
  POLICY = "policy",
  INCIDENT = "incident",
  TASK = "task",
  DATASET = "dataset",
  TRAINING = "training",
  EVIDENCE = "evidence",
  AI_ACTION = "ai_action",
  AUTOMATION = "automation",
  PMM_CONFIG = "pmm_config",
  NOTE = "note",
}
```

The `entity_type` columns are `VARCHAR(50)` with no CHECK constraint (dropped in `20260413175412-extend-entity-types-and-seed-workflows.js`).

## API Endpoints

### Workflow Management

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/approval-workflows` | Auth | List all workflows |
| GET | `/approval-workflows/:id` | Auth | Get workflow details |
| POST | `/approval-workflows` | Admin | Create workflow |
| PUT | `/approval-workflows/:id` | Admin | Update workflow |
| DELETE | `/approval-workflows/:id` | Admin | Soft delete workflow |

### Request Management

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/approval-requests` | Auth | Create request |
| GET | `/approval-requests/my-requests` | Auth | User's requests |
| GET | `/approval-requests/pending-approvals` | Auth | Awaiting user's approval |
| GET | `/approval-requests/all` | Admin | All requests |
| GET | `/approval-requests/:id` | Auth | Request details |
| POST | `/approval-requests/:id/approve` | Approver | Approve step |
| POST | `/approval-requests/:id/reject` | Approver | Reject request |
| POST | `/approval-requests/:id/withdraw` | Requestor | Withdraw request |

## Workflow Configuration

### Create Workflow Request

```typescript
POST /approval-workflows
{
  workflow_title: "AI Model Deployment Approval",
  entity_type: "use_case",
  description: "Approval process for new AI deployments",
  steps: [
    {
      step_number: 1,
      step_name: "Technical Review",
      description: "Engineering team review",
      requires_all_approvers: false,
      approvers: [1, 2, 3]  // User IDs
    },
    {
      step_number: 2,
      step_name: "Legal Review",
      description: "Legal compliance check",
      requires_all_approvers: true,
      approvers: [4, 5]
    },
    {
      step_number: 3,
      step_name: "Executive Approval",
      description: "Final sign-off",
      requires_all_approvers: true,
      approvers: [6]
    }
  ]
}
```

### Approval Requirements

| Setting | Behavior |
|---------|----------|
| `requires_all_approvers: true` | All assigned approvers must approve |
| `requires_all_approvers: false` | Any one approver can approve |

## Request Lifecycle

### State Transitions

```
[Created] → [Pending] → [Step 1 In Progress]
                              ↓
                    [Step Completed] → [Step 2 In Progress]
                              ↓                    ↓
                    [Any Rejection] → [Rejected]
                                              ↓
                              [Last Step Completed] → [Approved]

[Pending] → [Withdrawn] (by requestor only)
```

### Approval Logic

**When Rejection Occurs:**
1. Current step → Rejected
2. Request → Rejected
3. Notification sent to requestor

**When Approval Occurs (requires_all_approvers = true):**
1. Wait for all approvers
2. If any rejects → Request rejected
3. If all approve → Step completed

**When Approval Occurs (requires_all_approvers = false):**
1. One approval → Step completed

**After Step Completion:**
1. If more steps → Move to next step
2. If last step → Request approved
3. Notifications sent to next approvers

## Framework Auto-Creation

Upon final approval of a use case:

1. Check project's `pending_frameworks`
2. For each pending framework:
   - Create `projects_frameworks` record
   - Create framework-specific records
3. Clear `pending_frameworks` field

```typescript
// Pending frameworks array
pending_frameworks: [
  { framework_id: 1 },  // EU AI Act
  { framework_id: 2 },  // ISO 42001
  { framework_id: 3 },  // ISO 27001
  { framework_id: 4 }   // NIST AI RMF
]
```

## Integration Points

### Project Integration

```
projects
├── approval_workflow_id (FK → approval_workflows)
├── has_pending_approval (computed)
└── approval_status (computed: pending/rejected/null)
```

### Incident Management

```
ai_incident_managements
├── approval_status (ENUM: Pending/Approved/Rejected/Not required)
├── approved_by (TEXT)
├── approval_date (TIMESTAMP)
└── approval_notes (TEXT)
```

### Use Case Creation Flow

```
1. User selects approval_workflow_id
    ↓
2. Project created in database
    ↓
3. If workflow provided:
   ├── Fetch workflow and steps
   ├── Create approval request
   └── Set entity_type to "use_case"
    ↓
4. Workflow progresses through steps
    ↓
5. If approved:
   ├── Create pending frameworks
   └── Clear pending_frameworks field
```

## Access Control

| Role | Create Workflows | Create Requests | Approve | Withdraw |
|------|-----------------|-----------------|---------|----------|
| Admin | ✓ | ✓ | ✓ (if assigned) | ✓ (if requestor) |
| Editor | - | ✓ | ✓ (if assigned) | ✓ (if requestor) |
| Reviewer | - | ✓ | ✓ (if assigned) | ✓ (if requestor) |
| Auditor | - | - | - | - |

## Utility Functions

### Workflow Utils

```typescript
getAllApprovalWorkflowsQuery(tenant)
getApprovalWorkflowByIdQuery(id, tenant)
getWorkflowStepsQuery(workflowId, tenant)
createApprovalWorkflowQuery(data, tenant)
updateApprovalWorkflowQuery(id, data, tenant)
deleteApprovalWorkflowQuery(id, tenant)
```

### Request Utils

```typescript
createApprovalRequestQuery(data, tenant)
getPendingApprovalsQuery(userId, tenant)
getMyApprovalRequestsQuery(userId, tenant)
getApprovalRequestByIdQuery(requestId, tenant)
processApprovalQuery(requestId, userId, action, comments, tenant)
withdrawApprovalRequestQuery(requestId, userId, tenant)
hasPendingApprovalQuery(entityId, entityType, tenant)
getApprovalStatusQuery(entityId, entityType, tenant)
```

## Frontend Structure

### Components

| Component | Purpose |
|-----------|---------|
| `ApprovalButton` | Action button for approvals |
| `ApprovalWorkflowsTable` | Workflow management page |

### Repositories

```typescript
// approvalWorkflow.repository.ts
getAllApprovalWorkflows()
getApprovalWorkflowById(id)
createApprovalWorkflow(data)
updateApprovalWorkflow(id, data)
deleteApprovalWorkflow(id)

// approvalRequest.repository.ts
createApprovalRequest(data)
getMyApprovalRequests()
getPendingApprovals()
getApprovalRequestById(id)
approveRequest(id, comments)
rejectRequest(id, comments)
withdrawRequest(id)
```

### Enums (Client)

```typescript
// aiApprovalWorkflow.enum.ts
enum ApprovalStatus {
  APPROVED = "Approved"
  REJECTED = "Rejected"
  PENDING = "Pending"
}
```

## Database Indexes

```sql
-- Workflows
CREATE INDEX idx_workflows_entity_type ON approval_workflows(entity_type);
CREATE INDEX idx_workflows_is_active ON approval_workflows(is_active);
CREATE INDEX idx_workflows_created_by ON approval_workflows(created_by);

-- Workflow Steps
CREATE INDEX idx_steps_workflow_id ON approval_workflow_steps(workflow_id);

-- Step Approvers
CREATE INDEX idx_approvers_step_id ON approval_step_approvers(workflow_step_id);
CREATE INDEX idx_approvers_user_id ON approval_step_approvers(approver_id);

-- Requests
CREATE INDEX idx_requests_workflow_id ON approval_requests(workflow_id);
CREATE INDEX idx_requests_status ON approval_requests(status);
CREATE INDEX idx_requests_entity ON approval_requests(entity_type, entity_id);

-- Request Steps
CREATE INDEX idx_request_steps_request_id ON approval_request_steps(request_id);
CREATE INDEX idx_request_steps_status ON approval_request_steps(status);

-- Step Approvals
CREATE INDEX idx_step_approvals_request_step ON approval_request_step_approvals(request_step_id);
CREATE INDEX idx_step_approvals_result ON approval_request_step_approvals(approval_result);
```

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/enums/approval-workflow.enum.ts` | Enums |
| `utils/approvalWorkflow.utils.ts` | Workflow queries |
| `utils/approvalRequest.utils.ts` | Request queries |
| `controllers/approvalWorkflow.ctrl.ts` | Workflow controller |
| `controllers/approvalRequest.ctrl.ts` | Request controller |
| `routes/approvalWorkflow.route.ts` | Workflow routes |
| `routes/approvalRequest.route.ts` | Request routes |

### Frontend

| File | Purpose |
|------|---------|
| `domain/enums/aiApprovalWorkflow.enum.ts` | Client enums |
| `repository/approvalWorkflow.repository.ts` | Workflow API |
| `repository/approvalRequest.repository.ts` | Request API |
| `components/Layout/ApprovalButton.tsx` | Action button |
| `pages/ApprovalWorkflows/ApprovalWorkflowsTable.tsx` | Management page |

## Related Documentation

- [Use Cases](./use-cases.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Incident Management](./incidents.md)
