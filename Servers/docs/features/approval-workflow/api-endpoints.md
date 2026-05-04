# API Endpoints Documentation

## Base URL

```
http://localhost:3000/api
```

All endpoints require authentication via JWT token in Authorization header:

```
Authorization: Bearer <token>
```

---

## Approval Workflows

### GET /approval-workflows

List all approval workflows.

**Access**: All authenticated users
**Route**: `routes/approvalWorkflow.route.ts:36-41`

**Request**:

```http
GET /api/approval-workflows
Authorization: Bearer <token>
```

**Response** (`200 OK`):

```json
{
  "message": "Approval workflows retrieved successfully",
  "data": [
    {
      "id": 1,
      "workflow_title": "Use Case Approval",
      "entity": 1,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "steps": [
        {
          "id": 1,
          "step_number": 1,
          "step_name": "Marketing Review",
          "requires_all_approvers": false,
          "approvers": [
            {
              "approver_id": 2,
              "user_name": "John Doe",
              "user_email": "john@example.com"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### GET /approval-workflows/:id

Get a single approval workflow by ID.

**Access**: All authenticated users
**Route**: `routes/approvalWorkflow.route.ts:48-53`

**Request**:

```http
GET /api/approval-workflows/1
Authorization: Bearer <token>
```

**Response** (`200 OK`):

```json
{
  "message": "Approval workflow retrieved successfully",
  "data": {
    "id": 1,
    "workflow_title": "Use Case Approval",
    "entity": 1,
    "created_at": "2024-01-01T00:00:00.000Z",
    "steps": [...]
  }
}
```

**Error** (`404 Not Found`):

```json
{
  "error": "Workflow not found"
}
```

---

### POST /approval-workflows

Create a new approval workflow.

**Access**: Admin only
**Route**: `routes/approvalWorkflow.route.ts:60-65`
**Controller**: `controllers/approvalWorkflow.ctrl.ts:createApprovalWorkflow`

**Request**:

```http
POST /api/approval-workflows
Authorization: Bearer <token>
Content-Type: application/json

{
  "workflow_title": "Marketing Campaign Approval",
  "entity": 1,
  "steps": [
    {
      "step_number": 1,
      "step_name": "Marketing Manager Review",
      "requires_all_approvers": false,
      "approvers": [2, 3]
    },
    {
      "step_number": 2,
      "step_name": "Finance Director Approval",
      "requires_all_approvers": true,
      "approvers": [4]
    },
    {
      "step_number": 3,
      "step_name": "CEO Sign-off",
      "requires_all_approvers": true,
      "approvers": [5]
    }
  ]
}
```

**Response** (`201 Created`):

```json
{
  "message": "Approval workflow created successfully",
  "data": {
    "id": 5,
    "workflow_title": "Marketing Campaign Approval",
    "entity": 1,
    "steps": [...]
  }
}
```

**Validation Errors** (`400 Bad Request`):

```json
{
  "error": "Validation failed",
  "details": {
    "workflow_title": "Workflow title is required",
    "steps": [
      {
        "step_name": "Step name is required"
      }
    ]
  }
}
```

---

### PUT /approval-workflows/:id

Update an existing approval workflow.

**Access**: Admin only
**Route**: `routes/approvalWorkflow.route.ts:72-77`

**Request**:

```http
PUT /api/approval-workflows/5
Authorization: Bearer <token>
Content-Type: application/json

