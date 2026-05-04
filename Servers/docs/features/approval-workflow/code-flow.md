# Code Flow Documentation

## Complete Execution Flows

This document provides step-by-step code execution flows for key operations.

---

## Flow 1: Create Use-Case with Approval Workflow

### Entry Point

**User Action**: Clicks "Create Use-Case" with workflow selected
**Frontend**: `POST /api/projects`
**Backend**: `controllers/project.ctrl.ts:createProject`

### Step-by-Step Execution

```
1. controllers/project.ctrl.ts:createProject (Line 159)
   │
   ├─→ Extract request data
   │   const { approval_workflow_id, framework, ... } = req.body
   │
   ├─→ Start database transaction
   │   const transaction = await sequelize.transaction()
   │
   ├─→ Create project record
   │   utils/project.utils.ts:createProjectQuery()
   │   │
   │   └─→ INSERT INTO projects (..., approval_workflow_id, pending_frameworks, ...)
   │       VALUES (..., 5, [1, 2], ...)
   │       RETURNING *
   │
   ├─→ Check if approval workflow assigned
   │   if (newProject.approval_workflow_id) {
   │
   │   ├─→ Store frameworks in pending_frameworks (Line 263)
   │   │   console.log("Approval workflow detected - deferring framework creation")
   │   │   // Frameworks NOT created yet
   │   │
   │   ├─→ Fetch workflow with steps (Line 301)
   │   │   utils/approvalWorkflow.utils.ts:getApprovalWorkflowByIdQuery()
   │   │   │
   │   │   └─→ SELECT * FROM approval_workflows WHERE id = 5
   │   │       SELECT * FROM approval_workflow_steps WHERE workflow_id = 5
   │   │       SELECT * FROM approval_step_approvers WHERE workflow_step_id IN (...)
   │   │
   │   ├─→ Create approval request (Line 333)
   │   │   utils/approvalRequest.utils.ts:createApprovalRequestQuery()
   │   │   │
   │   │   ├─→ INSERT INTO approval_requests
   │   │   │   (request_name, workflow_id, entity_id, entity_type, status,
   │   │   │    requested_by, current_step)
   │   │   │   VALUES ('Use Case: Q1 Campaign', 5, 123, 'use_case', 'PENDING', 1, 1)
   │   │   │   RETURNING *
   │   │   │
   │   │   ├─→ For each workflow step:
   │   │   │   │
   │   │   │   ├─→ INSERT INTO approval_request_steps
   │   │   │   │   (request_id, step_number, step_name, status)
   │   │   │   │   VALUES (14, 1, 'Marketing Review', 'PENDING')
   │   │   │   │   RETURNING *
   │   │   │   │
   │   │   │   └─→ For each approver in step:
   │   │   │       │
   │   │   │       └─→ INSERT INTO approval_request_step_approvals
   │   │   │           (request_step_id, approver_id, approval_result)
   │   │   │           VALUES (1, 2, 'PENDING')
   │   │   │
   │   │   └─→ RETURN approval request
   │   │
   │   └─→ Store notification info for later (Line 342-343)
   │       (createdProject)._approvalRequestId = 14
   │       (createdProject)._approvalRequestName = "Use Case: Q1 Campaign"
   │
   ├─→ Commit transaction (Line 365)
   │   await transaction.commit()
   │   // ← ALL database changes now visible
   │
   ├─→ Send notification AFTER commit (Line 374-384)
   │   if ((createdProject)._approvalRequestId) {
   │   │
   │   └─→ services/notification.service.ts:notifyStepApprovers()
   │       │
   │       ├─→ Get approvers for Step 1 (getApproversForStep)
   │       │   │
   │       │   └─→ SELECT DISTINCT asa.approver_id
   │       │       FROM approval_step_approvers asa
   │       │       JOIN approval_workflow_steps aws ON asa.workflow_step_id = aws.id
   │       │       JOIN approval_requests ar ON aws.workflow_id = ar.workflow_id
   │       │       WHERE ar.id = 14 AND aws.step_number = 1
   │       │       // Result: [2]
   │       │
   │       └─→ For each approver (User 2):
   │           │
   │           └─→ sendNotification(tenantId, 2, notification)
   │               │
   │               └─→ redisClient.publish("approval-notifications", JSON.stringify({
   │                     tenantId: "a4ayc80OGd",
   │                     userId: 2,
   │                     notification: {
   │                       title: "New Approval Request",
   │                       message: "Use Case: Q1 Campaign - Step 1",
   │                       type: "approval_request",
   │                       entityId: 14
   │                     }
   │                   }))
   │
   └─→ Return response to frontend
       res.status(201).json({ message: "Project created", data: createdProject })
```

