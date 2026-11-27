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

`approval_step_approvers` rows are what make a policy workflow usable; see
[Usable policy workflow](#usable-policy-workflow).

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

| Method | Endpoint                  | Access | Description          |
| ------ | ------------------------- | ------ | -------------------- |
| GET    | `/approval-workflows`     | Auth   | List all workflows   |
| GET    | `/approval-workflows/:id` | Auth   | Get workflow details |
| POST   | `/approval-workflows`     | Admin  | Create workflow      |
| PUT    | `/approval-workflows/:id` | Admin  | Update workflow      |
| DELETE | `/approval-workflows/:id` | Admin  | Soft delete workflow |

### Request Management

| Method | Endpoint                               | Access    | Description              |
| ------ | -------------------------------------- | --------- | ------------------------ |
| POST   | `/approval-requests`                   | Auth      | Create request           |
| GET    | `/approval-requests/my-requests`       | Auth      | User's requests          |
| GET    | `/approval-requests/pending-approvals` | Auth      | Awaiting user's approval |
| GET    | `/approval-requests/all`               | Admin     | All requests             |
| GET    | `/approval-requests/:id`               | Auth      | Request details          |
| POST   | `/approval-requests/:id/approve`       | Approver  | Approve step             |
| POST   | `/approval-requests/:id/reject`        | Approver  | Reject request           |
| POST   | `/approval-requests/:id/withdraw`      | Requestor | Withdraw request         |

`pending-approvals` lists a request only while the user is an approver on its
current step **and** their own vote is still `Pending`. Once they approve a step
that needs every approver, the request leaves their list even though the step
stays pending for the others.

Approve and reject are checked in `processApprovalQuery`, not by the route:

| Caller                                  | Response |
| --------------------------------------- | -------- |
| Not an approver on the current step     | 403      |
| Approver who already voted on this step | 409      |
| Request no longer pending               | 409      |

`processApprovalQuery` locks the `approval_requests` row (`FOR UPDATE`) before
anything else, so decisions on one request run one at a time. Without the lock,
two approvers on a step that needs every approver could vote at once, each
still see the other as pending, and leave the step stuck.

An admin (any role with the `approvalRequest.admin` permission) can decide a
step they are not an approver on, e.g. one stuck on an approver who left. The
override is explicit: the approve/reject body carries `override: true`,
`step_number` (the step the admin means) and a non-empty `comments` reason.

| Override refused because                          | Response |
| ------------------------------------------------- | -------- |
| No comment (checked by the validator)             | 400      |
| Role lacks `approvalRequest.admin`                | 403      |
| The admin made the request                        | 403      |
| `step_number` is no longer the current step       | 409      |
| The admin already voted the other way on the step | 409      |

The admin's vote is written to the step; a vote they already cast the same
way is kept as cast, not rewritten. The step's `step_details` gets
`{ admin_override: true, actor_id, result, reason }`, so an override can be
told apart from a normal decision. An approve completes the step whoever is
still pending; a reject rejects the request as usual. The other approvers'
rows on the step stay "Pending", as they do when one approver completes an
any-approver step. The AI Advisor never overrides. There is no UI for it yet.

The AI Advisor's approve/reject tools call the same function, so the same
rules apply to them. They act as the user who confirmed the action and fail
with an explicit error if no user id reaches them.

Withdraw is checked in `withdrawRequest`:

| Caller or request                    | Response |
| ------------------------------------ | -------- |
| Not the requester                    | 403      |
| Request no longer `Pending`          | 409 ("Only a pending request can be withdrawn") |

A decided request keeps its outcome. Without the 409, withdrawing an approved
request would move its entity (a use case, a policy) back as if it had never
been decided. `withdrawApprovalRequestQuery` also matches `status = 'Pending'`
in its UPDATE, moves no entity when nothing was withdrawn, and returns whether
it withdrew the request.

The advisor's `agent_withdraw_approval_request` applies the same rules: only
the requester (the advisor user) may withdraw, a request that is not `Pending`
is refused ("Only a pending request can be withdrawn"), and a request decided
between the check and the UPDATE is reported as a failure, not as withdrawn.
The withdrawer is recorded as the actor.

`POST /approval-requests` refuses `entity_type: "policy"` with a `400` (field
`entity_type`, "Submit the policy for approval from the policy"), before any
workflow read or insert. Policy requests come only from
`POST /v1/policies/:id/submit-for-approval`; see [Policy requests](#policy-requests).

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

| Setting                         | Behavior                            |
| ------------------------------- | ----------------------------------- |
| `requires_all_approvers: true`  | All assigned approvers must approve |
| `requires_all_approvers: false` | Any one approver can approve        |

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
3. Notification sent to requestor. For a policy or a use case it links to that item, where the
   requester can resubmit it; other entities link to the approval workflows page and name no
   entity on the notification.

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

### Who Gets Notified, and When

Approvers are told it is their turn — they never have to discover the request by opening
**Approval requests** themselves. Every notification below is in-app plus email; a failed email is
logged and never blocks the in-app notification.

| Moment                                    | Who is notified                                  | Sent by                                                                           |
| ----------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Request created manually                  | Step 1 approvers                                 | `createApprovalRequest` (`approvalRequest.ctrl.ts`)                               |
| Use case created with a workflow          | Step 1 approvers                                 | `notifyUseCaseApprovalRequested` (`services/projects/approvalRequest.service.ts`) |
| Workflow attached to an existing use case | Step 1 approvers                                 | same helper, from `updateProjectById`                                             |
| Rejected use case resubmitted             | Step 1 approvers                                 | same helper, from `resubmitUseCaseApproval`                                       |
| Step completed, request advances          | Next step's approvers, plus the requester        | `approveRequest` (`approvalRequest.ctrl.ts`)                                      |
| Request auto-approved on creation         | The requester only — there is nothing to approve | `notifyApprovalAutoApproved`                                                      |
| Request rejected / fully approved         | The requester                                    | `rejectRequest` / `approveRequest`                                                |
| Policy submitted for approval             | Step 1 approvers                                 | `notifyFirstStepApprovers` (`services/approvalRequestNotification.service.ts`)    |
| Entity deleted with a pending request     | The requester ("System" as rejector)             | file and policy delete                                                            |

All of them are sent **after** the transaction commits and are fire-and-forget: a mail or Redis
failure is logged, never surfaced as a failed use case. The requester is skipped if they are also
a step 1 approver — nobody is asked to approve their own request.

### Which Workflows May Be Submitted

`getUsableUseCaseWorkflow` (`Servers/services/projects/approvalRequest.service.ts`) refuses a
submitted `approval_workflow_id` with a `400` (a field error on `approval_workflow_id`) — on create
and on update, on `/api/projects` and `/api/v1/projects` — before anything is written, when the
workflow:

- **does not exist in this organization** (a missing id, or another organization's);
- **is inactive.** Deleting a workflow is a soft delete (`is_active = false`,
  `deleteApprovalWorkflowQuery`), so the row stays readable and a stale id would otherwise still
  start a request;
- **is for another entity type.** Only `entity_type = 'use_case'` workflows govern use cases;
- **has no steps, or a step without approvers.** Nobody could decide the request, and the use
  case's frameworks would wait for it forever. Until this change such a workflow was accepted and
  no request was created, which left the frameworks parked with no review.

### Changing a use case's workflow

While a use case's request is pending or rejected, only holders of `approvalWorkflow.admin` may
clear or replace its workflow (403 for anyone else); the requester withdraws through the withdraw
route. Clearing it never attaches the frameworks of a rejected use case, and a rejected use case
cannot go live. Anyone who may edit a rejected use case can send it for review again under the same
workflow with `POST /api/v1/projects/:id/resubmit-approval`. A resubmission is never
auto-approved, whatever the workflow's auto-approve level: a person rejected it, so a person
reviews it again. Details:
[Use cases](./use-cases.md#changing-the-approval-workflow) and
[Resubmitting a rejected use case](./use-cases.md#resubmitting-a-rejected-use-case).

## Policy requests

Policies use the generic workflow tables with `entity_type = 'policy'`. The
policy side (statuses, submit, direct approve, the v1 endpoints) is in
[Policies](./policies.md#statuses-and-approval).

### Usable policy workflow

Only a *usable* workflow can take a policy request: it belongs to the
organization, has `entity_type = 'policy'`, is active, has at least one step,
and every step has at least one row in `approval_step_approvers`
(`getUsablePolicyWorkflows`, `services/policies/policyApproval.service.ts`).
Approvers are counted with the same organization filter `getWorkflowStepsQuery`
uses, so a usable workflow always puts approvers on the request it creates.

The "Policy Approval" workflow seeded for every organization by
`20260413175412-extend-entity-types-and-seed-workflows.js` has one step and no
approvers, so it is not usable and is ignored. No data migration changes it. An
organization with no usable policy workflow approves policies through an
Admin's direct approval instead. Other entity types do not use this rule.

### What a decision does to the policy

`processApprovalQuery` and `withdrawApprovalRequestQuery` call
`applyPolicyApprovalDecision` (`utils/policyApprovalDecision.utils.ts`) for
policy requests, inside the caller's transaction, next to the use case and file
branches:

| Decision                      | Policy status | review_status       |
| ----------------------------- | ------------- | ------------------- |
| Final approval                | Approved      | `approved`          |
| Rejection at any step         | Draft         | `changes_requested` |
| Withdraw                      | Draft         | NULL                |

Approval and rejection also set `reviewed_by`, `reviewed_at` and
`review_comment` from the decider. Each UPDATE matches `organization_id`,
`status = 'Under Review'`, and requires the request to be a policy request for
this policy on a policy workflow. When no row matches, the decision still goes
through and a warning is logged; a policy decision is never blocked by the
policy row. The status change is recorded in policy change history with the
decider or withdrawer as the actor.

Notifications for policy requests carry `entity_type` POLICY and the policy id:

- Step approvers (step 1 and later steps) get a link to `/approval-workflows?request=:requestId`, which opens the approval requests modal on that request (the same link the Home queue uses). The notification bell rewrites links stored before this change (`/approval-requests/:id`) to the same address.
- The requester's approved and rejected notifications link to the policy editor, `/policies/:id/edit`.

## Notification links

Approval notices (in-app `action_url` and the email button) are built from
two helpers in `utils/approvalLinks.utils.ts`:
`approvalLinkedEntity(entity_type, entity_id)` returns the use case or policy
the request is about (null for anything else), and
`approvalRequestPath(requestId)` gives `/approval-workflows?request=:id`, which
opens the approvals modal in whichever tab lists the request. There is no
`/approval-requests/:id` or `/use-cases/:id` page.

| Notice | Use case | Policy | Other entities |
| --- | --- | --- | --- |
| Approver asked to decide (any step) | use case page | request | request |
| Step N approved, rejected (to the requester) | use case page | policy editor | request |
| Fully approved | use case page | policy editor (`/policies` without an id) | model, risk, vendor: their list page; anything else: request |
| Auto-approved (use cases only) | use case page | — | — |
| File upload approver; rejection when a file or policy is deleted | — | request | request |

- An approval request id is never stored as a notice's `entity_id`. A notice
  without a linked item leaves `entity_id` empty; fully approved notices keep a
  label type (file, AI action, model, risk, vendor) with no id, and any other
  type names no entity ("Request fully approved").
- Notifiers that take a `useCase.id` argument (`notifyApprovalRequested`,
  `notifyApprovalComplete`, `notifyApprovalAutoApproved`) receive the request
  id there; the item comes separately (`entity`, `entityId`, `useCaseId`).

## Deleting an entity with a pending request

`rejectApprovalRequestOnEntityDelete` (`utils/approvalRequest.utils.ts`) rejects
a pending request when its entity is deleted: the request becomes `Rejected`,
its pending steps `Rejected`, and its pending approver rows get
`approval_result = 'Rejected'`, the reason as `comments`, and `approved_at`.
It locks the request row and does nothing when the request is no longer
pending.

- **Files**: `removeFile` calls it before deleting the file, in its own
  transaction.
- **Policies**: `deletePolicyById` and the advisor's `agent_delete_policy` call
  it through `rejectPendingPolicyRequestOnDelete`, inside the delete's
  transaction (the optional fourth argument), with the reason "The policy was
  deleted." The policy row is locked first, so a concurrent submit cannot slip
  a new pending request in after the read.

The requester is notified after the commit. Up to v2.6.8 the third UPDATE
wrote `status` and `date_responded`, which are not columns of
`approval_request_step_approvals`, so the rejection failed and a deleted file
left its request `Pending`. It now writes `approval_result` and `approved_at`.

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
  { framework_id: 1 }, // EU AI Act
  { framework_id: 2 }, // ISO 42001
  { framework_id: 3 }, // ISO 27001
  { framework_id: 4 }, // NIST AI RMF
];
```

## Integration Points

### Project Integration

```
projects
├── approval_workflow_id (FK → approval_workflows)
├── has_pending_approval (computed)
└── approval_status (computed from the newest pending/approved/rejected request: pending/rejected/null)
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
   ├── Reject it (400) if missing, inactive, not a use_case workflow, or a step has no approver
   ├── Create approval request
   ├── Set entity_type to "use_case"
   └── Notify the step 1 approvers (after commit)
    ↓
4. Workflow progresses through steps
    ↓
5. If approved:
   ├── Create pending frameworks
   └── Clear pending_frameworks field
```

## Access Control

| Role     | Create Workflows | Create Requests | Approve         | Withdraw         |
| -------- | ---------------- | --------------- | --------------- | ---------------- |
| Admin    | ✓                | ✓               | ✓ (if assigned) | ✓ (if requestor) |
| Editor   | -                | ✓               | ✓ (if assigned) | ✓ (if requestor) |
| Reviewer | -                | ✓               | ✓ (if assigned) | ✓ (if requestor) |
| Auditor  | -                | -               | -               | -                |

## AI advisor approval rules

Separate from the workflows above: every AI advisor write tool goes through
the approval gateway (`Servers/advisor/approval/approvalGateway.ts`), which
asks the rule engine (`ruleEngine.ts`) whether to run it at once, queue it for
an Admin, or refuse it. Default rules are in `rules/defaultRules.ts`; an
organization can add or override rules by name through
`/api/ai-approval-rules`, which needs `aiConfirmation.admin` to create, update
or delete (Admins by default). Listing and the dry run (`POST /test`) only need
a login.

- **Requester role.** The gateway looks up the requester's current role in the
  organization and passes it as the `user_role` fact. A user whose role can't
  be resolved is `Unknown`, which matches no role rule. If the lookup itself
  fails, the write is refused rather than evaluated without a role. Until
  2026-11 no role was passed and every requester was `Editor`, so role rules
  never matched.
- **`auditor-write-block`.** Refuses every advisor write by an Auditor except
  `AUDITOR_WRITE_TOOLS`: tools that run without approval (info level), as the
  requester, on the requester's own records. Today that is marking
  notifications read. A tool that needs approval runs as the approving Admin,
  so it can't act for the Auditor. The refusal shows the rule's reason.
- **Limit.** The rule matches the built-in role name `Auditor`. A custom
  read-only role is not covered by it and relies on each tool's own permission
  check for the user who asked.

## Utility Functions

### Workflow Utils

```typescript
getAllApprovalWorkflowsQuery(tenant);
getApprovalWorkflowByIdQuery(id, tenant);
getWorkflowStepsQuery(workflowId, tenant);
createApprovalWorkflowQuery(data, tenant);
updateApprovalWorkflowQuery(id, data, tenant);
deleteApprovalWorkflowQuery(id, tenant);
```

### Request Utils

```typescript
createApprovalRequestQuery(data, tenant);
getPendingApprovalsQuery(userId, tenant);
getMyApprovalRequestsQuery(userId, tenant);
getApprovalRequestByIdQuery(requestId, tenant);
processApprovalQuery(requestId, userId, action, comments, tenant);
withdrawApprovalRequestQuery(requestId, userId, tenant);
hasPendingApprovalQuery(entityId, entityType, tenant);
getApprovalStatusQuery(entityId, entityType, tenant);
```

## Frontend Structure

### Components

| Component                | Purpose                     |
| ------------------------ | --------------------------- |
| `ApprovalButton`         | Action button for approvals |
| `ApprovalWorkflowsTable` | Workflow management page    |

### Repositories

```typescript
// approvalWorkflow.repository.ts
getAllApprovalWorkflows();
getApprovalWorkflowById(id);
createApprovalWorkflow(data);
updateApprovalWorkflow(id, data);
deleteApprovalWorkflow(id);

// approvalRequest.repository.ts
createApprovalRequest(data);
getMyApprovalRequests();
getPendingApprovals();
getApprovalRequestById(id);
approveRequest(id, comments);
rejectRequest(id, comments);
withdrawRequest(id);
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

| File                                           | Purpose             |
| ---------------------------------------------- | ------------------- |
| `domain.layer/enums/approval-workflow.enum.ts` | Enums               |
| `utils/approvalWorkflow.utils.ts`              | Workflow queries    |
| `utils/approvalRequest.utils.ts`               | Request queries     |
| `utils/policyApprovalDecision.utils.ts`        | Policy decision branch |
| `services/policies/policyApproval.service.ts`  | Policy submit, usable workflows |
| `services/approvalRequestNotification.service.ts` | Step 1 approver notifications |
| `controllers/approvalWorkflow.ctrl.ts`         | Workflow controller |
| `controllers/approvalRequest.ctrl.ts`          | Request controller  |
| `routes/approvalWorkflow.route.ts`             | Workflow routes     |
| `routes/approvalRequest.route.ts`              | Request routes      |

### Frontend

| File                                                 | Purpose         |
| ---------------------------------------------------- | --------------- |
| `domain/enums/aiApprovalWorkflow.enum.ts`            | Client enums    |
| `repository/approvalWorkflow.repository.ts`          | Workflow API    |
| `repository/approvalRequest.repository.ts`           | Request API     |
| `components/Layout/ApprovalButton.tsx`               | Action button   |
| `pages/ApprovalWorkflows/ApprovalWorkflowsTable.tsx` | Management page |

## Related Documentation

- [Use Cases](./use-cases.md)
- [Policies](./policies.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Incident Management](./incidents.md)