{
  "workflow_title": "Updated Campaign Approval",
  "steps": [...]
}
```

**Response** (`200 OK`):

```json
{
  "message": "Approval workflow updated successfully",
  "data": { ... }
}
```

---

### DELETE /approval-workflows/:id

Delete an approval workflow.

**Access**: Admin only
**Route**: `routes/approvalWorkflow.route.ts:84-89`

**Request**:

```http
DELETE /api/approval-workflows/5
Authorization: Bearer <token>
```

**Response** (`200 OK`):

```json
{
  "message": "Approval workflow deleted successfully"
}
```

**Error** (`409 Conflict`):

```json
{
  "error": "Cannot delete workflow with active approval requests"
}
```

---

## Approval Requests

### GET /approval-requests/pending

Get all pending requests where the current user is an approver.

**Access**: All authenticated users
**Route**: `routes/approvalRequest.route.ts:getPendingApprovals`
**Controller**: `controllers/approvalRequest.ctrl.ts:getPendingApprovals`

**Request**:

```http
GET /api/approval-requests/pending
Authorization: Bearer <token>
```

**Response** (`200 OK`):

```json
{
  "message": "Pending approvals retrieved successfully",
  "data": [
    {
      "id": 14,
      "request_name": "Use Case: Q1 Campaign",
      "workflow_id": 1,
      "entity_id": 123,
      "entity_type": "use_case",
      "status": "PENDING",
      "requested_by": 1,
      "current_step": 2,
      "created_at": "2024-01-09T10:00:00.000Z",
      "updated_at": "2024-01-09T12:00:00.000Z"
    }
  ]
}
```

---

### GET /approval-requests/my-requests

Get all approval requests created by the current user.

**Access**: All authenticated users
**Route**: `routes/approvalRequest.route.ts:getMyApprovalRequests`
**Controller**: `controllers/approvalRequest.ctrl.ts:getMyApprovalRequests`

**Request**:

```http
GET /api/approval-requests/my-requests
Authorization: Bearer <token>
```

**Response** (`200 OK`):

```json
{
  "message": "My approval requests retrieved successfully",
  "data": [
    {
      "id": 14,
      "request_name": "Use Case: Q1 Campaign",
      "status": "PENDING",
      "current_step": 2,
      "created_at": "2024-01-09T10:00:00.000Z"
    }
  ]
}
```

---

### GET /approval-requests/:id

Get detailed information about a specific approval request.

**Access**: All authenticated users
**Route**: `routes/approvalRequest.route.ts:getApprovalRequestById`
**Controller**: `controllers/approvalRequest.ctrl.ts:getApprovalRequestById`

**Request**:

```http
GET /api/approval-requests/14
Authorization: Bearer <token>
```

**Response** (`200 OK`):

```json
{
  "message": "Approval request retrieved successfully",
  "data": {
    "id": 14,
    "request_name": "Use Case: Q1 Campaign",
    "workflow_id": 1,
    "entity_id": 123,
    "entity_type": "use_case",
    "status": "PENDING",
    "requested_by": 1,
    "current_step": 2,
    "created_at": "2024-01-09T10:00:00.000Z",
    "steps": [
      {
        "step_number": 1,
        "step_name": "Marketing Review",
        "status": "COMPLETED",
        "date_completed": "2024-01-09T11:00:00.000Z",
        "approvals": [
          {
            "approver_id": 2,
            "approver_name": "John Doe",
            "approval_result": "APPROVED",
            "comments": "Looks good!",
            "approved_at": "2024-01-09T11:00:00.000Z"
          }
        ]
      },
      {
        "step_number": 2,
        "step_name": "Finance Approval",
        "status": "PENDING",
        "approvals": [
          {
            "approver_id": 4,
            "approver_name": "Jane Smith",
            "approval_result": "PENDING",
            "comments": null,
            "approved_at": null
          }
        ]
      }
    ]
  }
}
```

---

### POST /approval-requests/:id/approve

Approve a request at the current step.

**Access**: Approvers for current step
**Route**: `routes/approvalRequest.route.ts:approveRequest`
**Controller**: `controllers/approvalRequest.ctrl.ts:approveRequest`

**Request**:

```http
POST /api/approval-requests/14/approve
Authorization: Bearer <token>
Content-Type: application/json

{
  "comments": "Approved! Budget looks good."
}
```

**Response** (`200 OK`):

```json
{
  "message": "Request approved successfully"
}
```

**Workflow**:

1. Validate user is an approver for current step
2. Update approval record to APPROVED
3. Check if step is complete
4. If complete and more steps exist:
   - Increment `current_step`
   - Notify next step approvers
5. If complete and no more steps:
   - Mark request as APPROVED
   - Create frameworks
   - Notify requester

**Errors**:

`403 Forbidden` - Not an approver:

```json
{
  "error": "You are not an approver for this step"
}
```

`400 Bad Request` - Already responded:

```json
{
  "error": "You have already responded to this request"
}
```

---

### POST /approval-requests/:id/reject

Reject a request.

**Access**: Approvers for current step
**Route**: `routes/approvalRequest.route.ts:rejectRequest`
**Controller**: `controllers/approvalRequest.ctrl.ts:rejectRequest`

**Request**:

```http
POST /api/approval-requests/14/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "comments": "Budget concerns - needs revision."
}
```

**Response** (`200 OK`):

```json
{
  "message": "Request rejected successfully"
}
```

**Workflow**:

1. Validate user is an approver
2. Update approval record to REJECTED
3. Mark step as REJECTED
4. Mark request as REJECTED
5. Notify requester

---

### POST /approval-requests/:id/withdraw

Withdraw (cancel) a request.

**Access**: Requester only
**Route**: `routes/approvalRequest.route.ts:withdrawRequest`
**Controller**: `controllers/approvalRequest.ctrl.ts:withdrawRequest`

**Request**:

```http
POST /api/approval-requests/14/withdraw
Authorization: Bearer <token>
```

**Response** (`200 OK`):

```json
{
  "message": "Request withdrawn successfully"
}
```

**Errors**:

`403 Forbidden` - Not the requester:

```json
{
  "error": "Only the requester can withdraw this request"
}
```

`400 Bad Request` - Already completed:

```json
{
  "error": "Cannot withdraw a completed request"
}
```

---

## Notifications

### GET /notifications/stream

Establish Server-Sent Events connection for real-time notifications.

**Access**: All authenticated users
**Route**: `routes/notification.route.ts:streamNotifications`
**Controller**: `controllers/notification.ctrl.ts:streamNotifications`

**Request**:

```http
GET /api/notifications/stream
Authorization: Bearer <token>
Accept: text/event-stream
```

**Response** (SSE Stream):

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"connected"}

: heartbeat

data: {"title":"New Approval Request","message":"Use Case: Q1 Campaign - You are an approver for Step 1","type":"approval_request","entityId":14,"entityType":"use_case"}

: heartbeat

data: {"title":"Request Approved","message":"Your request \"Use Case: Q1 Campaign\" has been approved","type":"approval_complete","entityId":14}
```