### Redis Flow (Parallel)

```
Redis Server receives publish
│
└─→ Broadcast to ALL subscribers
    │
    ├─→ Server 1: notificationSubscriber.service.ts
    │   │
    │   ├─→ subscriber.on("message", ...)
    │   │   Receive: { tenantId, userId: 2, notification }
    │   │
    │   ├─→ Find connection: connections.get("a4ayc80OGd:2")
    │   │   Result: User 2 IS connected to Server 1 ✓
    │   │
    │   ├─→ Validate tenant and user match
    │   │   if (connectionData.tenantId !== tenantId) return
    │   │   if (connectionData.userId !== userId) return
    │   │
    │   └─→ Send via SSE
    │       connectionData.response.write(`data: ${JSON.stringify(notification)}\n\n`)
    │
    └─→ Server 2: notificationSubscriber.service.ts
        │
        ├─→ subscriber.on("message", ...)
        │   Receive: { tenantId, userId: 2, notification }
        │
        └─→ Find connection: connections.get("a4ayc80OGd:2")
            Result: User 2 NOT connected to Server 2 ✗
            Log: "⚠️ No active connection for a4ayc80OGd:2"
```

### Frontend Flow

```
Browser (User 2) receives SSE message
│
└─→ hooks/useNotifications.ts:connect()
    │
    ├─→ ReadableStream reader.read()
    │   Receives: "data: {...}\n\n"
    │
    ├─→ Parse SSE format
    │   buffer.split('\n\n')
    │   line.startsWith('data: ') → extract JSON
    │
    ├─→ Parse notification
    │   JSON.parse(data)
    │   → { title: "New Approval Request", ... }
    │
    └─→ displayNotification(notification)
        │
        ├─→ Call onNotification callback
        │   DashboardActionButtons.fetchApprovalCounts()
        │   │
        │   └─→ API calls to update badge count
        │
        └─→ showAlert({ variant: "info", title: "...", body: "..." })
            │
            └─→ User sees blue notification alert
```

---

## Flow 2: Approve Request (Step 1 → Step 2)

### Entry Point

**User Action**: Clicks "Approve" button
**Frontend**: `POST /api/approval-requests/14/approve`
**Backend**: `controllers/approvalRequest.ctrl.ts:approveRequest`

### Step-by-Step Execution

