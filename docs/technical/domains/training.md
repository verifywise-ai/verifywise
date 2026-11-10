# Training Registry Domain

## Overview

The Training Registry in VerifyWise provides a centralized system for tracking organizational AI training programs. It supports training lifecycle management with status tracking, participant counts, department associations, and integration with reporting and automation systems.

## Key Features

- Training program registration and tracking
- Status lifecycle (Planned → In Progress → Completed)
- Participant count management
- Department and provider categorization
- Filtering, grouping, and search
- Report generation integration
- Automation triggers for notifications

## Database Schema

### Training Register Table

```
trainingregistar
├── id (PK, SERIAL)
├── training_name (VARCHAR NOT NULL)
├── duration (VARCHAR) -- e.g., "2 hours", "3 days"
├── provider (VARCHAR) -- e.g., "Internal", "External Vendor"
├── department (VARCHAR)
├── status (ENUM)
├── people (INTEGER) -- Maps to numberOfPeople in API
├── description (VARCHAR, optional)
├── is_demo (BOOLEAN, default: false)
├── createdAt (DATE)
└── updatedAt (DATE)
```

## Enumerations

### Training Status

```typescript
enum TrainingStatus {
  PLANNED = "Planned"
  IN_PROGRESS = "In Progress"
  COMPLETED = "Completed"
}
```

### Progress Percentage

| Status | Percentage |
|--------|------------|
| Planned | 0% |
| In Progress | 50% |
| Completed | 100% |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/training/` | Get all training records |
| GET | `/training/training-id/:id` | Get training by ID |
| POST | `/training/` | Create training |
| PATCH | `/training/:id` | Update training |
| DELETE | `/training/:id` | Delete training |

All endpoints require JWT authentication.

## Create Training Request

```typescript
POST /training/
{
  training_name: "AI Ethics Fundamentals",
  duration: "4 hours",
  provider: "Internal Training",
  department: "Engineering",
  status: "Planned",
  numberOfPeople: 25,
  description: "Introduction to AI ethics principles and best practices"
}
```

## Training Interface

```typescript
interface ITrainingRegister {
  id?: number;
  training_name: string;
  duration: string;
  provider: string;
  department: string;
  status: "Planned" | "In Progress" | "Completed";
  numberOfPeople: number;
  description: string;
}
```

## Validation Rules

### Field Validation

| Field | Rule |
|-------|------|
| training_name | 2-255 characters |
| department | 1-100 characters |
| provider | 1-255 characters |
| duration | 1-1000 characters, include time units |
| numberOfPeople | 1-1000 (warning if > 500) |
| description | 1-2000 characters (optional) |

### Business Rules

| Rule | Description |
|------|-------------|
| No restart | Cannot change "Completed" back to "Planned" |
| No completion from cancelled | Cannot mark "Cancelled" as completed |
| No participant reduction | Cannot reduce participants for "In Progress" or "Completed" |

```typescript
validateTrainingRegistrarUpdateBusinessRules(old, new) {
  if (old.status === "Completed" && new.status === "Planned") {
    throw Error("Cannot change completed training back to planned");
  }
  if ((old.status === "In Progress" || old.status === "Completed")
      && new.numberOfPeople < old.numberOfPeople) {
    throw Error("Cannot reduce participant count");
  }
}
```

## Status Lifecycle

```
[Planned] → [In Progress] → [Completed]
    ↓
(Cannot revert from Completed)
```

## Frontend Structure

### Main Page

**Location:** `pages/TrainingRegistar/index.tsx`

**Features:**
- CRUD operations with modal forms
- Filtering by status, provider, department
- GroupBy (status, provider, department)
- Search functionality
- Export to CSV/Excel
- Pagination with configurable rows
- Permission checks (Admin/Editor for creation)
- URL parameter support for direct edit

### Key Components

| Component | Purpose |
|-----------|---------|
| `TrainingRegistar` | Main page |
| `TrainingTable` | Sortable, paginated table |
| `NewTraining` | Create/edit modal |
| `TrainingSteps` | User onboarding tour |

### Table Features

- Sortable columns (name, duration, provider, department, status, participants)
- Clickable rows to edit
- Delete with confirmation
- Pagination (10, 15, 25 rows)
- localStorage persistence for sort state
- Status badges with color coding
- Loading/empty states

### Modal Form Fields

| Field | Type | Required |
|-------|------|----------|
| Training name | Text | Yes |
| Duration | Text | Yes |
| Provider | Text | Yes |
| Department | Text | Yes |
| Status | Select | Yes |
| Number of people | Number | Yes |
| Description | Textarea | No |

## Dashboard Integration

Training metrics displayed on main dashboard:
- Total training count
- Distribution by status
- Completion percentage
- Total participants tracked
- Recent trainings list

## Report Integration

Training data included in organization reports:

```typescript
interface TrainingRegistrySectionData {
  totalRecords: number;
  records: {
    id: number;
    trainingName: string;
    completionDate?: string;
    status: string;
    assignee?: string;
  }[];
}
```

Report sections:
- Standalone training registry reports
- Combined organization reports
- Custom section selection

## Automation Triggers

| Trigger | Event |
|---------|-------|
| `training_added` | New training created |
| `training_updated` | Training modified |
| `training_deleted` | Training deleted |

### Template Variables

For training notifications:
- `training.name` - Training name
- `training.description` - Description
- `training.duration` - Duration
- `training.provider` - Provider name
- `training.department` - Department name
- `training.status` - Current status
- `training.number_of_people` - Participant count
- `old_training.*` - Previous values (on update)
- `changes_summary` - Formatted list of changes
- `date_and_time` - Current timestamp

## Search Integration

Training records searchable via Wise Search:
- Search type: `training_registar` → "Training"
- Search results can open edit modal
- Uses `trainingId` URL parameter

## API Response Mapping

Database to API field mapping:

| Database | API |
|----------|-----|
| `people` | `numberOfPeople` |

Controller handles mapping before updates.

## Model Methods

### Static Methods

```typescript
static createNewTrainingRegister(data)
static findByIdWithValidation(id, tenant)
static findByStatus(status, tenant)
static findByDepartment(department, tenant)
```

### Instance Methods

```typescript
isPlanned(): boolean
isInProgress(): boolean
isCompleted(): boolean
getProgressPercentage(): number
getSummary(): object
validateTrainingRegisterData(): void
```

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/trainingRegistar/trainingRegistar.model.ts` | Model |
| `domain.layer/interfaces/i.trainingRegister.ts` | Interface |
| `utils/trainingRegistar.utils.ts` | Queries |
| `utils/validations/trainingValidation.utils.ts` | Validation |
| `utils/automation/training.automation.utils.ts` | Automation |
| `controllers/trainingRegistar.ctrl.ts` | Controller |
| `routes/trainingRegistar.route.ts` | Routes |