**Connection Lifecycle**:

1. Client connects with JWT token
2. Server validates token, extracts `userId` and `tenantId`
3. Connection stored in map: `${tenantId}:${userId}`
4. Server sends `{"type":"connected"}`
5. Heartbeat sent every 30 seconds (`: heartbeat\n\n`)
6. Notifications sent as `data: {...}\n\n`
7. On disconnect, connection removed from map

**Error** (`401 Unauthorized`):

```json
{
  "error": "Unauthorized"
}
```

---

## Projects (Use-Cases)

### POST /projects

Create a use-case with optional approval workflow.

**Access**: All authenticated users
**Route**: `routes/project.route.ts:createProject`
**Controller**: `controllers/project.ctrl.ts:createProject`

**Request** (with workflow):

```http
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_title": "Q1 2024 Marketing Campaign",
  "approval_workflow_id": 5,
  "framework": [1, 2],
  "enable_ai_data_insertion": true,
  "owner": 1,
  "start_date": "2024-01-15",
  "ai_risk_classification": "HIGH_RISK",
  "description": "Campaign for Q1 product launch"
}
```

**Response** (`201 Created`):

```json
{
  "message": "Project created successfully",
  "data": {
    "id": 123,
    "project_title": "Q1 2024 Marketing Campaign",
    "approval_workflow_id": 5,
    "pending_frameworks": [1, 2],
    "created_at": "2024-01-09T12:00:00.000Z"
  }
}
```

**Workflow**:

1. Create project record
2. If `approval_workflow_id` provided:
   - Store `framework` in `pending_frameworks`
   - Create approval request
   - Create request steps
   - Create step approvals
   - Notify Step 1 approvers
3. If no workflow:
   - Create frameworks immediately
   - No approval required

**Request** (without workflow):

```json
{
  "project_title": "Internal Tool",
  "framework": [1],
  "enable_ai_data_insertion": false,
  ...
}
```

**Response**: Same, but frameworks created immediately, no `pending_frameworks`.

---

## Authentication Context

All endpoints extract authentication context from JWT:

**Middleware**: `middleware/auth.middleware.ts:authenticateJWT`

**Extracted Values**:

- `req.userId` - Current user's ID
- `req.tenantId` - Organization's tenant ID (schema name)
- `req.userRoleName` - User's role name

**Example Middleware Usage**:

```typescript
export const approveRequest = async (req: Request, res: Response) => {
  const { userId, tenantId } = req; // From JWT
  const { id } = req.params; // Request ID

  // userId and tenantId are guaranteed to exist
  // All queries use tenantId for multi-tenant isolation
};
```

---

## Rate Limiting

Not currently implemented, but recommended:

```typescript
// Example rate limit configuration
{
  "/api/approval-workflows": "100 requests per 15 minutes",
  "/api/approval-requests": "500 requests per 15 minutes",
  "/api/notifications/stream": "10 connections per user"
}
```

---

## Error Response Format

All errors follow consistent format:

**Validation Error** (`400`):

```json
{
  "error": "Validation failed",
  "details": {
    "field_name": "Error message"
  }
}
```

**Authentication Error** (`401`):

```json
{
  "error": "Unauthorized"
}
```

**Authorization Error** (`403`):

```json
{
  "error": "You do not have permission to perform this action"
}
```

**Not Found** (`404`):

```json
{
  "error": "Resource not found"
}
```

**Server Error** (`500`):

```json
{
  "error": "Internal server error",
  "message": "Detailed error message"
}
```

---

## Testing Endpoints

### Using curl

**Create Workflow**:

```bash
curl -X POST http://localhost:3000/api/approval-workflows \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_title": "Test Workflow",
    "entity": 1,
    "steps": [
      {
        "step_number": 1,
        "step_name": "Review",
        "requires_all_approvers": false,
        "approvers": [2]
      }
    ]
  }'
```

**Approve Request**:

```bash
curl -X POST http://localhost:3000/api/approval-requests/14/approve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comments": "Approved!"}'
```

**SSE Connection**:

```bash
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/notifications/stream
```

### Using Postman

1. Set Authorization: Bearer Token
2. Add token to Authorization tab
3. For SSE, use "Send and Download" to keep connection open

---

## Pagination

Not currently implemented for approval workflows/requests.

**Future Enhancement**:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 150,
    "totalPages": 8
  }
}
```
