# Task Management

## Overview

The Task Management domain provides comprehensive functionality for creating, assigning, and tracking tasks within VerifyWise. Tasks support multi-assignee collaboration, category tagging, priority levels, and integrate with the automation system for notifications.

## Key Features

- Multi-assignee task assignment (up to 20 users)
- Category tagging with JSONB storage
- Priority levels (Low, Medium, High)
- Status workflow with soft delete
- Role-based visibility (creators/assignees vs admins)
- Comprehensive filtering and pagination
- Linked items: vendors, models, policies, incidents and framework requirements
- Automation triggers for task events
- AI Advisor integration for task analytics

## Database Schema

### Tasks Table

```
{tenant}.tasks
├── id (PK, SERIAL)
├── title (VARCHAR(255) NOT NULL)
├── description (TEXT)
├── creator_id (FK → public.users)
├── organization_id (FK → public.organizations)
├── due_date (TIMESTAMPTZ)
├── priority (ENUM: Low/Medium/High, default: Medium)
├── status (ENUM: Open/In Progress/Completed/Overdue/Deleted, default: Open)
├── categories (JSONB, default: [])
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### Task Assignees Table

```
{tenant}.task_assignees
├── id (PK, SERIAL)
├── task_id (FK → tasks, CASCADE DELETE)
├── user_id (FK → public.users, CASCADE DELETE)
├── assigned_at (TIMESTAMPTZ)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

Constraints:
└── UNIQUE(task_id, user_id)
```

### Indexes

```sql
-- Tasks indexes
CREATE INDEX {tenant}_tasks_creator_id_idx ON tasks(creator_id);
CREATE INDEX {tenant}_tasks_organization_id_idx ON tasks(organization_id);
CREATE INDEX {tenant}_tasks_due_date_idx ON tasks(due_date);
CREATE INDEX {tenant}_tasks_status_idx ON tasks(status);
CREATE INDEX {tenant}_tasks_priority_idx ON tasks(priority);
CREATE INDEX {tenant}_tasks_created_at_idx ON tasks(created_at);