```
1. controllers/approvalRequest.ctrl.ts:approveRequest (Line 286)
   │
   ├─→ Extract data
   │   const { userId } = req  // 2 (Marketing Manager)
   │   const { id } = req.params  // 14
   │   const { comments } = req.body  // "Looks good!"
   │
   ├─→ Start transaction
   │   const transaction = await sequelize.transaction()
   │
   ├─→ Process approval (Line 317)
   │   utils/approvalRequest.utils.ts:processApprovalQuery()
   │   │
   │   ├─→ Get current request (Line 269)
   │   │   SELECT * FROM approval_requests WHERE id = 14
   │   │   Result: { id: 14, current_step: 1, status: "PENDING", ... }
   │   │
   │   ├─→ Get current step (Line 286)
   │   │   SELECT * FROM approval_request_steps
   │   │   WHERE request_id = 14 AND step_number = 1
   │   │   Result: { id: 1, step_number: 1, status: "PENDING", ... }
   │   │
   │   ├─→ Update approval record (Line 302)
   │   │   UPDATE approval_request_step_approvals
   │   │   SET approval_result = 'APPROVED',
   │   │       comments = 'Looks good!',
   │   │       approved_at = NOW()
   │   │   WHERE request_step_id = 1 AND approver_id = 2
   │   │
   │   ├─→ Check if step requires all approvers (Line 321)
   │   │   SELECT aws.requires_all_approvers
   │   │   FROM approval_workflow_steps aws
   │   │   WHERE aws.step_number = 1 AND aws.workflow_id = 5
   │   │   Result: { requires_all_approvers: false }  ← Only need ONE approver
   │   │
   │   ├─→ Get all approvals for this step (Line 343)
   │   │   SELECT approver_id, approval_result
   │   │   FROM approval_request_step_approvals
   │   │   WHERE request_step_id = 1
   │   │   Result: [
   │   │     { approver_id: 2, approval_result: 'APPROVED' },
   │   │     { approver_id: 3, approval_result: 'PENDING' }
   │   │   ]
   │   │
   │   ├─→ Count approvals (Line 357-358)
   │   │   pendingCount = 1  // User 3 still pending
   │   │   approvedCount = 1  // User 2 approved
   │   │
   │   ├─→ Determine if step should complete (Line 364-366)
   │   │   requiresAllApprovers = false
   │   │   shouldComplete = hasApproved = true  ← ONE approval is enough!
   │   │
   │   ├─→ Step is COMPLETE! (Line 407-419)
   │   │   UPDATE approval_request_steps
   │   │   SET status = 'COMPLETED', date_completed = NOW()
   │   │   WHERE id = 1
   │   │
   │   ├─→ Count total steps (Line 422)
   │   │   SELECT COUNT(*) FROM approval_request_steps
   │   │   WHERE request_id = 14
   │   │   Result: 3  // [Step 1, Step 2, Step 3]
   │   │
   │   ├─→ Check if more steps (Line 432)
   │   │   if (currentStep < stepCount)  // 1 < 3 = true
   │   │   │
   │   │   ├─→ Move to next step (Line 434)
   │   │   │   UPDATE approval_requests
   │   │   │   SET current_step = 2, updated_at = NOW()
   │   │   │   WHERE id = 14
   │   │   │
   │   │   └─→ Return notification info (Line 459)
   │   │       return {
   │   │         type: 'step_approvers',
   │   │         tenantId: "a4ayc80OGd",
   │   │         requestId: 14,
   │   │         stepNumber: 2,  ← Next step!
   │   │         requestName: "Use Case: Q1 Campaign"
   │   │       }
   │   │
   │   └─→ processApprovalQuery RETURNS notification info
   │
   ├─→ Commit transaction (Line 326)
   │   await transaction.commit()
   │   // ← current_step now = 2, Step 1 marked COMPLETED
   │
   ├─→ Send notification AFTER commit (Line 335-356)
   │   if (notificationInfo && notificationInfo.type === 'step_approvers') {
   │   │
   │   └─→ notifyStepApprovers(tenantId, 14, 2, "Use Case: Q1 Campaign")
   │       │
   │       ├─→ Get Step 2 approvers
   │       │   Query: ... WHERE ar.id = 14 AND aws.step_number = 2
   │       │   Result: [4]  ← User 4 (Finance Director)
   │       │
   │       └─→ sendNotification(tenantId, 4, notification)
   │           Publish to Redis for User 4
   │
   └─→ Return response
       res.status(200).json({ message: "Request approved successfully" })
```

### Notification Flow

```
User 4 (Finance Director) receives notification
│
└─→ Same SSE flow as Flow 1
    Alert: "New Approval Request - Use Case: Q1 Campaign - Step 2"
    Badge count updates
```

---

## Flow 3: Final Approval (Step 3 → Complete)

### Entry Point

**User Action**: CEO (User 5) clicks "Approve" on Step 3
**Frontend**: `POST /api/approval-requests/14/approve`

### Key Differences from Flow 2

