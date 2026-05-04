# Approval Workflow System Architecture

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Browser)                        │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Use-Case Form  │  │ Approval     │  │ SSE Connection   │    │
│  │ (Create/Edit)  │  │ Modal        │  │ (useNotifications)│   │
│  └────────────────┘  └──────────────┘  └──────────────────┘    │
│         │                    │                    │              │
└─────────┼────────────────────┼────────────────────┼──────────────┘
          │                    │                    │
          │ HTTP POST          │ HTTP POST          │ SSE Stream
          │                    │                    │
┌─────────▼────────────────────▼────────────────────▼──────────────┐
│                      Backend API Server(s)                        │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Project        │  │ Approval     │  │ Notification     │    │
│  │ Controller     │  │ Controller   │  │ Controller       │    │
│  └────────┬───────┘  └──────┬───────┘  └────────┬─────────┘    │
│           │                  │                    │              │
│  ┌────────▼───────┐  ┌──────▼───────┐  ┌────────▼─────────┐   │
│  │ Approval       │  │ Approval     │  │ Notification     │    │
│  │ Request Utils  │  │ Request Utils│  │ Service          │    │
│  └────────┬───────┘  └──────┬───────┘  └────────┬─────────┘    │
│           │                  │                    │              │
│           └──────────────────┴────────────────────┘              │
│                              │                                   │
│                    ┌─────────▼─────────┐                         │
│                    │  Redis Pub/Sub    │                         │
│                    │  (publish)        │                         │
│                    └─────────┬─────────┘                         │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                ┌──────────────▼──────────────┐
                │      Redis Server           │
                │   "approval-notifications"  │
                │         channel             │
                └──────────────┬──────────────┘
                               │
          ┌────────────────────┴────────────────────┐
          │                                         │
┌─────────▼─────────┐                    ┌─────────▼─────────┐
│  Redis Subscriber │                    │  Redis Subscriber │
│   (Server 1)      │                    │   (Server 2)      │
└─────────┬─────────┘                    └─────────┬─────────┘
          │                                         │
┌─────────▼──────────────────────────────┬─────────▼─────────┐
│  SSE Connection Manager                │  SSE Connection   │
│  - connectionKey: tenantId:userId      │  Manager          │
│  - Validates tenant/user match         │                   │
│  - Writes to SSE stream                │                   │
└────────────────────────────────────────┴───────────────────┘
          │                                         │
          ▼                                         ▼
    User A Browser                            User B Browser
```

## Key Architecture Decisions

### 1. SSE (Server-Sent Events) for Real-time Push

**Decision**: Use SSE instead of WebSockets

**Rationale**:

- **Simpler**: One-way server-to-client communication (perfect for notifications)
- **HTTP-based**: Works with existing authentication (JWT in Authorization header)
- **Auto-reconnect**: Browsers automatically reconnect on connection loss
- **Efficient**: Lower overhead than WebSockets for push-only scenarios

**Implementation**:

- Frontend uses `fetch()` with `ReadableStream` to manually parse SSE
- Allows sending custom headers (Authorization: Bearer token)
- Connection kept alive with heartbeat every 30 seconds

### 2. Redis Pub/Sub for Multi-Server Support

**Decision**: Use Redis Pub/Sub to broadcast notifications

**Rationale**:

- **Multi-server deployment**: In production, multiple server instances run behind load balancer
- **Connection affinity**: User's SSE connection might be on Server 1, but approval happens on Server 2
- **Broadcast mechanism**: Redis ensures ALL servers receive the notification
- **Simple integration**: Already using Redis for other features

**Implementation**:

```typescript
// Publisher (any server)
redisClient.publish(
  "approval-notifications",
  JSON.stringify({
    tenantId,
    userId,
    notification,
  }),
);

// Subscriber (all servers)
subscriber.on("message", (channel, message) => {
  const { tenantId, userId, notification } = JSON.parse(message);
  const connection = getConnection(`${tenantId}:${userId}`);
  if (connection) {
    connection.response.write(`data: ${JSON.stringify(notification)}\n\n`);
  }
});
```

### 3. Notifications After Transaction Commits

**Decision**: Send notifications AFTER database transaction commits

**Rationale**:

- **Data visibility**: Queries in notification service run on separate connections
- **Transaction isolation**: Uncommitted data is invisible to other connections
- **Consistency**: Prevents notifying about changes that might be rolled back

**Before (Bug)**:

```typescript
await createApprovalRequest(..., transaction);
notifyStepApprovers(...);  // ❌ Query finds 0 approvers (uncommitted data)
await transaction.commit();
```

**After (Fixed)**:

```typescript
await createApprovalRequest(..., transaction);
const notificationInfo = { requestId, stepNumber, ... };
await transaction.commit();  // ✅ Commit first
notifyStepApprovers(notificationInfo);  // ✅ Now approvers are visible
```

### 4. Deferred Framework Creation

**Decision**: Store framework IDs in `pending_frameworks`, create after approval

**Rationale**:

- **Prevent orphaned data**: If approval rejected, no framework records exist
- **Atomic operation**: Framework creation and approval in same transaction
- **Clean rollback**: If framework creation fails, approval isn't marked complete
- **Audit trail**: `pending_frameworks` shows what was requested

**Flow**:

```typescript
// At creation
if (approval_workflow_id) {
  // Store frameworks, don't create
  UPDATE projects SET pending_frameworks = [1, 2];
}