-- Assignees indexes
CREATE INDEX {tenant}_task_assignees_task_id_idx ON task_assignees(task_id);
CREATE INDEX {tenant}_task_assignees_user_id_idx ON task_assignees(user_id);
```

## Enums

### Task Priority

```typescript
enum TaskPriority {
  LOW = "Low",
  MEDIUM = "Medium",
  HIGH = "High",
}
```

### Task Status

```typescript
enum TaskStatus {
  OPEN = "Open",
  IN_PROGRESS = "In Progress",
  COMPLETED = "Completed",
  OVERDUE = "Overdue",
  DELETED = "Deleted",
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks` | List tasks with filters |
| GET | `/tasks/:id` | Get task by ID |
| POST | `/tasks` | Create task |
| PUT | `/tasks/:id` | Update task |
| PUT | `/tasks/:id/restore` | Restore deleted task |
| DELETE | `/tasks/:id` | Soft delete task |
| DELETE | `/tasks/:id/hard` | Permanently delete |
| GET | `/tasks/:id/entities` | List the task's linked items |
| POST | `/tasks/:id/entities` | Link an item to the task |
| DELETE | `/tasks/:id/entities/:linkId` | Remove a linked item |

### Query Parameters (GET /tasks)

**Filters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string/array | Filter by status |
| `priority` | string/array | Filter by priority |
| `due_date_start` | ISO date | Due date range start |
| `due_date_end` | ISO date | Due date range end |
| `category` | string/array | Filter by categories |
| `assignee` | number/array | Filter by assignee IDs |
| `search` | string | Search title/description |
| `include_archived` | boolean | Include deleted tasks |
| `linked_entity_type` + `linked_entity_id` | string + positive integer | Only tasks linked to this item (see [Linked items](#linked-items)). Send both or neither: one alone, an unknown type or an id that is not a positive integer answers 400. Visibility rules still apply |

**Pagination:**

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `page` | 1 | 1000 | Page number |
| `page_size` | 25 | 100 | Items per page |
| `sort_by` | created_at | - | Sort field |
| `sort_order` | DESC | - | ASC or DESC |

## Linked items

A task can be linked to items elsewhere in the app. Each link is a row in
`task_entity_links` (`organization_id`, `task_id`, `entity_type`, `entity_id`,
`entity_name`). `entity_type` is `VARCHAR(50)` with no CHECK constraint and
there is no foreign key to the item, so the valid types live in code:
`VALID_ENTITY_TYPES` and `TASK_ENTITY_TABLES` in
`Servers/utils/taskEntityLink.utils.ts`.

| Type | Table | Who may link it |
|------|-------|-----------------|
| `vendor` | `vendors` | Anyone who can see the task |
| `model` | `model_inventories` | Anyone who can see the task |
| `policy` | `policy_manager` | Anyone who can see the task |
| `incident` | `ai_incident_managements` | Anyone who can see the task, while the incident is not archived |
| `nist_subcategory`, `iso42001_subclause`, `iso42001_annexcategory`, `iso27001_subclause`, `iso27001_annexcontrol`, `eu_control`, `eu_subcontrol` | the framework's requirement table | Users who can see the requirement's use case (`canLinkTaskToEntityQuery`) |

Vendors, models, policies and incidents belong to the organization
(`ORGANIZATION_WIDE_LINK_TYPES`); a link to one never gives the task's
assignees access to a use case. A link to a framework requirement does
(`taskAssigneeOfProjectSql`).

Links are written by `POST /tasks/:id/entities` and, inside the task's own
transaction, by `entity_links` on task create and update
(`persistTaskEntityLinks`: additive, skips anything invalid instead of failing
the save, and never re-checks a link the task already has).

**Incidents.** Every member reads incidents, so linking one needs no use case
access. An archived incident cannot be linked: `POST /tasks/:id/entities`
answers 409 ("Restore this incident before linking it to a task.") and
`persistTaskEntityLinks` skips it. Links made before the incident was
archived stay. An incident link is named by the incident's visible id and use
case ("INC-12 · Credit scoring", `INCIDENT_LINK_NAME_SQL`), read from the
incident on every read rather than from the stored `entity_name`, so it
follows the use case. Hard-deleting an incident deletes its links in the same
transaction (`deleteIncidentByIdQuery`), as deleting a vendor or a policy
does. The critical incident workflow links its remediation task to the
incident (see [incidents.md](./incidents.md#critical-incident-response-workflow)).

**Where links show.** The task drawer's "Linked Items" field
(`presentation/components/EntityLinkSelector`) lists and edits them;
incidents are picked from a searchable list (by incident ID or use case) with
archived incidents left out. The incident drawer's "Linked tasks" tab
(`presentation/components/LinkedTasks`, `useLinkedTasks`) lists the tasks
linked to the incident that the user can see, through `GET /tasks` with
`linked_entity_type=incident`; clicking one opens it on the tasks page
(`/tasks?taskId=<id>`). Task emails name each link and link to it
(`buildEntityUrlAsync` in `services/inAppNotification.service.ts`; an
incident opens `/ai-incident-managements?incidentId=<id>`).

### Create Task Request

```json
{
  "title": "Review compliance documentation",
  "description": "Review and update EU AI Act compliance docs",
  "due_date": "2025-01-25T10:00:00Z",
  "priority": "High",
  "status": "Open",
  "categories": ["compliance", "documentation"],
  "assignees": [1, 2, 3]
}
```

### Task Response

```json
{
  "id": 1,
  "title": "Review compliance documentation",
  "description": "Review and update EU AI Act compliance docs",
  "creator_id": 123,
  "organization_id": 456,
  "due_date": "2025-01-25T10:00:00Z",
  "priority": "High",
  "status": "Open",
  "categories": ["compliance", "documentation"],
  "created_at": "2025-01-17T10:00:00Z",
  "updated_at": "2025-01-17T10:00:00Z",
  "assignees": [1, 2, 3],
  "assignee_names": ["John Doe", "Jane Smith", "Bob Wilson"],
  "creator_name": "Admin User",
  "isOverdue": false
}
```

## Validation Rules

### Field Validation

| Field | Min | Max | Required | Rules |
|-------|-----|-----|----------|-------|
| title | 1 | 255 | Yes | Non-empty string |
| description | 0 | 5000 | No | Optional text |
| due_date | - | - | No | Future date for OPEN tasks |
| priority | - | - | Yes | Valid enum value |
| status | - | - | Yes | Valid enum value |
| categories | 0 | 10 items | No | 2-50 chars each, no duplicates |
| assignees | 0 | 20 users | No | Valid user IDs, no duplicates |

### Business Rules

**Creation:**
- Due date must be within 1 day past to 1 year future
- High priority tasks should have due dates within 1 week
- Initial status limited to Open or In Progress

**Updates:**
- Cannot reopen completed tasks
- Cannot modify due date on completed tasks
- Cannot decrease priority on overdue tasks
- Deleted tasks must use restore endpoint

## Permission Model

### Role-Based Visibility

**Non-Admin Users:**
```sql
-- Can only see tasks where they are creator or assignee
SELECT t.* FROM tasks t
LEFT JOIN task_assignees ta ON t.id = ta.task_id
WHERE (t.creator_id = :userId OR ta.user_id = :userId)
AND t.organization_id = :orgId
```

**Admin Users:**
```sql
-- Can see all tasks in their organization
SELECT * FROM tasks
WHERE organization_id = :orgId
```

### Update Permissions

| Action | Creator | Assignee | Admin |
|--------|---------|----------|-------|
| Update title/description | ✓ | ✓ | ✓ |
| Update due_date | ✓ | ✗ | ✓ |
| Update priority | ✓ | ✗ | ✓ |
| Update status | ✓ | ✓ | ✓ |
| Delete task | ✓ | ✗ | ✓ |
| Restore task | ✓ | ✗ | ✓ |

## Soft Delete Pattern

Tasks use soft delete for audit trail preservation:

```typescript
// Soft delete - sets status to DELETED
DELETE /tasks/:id
// Task remains in database, excluded from normal queries

// View deleted tasks
GET /tasks?include_archived=true

// Restore deleted task
PUT /tasks/:id/restore
// Sets status back to OPEN

// Permanent delete
DELETE /tasks/:id/hard
// Removes task and assignees permanently
```

## Automation Integration

Task events trigger automations for notifications:

### Triggers

| Trigger | Event |
|---------|-------|
| `task_added` | New task created |
| `task_updated` | Task modified |
| `task_deleted` | Task soft deleted |

### Template Variables

```
task.id          - Task ID
task.title       - Task title
task.description - Task description
task.creator     - Creator name
task.assignees   - Comma-separated assignee names
task.due_date    - Formatted due date
task.priority    - Priority level
task.status      - Current status
task.categories  - Comma-separated categories
date_and_time    - Current timestamp
```

For updates, also includes `old_*` versions for before/after comparison.

## AI Advisor Integration

The AI Advisor can query and analyze tasks:

### Available Functions

```typescript
// Search tasks by criteria
fetch_tasks({
  status: "Overdue",
  priority: "High",
  category: "compliance"
})

// Get task statistics
get_task_analytics()
// Returns status distribution, priority breakdown, overdue count

// Executive summary
get_task_executive_summary()
// High-level overview of task landscape
```

## Status Transitions

```
                    ┌─────────────┐
                    │    OPEN     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │IN PROGRESS│  │ OVERDUE  │  │ DELETED  │
       └─────┬────┘  └────┬─────┘  └──────────┘
             │            │              ▲
             └─────┬──────┘              │
                   ▼                     │
            ┌──────────┐                 │
            │COMPLETED │                 │
            └──────────┘                 │
                   │                     │
                   └─────────────────────┘
                        (restore)
```

**Allowed Transitions:**
- OPEN → IN_PROGRESS, OVERDUE, DELETED
- IN_PROGRESS → COMPLETED, OVERDUE, DELETED
- OVERDUE → COMPLETED, DELETED
- DELETED → OPEN (via restore endpoint)
- COMPLETED → DELETED (archive only)

## Data Flow

### Create Task Flow

```
1. POST /tasks with task data
2. JWT authentication verified
3. Field and business rule validation
4. Transaction begins
5. Task created in {tenant}.tasks
6. Assignees inserted into task_assignees
7. Automation triggers executed (task_added)
8. Transaction committed
9. Response with full task data + assignees
```

### Update Task Flow

```
1. PUT /tasks/:id with partial data
2. Permission check (creator/assignee/admin)
3. Existing task fetched
4. Schedule updates: creator/admin only
5. Status updates: creator/assignee/admin
6. Transaction begins
7. Task updated, assignees replaced if provided
8. Automation triggers executed (task_updated)
9. Transaction committed
```

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/tasks/tasks.model.ts` | Task Sequelize model |
| `domain.layer/models/taskAssignees/taskAssignees.model.ts` | Assignee model |
| `domain.layer/enums/task-priority.enum.ts` | Priority enum |
| `domain.layer/enums/task-status.enum.ts` | Status enum |
| `controllers/task.ctrl.ts` | API handlers |
| `routes/task.route.ts` | Route definitions |
| `utils/task.utils.ts` | Query functions |
| `utils/validations/tasksValidation.utils.ts` | Validation schemas |
| `utils/automation/task.automation.utils.ts` | Automation triggers |
| `utils/taskEntityLink.utils.ts` | Linked items: types, access, names |
| `controllers/taskEntityLink.ctrl.ts` | Linked items API handlers |
| `advisor/tools/taskTools.ts` | AI tool definitions |

### Frontend

| File | Purpose |
|------|---------|
| `domain/enums/task.enum.ts` | Enums |
| `domain/models/Common/task/task.model.ts` | Task model |
| `application/repository/task.repository.ts` | API integration |
| `application/hooks/useTasks.ts` | Task lists, including `useLinkedTasks` |
| `presentation/components/EntityLinkSelector/` | The task drawer's linked items |
| `presentation/components/LinkedTasks/` | Read-only list of the tasks linked to an item |
| `application/dtos/task.dto.ts` | Data transfer objects |
| `presentation/pages/Tasks/` | Task pages |

## Related Documentation

- [Automations](../infrastructure/automations.md)
- [Authentication](../architecture/authentication.md)
- [API Conventions](../guides/api-conventions.md)