```
processApprovalQuery() execution:
│
├─→ ... (same steps as Flow 2 until step completion check)
│
├─→ Count total steps: 3
│   current_step: 3
│   if (currentStep < stepCount)  // 3 < 3 = false
│   │
│   └─→ NO MORE STEPS! (Line 456-593)
│       │
│       ├─→ Mark request as APPROVED (Line 458)
│       │   UPDATE approval_requests
│       │   SET status = 'APPROVED', updated_at = NOW()
│       │   WHERE id = 14
│       │
│       ├─→ ===== FRAMEWORK CREATION AFTER APPROVAL ===== (Line 490)
│       │   │
│       │   ├─→ Get project with pending frameworks (Line 491)
│       │   │   SELECT id, pending_frameworks, enable_ai_data_insertion
│       │   │   FROM projects WHERE id = 123
│       │   │   Result: {
│       │   │     id: 123,
│       │   │     pending_frameworks: [1, 2],
│       │   │     enable_ai_data_insertion: true
│       │   │   }
│       │   │
│       │   ├─→ Create frameworks (Line 545-570)
│       │   │   │
│       │   │   ├─→ For frameworkId = 1 (EU AI Act):
│       │   │   │   createEUFrameworkQuery(123, true, tenantId, transaction)
│       │   │   │   INSERT INTO eu_ai_act_assessment (project_id, ...)
│       │   │   │   INSERT INTO eu_ai_act_requirements (...)
│       │   │   │   ... (many framework-specific inserts)
│       │   │   │
│       │   │   └─→ For frameworkId = 2 (ISO 42001):
│       │   │       createISOFrameworkQuery(123, true, tenantId, transaction)
│       │   │       INSERT INTO iso42001_assessment (...)
│       │   │       ... (many framework-specific inserts)
│       │   │
│       │   └─→ Clear pending frameworks (Line 576)
│       │       UPDATE projects
│       │       SET pending_frameworks = NULL,
│       │           enable_ai_data_insertion = FALSE
│       │       WHERE id = 123
│       │
│       └─→ Return notification info (Line 593)
│           return {
│             type: 'requester_approved',
│             tenantId: "a4ayc80OGd",
│             requestId: 14,
│             requesterId: 1,  ← Alice (original requester)
│             requestName: "Use Case: Q1 Campaign"
│           }
│
└─→ Commit transaction
    // ← Frameworks now exist, request marked APPROVED
```

### Notification to Requester

```
controllers/approvalRequest.ctrl.ts:approveRequest
│
└─→ if (notificationInfo.type === 'requester_approved') {
    │
    └─→ notifyRequesterApproved(tenantId, 1, 14, "Use Case: Q1 Campaign")
        │
        └─→ sendNotification(tenantId, 1, {
              title: "Request Approved",
              message: "Your request has been approved",
              type: "approval_complete",
              entityId: 14
            })
            │
            └─→ Publish to Redis for User 1 (Alice)
```

### Frontend Flow for Requester

```
Alice (User 1) receives notification
│
├─→ SSE delivers: { type: "approval_complete", ... }
│
├─→ displayNotification()
│   showAlert({ variant: "success", title: "Request Approved", ... })
│
└─→ Alice sees green success alert
    "Your request has been approved"
```

---

## Flow 4: SSE Connection Establishment

### Entry Point

**User Action**: User logs in / page loads
**Frontend**: `App.tsx` → `useNotifications()` hook auto-connects

### Step-by-Step Execution

```
1. Frontend: hooks/useNotifications.ts:useEffect() (Line 277)
   │
   ├─→ connect() called on mount
   │   │
   │   ├─→ Check if enabled and has auth token (Line 122)
   │   │   if (!enabled || !authToken) return
   │   │
   │   ├─→ Create AbortController (Line 141)
   │   │   abortController = new AbortController()
   │   │
   │   ├─→ Fetch SSE endpoint (Line 148)
   │   │   fetch(`${ENV_VARs.URL}/api/notifications/stream`, {
   │   │     method: 'GET',
   │   │     headers: {
   │   │       'Authorization': `Bearer ${authToken}`,
   │   │       'Accept': 'text/event-stream'
   │   │     },
   │   │     signal: abortController.signal
   │   │   })
   │   │
   │   └─→ HTTP Request sent to backend →
   │
2. Backend: controllers/notification.ctrl.ts:streamNotifications (Line 19)
   │
   ├─→ Middleware: authenticateJWT
   │   Extract userId and tenantId from JWT
   │   Attach to req: { userId: 2, tenantId: "a4ayc80OGd" }
   │
   ├─→ Validate authentication (Line 27)
   │   if (!userId || !tenantId) return 401
   │
   ├─→ Setup SSE headers (Line 42)
   │   res.setHeader("Content-Type", "text/event-stream")
   │   res.setHeader("Cache-Control", "no-cache")
   │   res.setHeader("Connection", "keep-alive")
   │
   ├─→ Store connection (Line 48)
   │   connectionKey = "a4ayc80OGd:2"
   │   connections.set(connectionKey, {
   │     response: res,
   │     tenantId: "a4ayc80OGd",
   │     userId: 2,
   │     connectedAt: new Date()
   │   })
   │
   ├─→ Send connected message (Line 58)
   │   res.write(`data: {"type":"connected"}\n\n`)
   │   → Sent to browser
   │
   ├─→ Start heartbeat interval (Line 61)
   │   setInterval(() => {
   │     res.write(`: heartbeat\n\n`)
   │   }, 30000)
   │
   └─→ Setup cleanup listener (Line 70)
       req.on("close", () => {
         clearInterval(heartbeatInterval)
         connections.delete(connectionKey)
       })
       ← Connection remains open
   │
3. Frontend: Response received (Line 157)
   │
   ├─→ Check response.ok (Line 157)
   │   if (!response.ok) throw error
   │
   ├─→ Get ReadableStream reader (Line 169)
   │   const reader = response.body.getReader()
   │   const decoder = new TextDecoder()
   │
   ├─→ Start reading loop (Line 174)
   │   while (true) {
   │     const { done, value } = await reader.read()
   │     │
   │     ├─→ First read receives: "data: {"type":"connected"}\n\n"
   │     │   │
   │     │   ├─→ Parse SSE format (Line 186-203)
   │     │   │   messages = buffer.split('\n\n')
   │     │   │   line.startsWith('data: ') → extract '{"type":"connected"}'
   │     │   │
   │     │   ├─→ Parse JSON (Line 207)
   │     │   │   notification = { type: "connected" }
   │     │   │
   │     │   └─→ displayNotification (Line 85)
   │     │       if (type === "connected") {
   │     │         console.log("📡 SSE connection established")
   │     │         return  // Don't show alert
   │     │       }
   │     │
   │     ├─→ After 30 seconds, receives: ": heartbeat\n\n"
   │     │   │
   │     │   └─→ Ignored (line.startsWith(':') → continue)
   │     │
   │     └─→ Loop continues, waiting for next message...
   │   }
   │
   └─→ Connection established and ready!
```