// After final approval
if (status === APPROVED && pending_frameworks) {
  for (const frameworkId of pending_frameworks) {
    await createFramework(frameworkId, transaction);
  }
  UPDATE projects SET pending_frameworks = NULL;
}
```

### 5. Step Progression Logic

**Decision**: Use `current_step` column with requires_all_approvers flag

**Rationale**:

- **Simple state tracking**: Single column tracks progress
- **Flexible requirements**: Steps can require all approvers OR just one
- **Sequential processing**: Clear order (Step 1 → Step 2 → Step 3)
- **Easy queries**: `WHERE step_number = current_step` gets active step

**Logic**:

```typescript
const shouldComplete = requires_all_approvers
  ? pendingCount === 0     // All must respond
  : approvedCount > 0;     // At least one approved

if (shouldComplete) {
  if (currentStep < totalSteps) {
    UPDATE current_step = currentStep + 1;  // Next step
    notifyStepApprovers(currentStep + 1);
  } else {
    UPDATE status = 'APPROVED';  // Complete
    createFrameworks();
  }
}
```

## Data Flow

### Create Use-Case with Workflow

```
1. User submits form
   ↓
2. Project Controller
   - Start transaction
   - Create project record
   - Check if approval_workflow_id exists
   ↓
3a. NO WORKFLOW:                  3b. HAS WORKFLOW:
   - Create frameworks now          - Store in pending_frameworks
   - Commit                         - Create approval request
   - Done                           - Create request steps
                                    - Create step approvals
                                    - Commit
                                    - Notify Step 1 approvers
                                    ↓
                                 4. Notification Service
                                    - Query Step 1 approvers
                                    - Publish to Redis
                                    ↓
                                 5. Redis Subscriber
                                    - Find SSE connection
                                    - Send via SSE stream
                                    ↓
                                 6. Frontend
                                    - Receive notification
                                    - Show alert
                                    - Refresh count
```

### Approve Request Step

```
1. User clicks Approve
   ↓
2. Approval Controller
   - Start transaction
   - processApprovalQuery()
   ↓
3. Process Approval Utils
   - Get current step
   - Update approver's response
   - Check if step complete
   ↓
4a. STEP INCOMPLETE:              4b. STEP COMPLETE:
   - Keep waiting                  - Mark step COMPLETED
   - Commit                        - Check if more steps
   - Return null                   ↓
                                5a. MORE STEPS:              5b. FINAL STEP:
                                   - current_step++            - status = APPROVED
                                   - Commit                    - Create frameworks
                                   - Return step_approvers     - Clear pending
                                                              - Commit
                                                              - Return requester_approved
                                   ↓
6. Send Notification
   - Notify next step approvers OR notify requester
   - Follow same flow as creation
```

## Security Architecture

### Multi-Tenancy Isolation

**Database Level**:

- All queries use tenant-specific schemas: `"${tenantId}".table_name`
- No cross-tenant queries possible

**Connection Level**:

- SSE connections keyed by `${tenantId}:${userId}`
- Tenant validation before sending notifications

**API Level**:

- JWT middleware extracts and validates `tenantId`
- All controllers require authenticated tenant context

### Notification Security

**Double Validation**:

```typescript
// When storing connection
connections.set(`${tenantId}:${userId}`, {
  response: res,
  tenantId: tenantId, // Store for verification
  userId: userId,
});

// Before sending notification
const connection = getConnection(`${tenantId}:${userId}`);
if (connection.tenantId !== tenantId) {
  console.error("Security: Tenant mismatch!");
  return;
}
if (connection.userId !== userId) {
  console.error("Security: User mismatch!");
  return;
}
```

## Performance Considerations

### Database Queries

- **Indexed columns**: `approval_requests.current_step`, `approval_request_steps.step_number`
- **Transaction batching**: All related updates in single transaction
- **Selective loading**: Only load approvers for current step

### SSE Connections

- **Connection pooling**: Reuse Redis connections
- **Heartbeat**: Keep connections alive (30s interval)
- **Cleanup**: Automatic stale connection removal (1 hour)
- **Memory**: Map-based storage for O(1) lookups

### Redis Pub/Sub

- **Single channel**: All notifications on `approval-notifications`
- **Filtering**: Each subscriber filters by tenant/user
- **Async**: Fire-and-forget, doesn't block main flow

## Scalability

The system is designed to scale horizontally:

1. **Stateless API servers**: Can add more instances behind load balancer
2. **Redis Pub/Sub**: Broadcasts to all instances
3. **Database**: PostgreSQL handles multi-tenant schemas efficiently
4. **SSE connections**: Distributed across server instances

## Error Handling

### Transaction Rollback

All database operations in transactions:

```typescript
try {
  const transaction = await sequelize.transaction();
  await createApprovalRequest(..., transaction);
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### Notification Failures

Notifications are fire-and-forget with error logging:

```typescript
notifyStepApprovers(...).catch(error => {
  console.error("Error sending notification:", error);
  // Request still succeeds even if notification fails
});
```

### SSE Reconnection

Frontend automatically reconnects on connection loss:

```typescript
if (autoReconnect && !isManuallyDisconnectedRef.current) {
  setTimeout(() => connect(), reconnectDelay);
}
```

## Future Enhancements

Potential improvements:

1. **Notification History**: Store sent notifications in database
2. **Email Fallback**: Send email if user not online
3. **Batch Notifications**: Group multiple notifications
4. **Notification Preferences**: User-configurable notification settings
5. **Workflow Templates**: Pre-built workflow templates
6. **Parallel Steps**: Support parallel approval steps
7. **Conditional Steps**: Skip steps based on conditions
8. **Delegation**: Allow approvers to delegate to others