### Frontend

| File | Purpose |
|------|---------|
| `domain/models/Common/trainingRegistar/trainingRegistar.model.ts` | Client model |
| `domain/enums/status.enum.ts` | Status enum |
| `application/repository/trainingregistar.repository.ts` | API calls |
| `pages/TrainingRegistar/index.tsx` | Main page |
| `pages/TrainingRegistar/trainingTable.tsx` | Table |
| `components/Modals/NewTraining/index.tsx` | Modal |

## Training Assignments

A training can be assigned to named people with a due date (#5260). Assignments are separate from the `people` headcount on the training record, which they do not change.

### Table: `training_assignments`

One row per person per training, `UNIQUE (training_id, user_id)`, with row-level security on `organization_id`.

| Column | Notes |
|--------|-------|
| `training_id` | Cascades when the training is deleted |
| `user_id` | Cascades when the user is deleted |
| `due_date` | `DATE`, required |
| `completed_at`, `completed_by` | `completed_at` is null while the assignment is open |
| `assigned_by` | Set to null when that user is deleted |
| `due_soon_reminded_at`, `overdue_reminded_at` | Reminder dedupe |

Status is derived, never stored: `completed` when `completed_at` is set, `overdue` when `due_date` is before today and the assignment is open, otherwise `pending`.

Groups (#5253) do not exist yet. When they do, a group should expand to one row per member, because completion is tracked per person.

### Endpoints

All under `/api/v1/training`, authenticated.

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| GET | `/assignments?training_id=N` | Any org user | Assignments of one training |
| GET | `/assignments/mine` | Any org user | The caller's assignments |
| GET | `/assignments/summary` | Any org user | Total, completed and overdue per training |
| POST | `/assignments` | `training.edit` | Assign `user_ids` with a `due_date`. Already-assigned users are skipped and returned in `skipped_user_ids` |
| POST | `/assignments/complete-all` | `training.edit` | Complete every open assignment of a training |
| PATCH | `/assignments/:id` | `training.edit` | Change the due date |
| POST | `/assignments/:id/complete` | Assignee or `training.edit` | Mark complete. Keeps the first completion |
| POST | `/assignments/:id/reopen` | Assignee or `training.edit` | Clear the completion |
| DELETE | `/assignments/:id` | `training.edit` | Remove the assignment |

Assignees are checked against the organization's current members, since a user can belong to several organizations. A request naming a non-member is rejected whole. Lists and reminders leave out people who have left the organization.

Changing a training's status to Completed does not complete its assignments. A finished training record does not show that each person took it, so completing everyone is an explicit action.

### Change history

Assign, due date change, complete, reopen and remove each write a row to `training_change_history` with the field name `Assignment: <person>`, and so to the audit ledger. They appear in the Activity tab of the training record. The person's name, the old state and the actor are stored on the row, so reopening or removing an assignment keeps the record of what it was. Completion is self-reported and needs no proof; certificates belong in the training's evidence.

### Notifications and reminders

- On assignment each new assignee gets an in-app notice and the `training-assigned` email. A failed email does not fail the save.
- A daily job at 08:30 server time (`trainingAssignmentReminderSweep`) sends the `training-reminder` email once when an open assignment is due within 7 days, and once when it is overdue. A failed send is not stamped and retries the next day.
- An assignment created with a due date within 7 days skips the due-soon reminder, since the assignment notice covers it. Changing the due date or reopening an assignment restarts the reminders.
- The server accepts a due date one day before today in UTC, because in the evening west of UTC the user's today is already yesterday in UTC.

## Related Documentation

- [Reporting](./reporting.md)
- [Automations](../infrastructure/automations.md)
- [Use Cases](./use-cases.md)