---

## Flow 5: Request Rejection

### Entry Point

**User Action**: Approver clicks "Reject" button
**Frontend**: `POST /api/approval-requests/14/reject`

### Key Differences from Approval Flow

```
processApprovalQuery(requestId, userId, ApprovalResult.REJECTED, ...)
│
├─→ ... (same initial steps)
│
├─→ Update approval record
│   SET approval_result = 'REJECTED'
│
├─→ If rejected (Line 369)
│   if (approvalResult === ApprovalResult.REJECTED) {
│   │
│   ├─→ Mark step as REJECTED (Line 370)
│   │   UPDATE approval_request_steps
│   │   SET status = 'REJECTED', date_completed = NOW()
│   │   WHERE id = :requestStepId
│   │
│   ├─→ Mark request as REJECTED (Line 383)
│   │   UPDATE approval_requests
│   │   SET status = 'REJECTED', updated_at = NOW()
│   │   WHERE id = :requestId
│   │
│   └─→ Return notification info (Line 409)
│       return {
│         type: 'requester_rejected',
│         tenantId: "a4ayc80OGd",
│         requestId: 14,
│         requesterId: 1,  ← Original requester
│         requestName: "Use Case: Q1 Campaign"
│       }
│   }
│
└─→ After commit, notify requester
    notifyRequesterRejected(tenantId, 1, 14, "Use Case: Q1 Campaign")
    │
    └─→ sendNotification(tenantId, 1, {
          title: "Request Rejected",
          message: "Your request has been rejected",
          type: "approval_rejected",
          entityId: 14
        })
```

**Result**:

- No more step progression
- Frameworks NOT created
- `pending_frameworks` remains in project table
- Requester notified with error alert (red)

---

## Summary Table

| Operation           | Entry Point      | Transaction Commits | Notifications Sent   | Frameworks Created |
| ------------------- | ---------------- | ------------------- | -------------------- | ------------------ |
| Create Use-Case     | `POST /projects` | ✅ Before notify    | Step 1 approvers     | ❌ Deferred        |
| Approve (Next Step) | `POST /approve`  | ✅ Before notify    | Next step approvers  | ❌ Not yet         |
| Approve (Final)     | `POST /approve`  | ✅ Before notify    | Requester            | ✅ Yes!            |
| Reject              | `POST /reject`   | ✅ Before notify    | Requester            | ❌ Never           |
| SSE Connect         | `GET /stream`    | N/A                 | Connection confirmed | N/A                |

**Key Principle**: All notifications sent AFTER `transaction.commit()` to ensure data visibility.
