# Troubleshooting Guide

## Common Issues and Solutions

---

## Notifications Not Being Received

### Symptom

Approvers don't receive real-time notifications when:

- Use-case created with workflow
- Request approved/rejected
- Request moves to next step

### Diagnostic Steps

**1. Check SSE Connection**

Browser Console:

```javascript
// Should see connection established
"SSE Connected";

// Should see heartbeat every 30 seconds
"SSE Heartbeat received";
```

**2. Check Server Logs**

Look for:

```
SSE connection established for user: 123, tenant: a4ayc80OGd
Redis subscriber connected
```

**3. Test SSE Endpoint Directly**

Using curl:

```bash
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/notifications/stream
```

Should see:

```
data: {"type":"connected"}

: heartbeat

: heartbeat
```

### Common Causes

#### Cause 1: Notifications Sent Before Transaction Commit

**Symptoms**:

- Server logs show "No active connection" or "0 approvers found"
- Notification code runs but nothing sent

**Fix**:
Ensure notifications sent AFTER transaction commits:

```typescript
// ❌ WRONG
await createApprovalRequest(..., transaction);
notifyStepApprovers(...);  // Sent before commit
await transaction.commit();

// ✅ CORRECT
await createApprovalRequest(..., transaction);
const notificationInfo = { requestId, stepNumber, ... };
await transaction.commit();  // Commit first
notifyStepApprovers(notificationInfo);  // Now data is visible
```

**Files to Check**:

- `controllers/approvalRequest.ctrl.ts` - approve/reject endpoints
- `controllers/project.ctrl.ts` - create project endpoint

#### Cause 2: Redis Not Running

**Symptoms**:

- Server logs show "Error: connect ECONNREFUSED 127.0.0.1:6379"
- Notifications not delivered

**Fix**:
Start Redis server:

```bash
# macOS with Homebrew
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis
```

Verify Redis is running:

```bash
redis-cli ping
# Should return: PONG
```

#### Cause 3: SSE Connection Dropped

**Symptoms**:

- Connection established initially
- No heartbeats after some time
- Notifications stop working

**Fix**:
The frontend should auto-reconnect. Check `useNotifications.ts`:

```typescript
useEffect(() => {
  if (autoReconnect && !isManuallyDisconnectedRef.current) {
    setTimeout(() => connect(), reconnectDelay);
  }
}, [connected]);
```

**Manual Reconnect**:

```javascript
// In browser console
window.location.reload();
```

#### Cause 4: Connection Key Mismatch

**Symptoms**:

- Server logs show "No active connection for tenantId:userId"
- User has valid JWT and SSE connected

**Debug**:
Add logging to `notification.ctrl.ts`:

```typescript
console.log("Active connections:", Array.from(connections.keys()));
console.log("Looking for:", `${tenantId}:${userId}`);
```

**Fix**:
Ensure connection key format matches:

- Storage: `connections.set(\`${tenantId}:${userId}\`, ...)`
- Lookup: `connections.get(\`${tenantId}:${userId}\`)`

---

## Approvals Not Progressing

### Symptom

After approving, the request doesn't move to next step or complete.

### Diagnostic Steps

**1. Check Request Status**

Query database:

```sql
SELECT
  ar.id,
  ar.request_name,
  ar.status,
  ar.current_step,
  (SELECT COUNT(*) FROM approval_request_steps WHERE request_id = ar.id) as total_steps
FROM approval_requests ar
WHERE ar.id = 14;
```

**2. Check Step Approvals**

```sql
SELECT
  arsa.approver_id,
  arsa.approval_result,
  arsa.approved_at,
  u.name as approver_name
FROM approval_request_step_approvals arsa
JOIN approval_request_steps ars ON arsa.request_step_id = ars.id
JOIN users u ON arsa.approver_id = u.id
WHERE ars.request_id = 14
  AND ars.step_number = 2  -- Current step
ORDER BY arsa.id;
```

**3. Check Step Configuration**

```sql
SELECT
  aws.step_number,
  aws.step_name,
  aws.requires_all_approvers,
  COUNT(asa.approver_id) as approver_count
FROM approval_workflow_steps aws
LEFT JOIN approval_step_approvers asa ON aws.id = asa.workflow_step_id
WHERE aws.workflow_id = 1
GROUP BY aws.id, aws.step_number, aws.step_name, aws.requires_all_approvers
ORDER BY aws.step_number;
```

### Common Causes

#### Cause 1: Waiting for More Approvers

**Symptoms**:

- Step has `requires_all_approvers = true`
- Only 1 of 3 approvers has approved

**Check**:

```sql
SELECT
  aws.requires_all_approvers,
  COUNT(*) FILTER (WHERE arsa.approval_result = 'APPROVED') as approved_count,
  COUNT(*) FILTER (WHERE arsa.approval_result = 'PENDING') as pending_count,
  COUNT(*) as total_approvers
FROM approval_request_steps ars
JOIN approval_workflow_steps aws ON aws.workflow_id = (
  SELECT workflow_id FROM approval_requests WHERE id = 14
) AND aws.step_number = ars.step_number
JOIN approval_request_step_approvals arsa ON ars.id = arsa.request_step_id
WHERE ars.request_id = 14 AND ars.step_number = 2
GROUP BY aws.requires_all_approvers;
```

**Fix**:
Wait for remaining approvers, or update workflow configuration:

```sql
UPDATE approval_workflow_steps
SET requires_all_approvers = false
WHERE id = 2;
```

#### Cause 2: Step Progression Logic Bug

**Symptoms**:

- All required approvals received
- Request still stuck at current step

**Debug**:
Check `utils/approvalRequest.utils.ts:processApprovalQuery` around lines 432-465:

```typescript
const shouldComplete = requires_all_approvers ? pendingCount === 0 : approvedCount > 0;

console.log("Step completion check:", {
  requires_all_approvers,
  pendingCount,
  approvedCount,
  shouldComplete,
});
```

**Fix**:
Ensure step completion logic is correct.

#### Cause 3: Transaction Rollback

**Symptoms**:

- Approval appears to succeed
- Database unchanged

**Check Server Logs**:

```
Error in approveRequest: ...
Transaction rolled back
```

**Fix**:
Address the underlying error (foreign key violation, validation error, etc.).

---

## Frameworks Not Being Created

### Symptom

After final approval, frameworks are not created for the use-case.

### Diagnostic Steps

**1. Check Pending Frameworks**

```sql
SELECT
  id,
  project_title,
  approval_workflow_id,
  pending_frameworks,
  enable_ai_data_insertion
FROM projects
WHERE id = 123;
```

Should show:

```
pending_frameworks: [1, 2]
```

After approval, should be:

```
pending_frameworks: null
```

**2. Check Approval Status**

```sql
SELECT status, current_step
FROM approval_requests
WHERE entity_id = 123 AND entity_type = 'use_case';
```

Should show:

```
status: APPROVED
```

**3. Check Framework Records**

```sql
SELECT * FROM project_frameworks
WHERE project_id = 123;
```

Should have records for framework IDs 1 and 2.

### Common Causes

#### Cause 1: Approval Not Actually Complete

**Symptoms**:

- `status` still shows `PENDING`
- `current_step` not at final step

**Fix**:
Ensure all steps approved. Check current step:

```sql
SELECT
  ar.current_step,
  COUNT(DISTINCT ars.step_number) as total_steps
FROM approval_requests ar
JOIN approval_request_steps ars ON ar.id = ars.request_id
WHERE ar.id = 14
GROUP BY ar.current_step;
```

#### Cause 2: Framework Creation Failed

**Symptoms**:

- `status = APPROVED`
- `pending_frameworks` still has values
- Server logs show error

**Check Server Logs**:

```
Error creating frameworks: ...
```

**Common Errors**:

- Framework ID doesn't exist
- Foreign key violation
- Permission error

**Fix**:
Manually create frameworks or fix underlying error.

#### Cause 3: Transaction Commit Failed

**Symptoms**:

- Approval appears successful
- Notification sent
- Database not updated

**Fix**:
Wrap framework creation in same transaction as approval:

```typescript
const transaction = await sequelize.transaction();
try {
  // Mark request as approved
  await updateRequestStatus(..., transaction);

  // Create frameworks
  for (const frameworkId of pendingFrameworks) {
    await createFramework(..., transaction);
  }

  // Clear pending
  await clearPendingFrameworks(..., transaction);

  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

---

## Permission Errors

### Symptom

User gets "403 Forbidden" or "You do not have permission" errors.

### Common Causes

#### Cause 1: Non-Admin Trying to Manage Workflows

**Error**:

```json
{
  "error": "You do not have permission to perform this action"
}
```

**Fix**:
Only Admins can create/update/delete workflows. To view workflows (for use-case creation), ensure GET endpoints don't require Admin role:

```typescript
// ✅ Correct
router.get(
  "/approval-workflows",
  authenticateJWT, // No authorize
  getApprovalWorkflows,
);

// ❌ Wrong
router.get(
  "/approval-workflows",
  authenticateJWT,
  authorize(["Admin"]), // Blocks non-admins
  getApprovalWorkflows,
);
```

#### Cause 2: Non-Approver Trying to Approve

**Error**:

```json
{
  "error": "You are not an approver for this step"
}
```

**Fix**:
Verify user is assigned as approver:

```sql
-- Check if user 5 is an approver for step 2 of request 14
SELECT
  arsa.approver_id,
  u.name
FROM approval_request_step_approvals arsa
JOIN approval_request_steps ars ON arsa.request_step_id = ars.id
JOIN users u ON arsa.approver_id = u.id
WHERE ars.request_id = 14
  AND ars.step_number = 2;
```

If user not in list, they can't approve. Add them to workflow step approvers.

#### Cause 3: Non-Requester Trying to Withdraw

**Error**:

```json
{
  "error": "Only the requester can withdraw this request"
}
```

**Fix**:
Only the user who created the request can withdraw it. Check:

```sql
SELECT requested_by FROM approval_requests WHERE id = 14;
```

---

## Count Not Updating

### Symptom

"Approval requests" count in header doesn't update after approval/rejection.

### Diagnostic Steps

**1. Check Notification Received**

Browser console should show:

```javascript
"Notification received:", { type: "approval_request", ... }
```

**2. Check onNotification Callback**

In `DashboardActionButtons.tsx`, verify:

```typescript
const { connected } = useNotifications({
  onNotification: (notification) => {
    console.log("onNotification called:", notification);
    if (notification.type === "approval_request" || notification.type === "approval_complete") {
      fetchApprovalCounts(); // Should be called
    }
  },
});
```

**3. Check API Call**

Network tab should show:

```
GET /api/approval-requests/pending
Status: 200
```

### Common Causes

#### Cause 1: Callback Not Wired

**Fix**:
Ensure `onNotification` callback is passed to `useNotifications`:

```typescript
const { connected } = useNotifications({
  onNotification: handleNotification,
  autoReconnect: true,
});
```

#### Cause 2: Wrong Notification Type

**Debug**:

```typescript
onNotification: (notification) => {
  console.log("Notification type:", notification.type);
  // Should be: "approval_request", "approval_complete", or "approval_rejected"
};
```

**Fix**:
Check notification types in `services/notification.service.ts`.

---

## Database Issues

### Symptom

Errors related to missing tables, columns, or foreign keys.

### Diagnostic Steps

**1. Verify Tables Exist**

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'a4ayc80OGd'  -- Your tenant ID
  AND table_name LIKE 'approval%'
ORDER BY table_name;
```

Should show:

```
approval_request_step_approvals
approval_request_steps
approval_requests
approval_step_approvers
approval_workflow_steps
approval_workflows
```

**2. Verify Indexes Exist**

```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'approval_requests'
  AND schemaname = 'a4ayc80OGd'
ORDER BY indexname;
```

**3. Check Foreign Keys**

```sql
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'a4ayc80OGd'
  AND tc.table_name LIKE 'approval%';
```

### Common Causes

#### Cause 1: Migration Not Run

**Fix**:
Run the migration script:

```bash
npm run migrate
```

Or manually create tables using SQL from `database-schema.md`.

#### Cause 2: Wrong Tenant Schema

**Symptoms**:

- Tables exist but queries fail
- "relation does not exist" errors

**Fix**:
Ensure `tenantId` is correctly set:

```typescript
const tenantId = req.tenantId; // From JWT
console.log("Using tenant schema:", tenantId);
```

---

## Performance Issues

### Symptom

Slow response times, timeouts, or high database load.

### Diagnostic Steps

**1. Check Query Performance**

Enable query logging:

```typescript
const sequelize = new Sequelize({
  logging: console.log, // Log all queries
  benchmark: true, // Show execution time
});
```

**2. Analyze Slow Queries**

PostgreSQL slow query log:

```sql
-- Queries taking > 1 second
SELECT
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC;
```

### Common Causes

#### Cause 1: Missing Indexes

**Fix**:
Add indexes from `database-schema.md`:

```sql
CREATE INDEX idx_approval_requests_current_step
ON approval_requests(current_step);

CREATE INDEX idx_approval_requests_status
ON approval_requests(status);

CREATE INDEX idx_step_approvals_approver_result
ON approval_request_step_approvals(approver_id, approval_result);
```

#### Cause 2: N+1 Query Problem

**Symptoms**:

- Many individual queries instead of joins
- Slow list endpoints

**Fix**:
Use joins or eager loading:

```typescript
// ❌ N+1 queries
const requests = await getRequests();
for (const request of requests) {
  request.steps = await getSteps(request.id); // N queries
}

// ✅ Single query with join
const requests = await getRequestsWithSteps();
```

#### Cause 3: Too Many SSE Connections

**Symptoms**:

- Memory usage increasing
- Server becoming slow

**Fix**:
Implement connection cleanup:

```typescript
// In notification.ctrl.ts
setInterval(() => {
  const now = Date.now();
  connections.forEach((conn, key) => {
    if (now - conn.lastHeartbeat > 3600000) {
      // 1 hour
      conn.response.end();
      connections.delete(key);
    }
  });
}, 300000); // Every 5 minutes
```

---

## Debugging Tips

### Enable Debug Logging

**Backend**:

```typescript
// In controllers
console.log("[DEBUG] Request ID:", requestId);
console.log("[DEBUG] Current step:", currentStep);
console.log("[DEBUG] Approvers:", approvers);
```

**Frontend**:

```typescript
// In useNotifications.ts
console.log("[SSE] Connection status:", connected);
console.log("[SSE] Notification received:", notification);
```

### Check Database State

**Current Approval State**:

```sql
SELECT
  ar.id,
  ar.request_name,
  ar.status,
  ar.current_step,
  ars.step_name,
  ars.status as step_status,
  COUNT(arsa.id) as total_approvers,
  COUNT(arsa.id) FILTER (WHERE arsa.approval_result = 'APPROVED') as approved,
  COUNT(arsa.id) FILTER (WHERE arsa.approval_result = 'PENDING') as pending
FROM approval_requests ar
JOIN approval_request_steps ars ON ar.id = ars.request_id AND ars.step_number = ar.current_step
LEFT JOIN approval_request_step_approvals arsa ON ars.id = arsa.request_step_id
WHERE ar.id = 14
GROUP BY ar.id, ar.request_name, ar.status, ar.current_step, ars.step_name, ars.status;
```

### Test Notification Flow

**1. Create Test Workflow**:

```bash
curl -X POST http://localhost:3000/api/approval-workflows \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_title": "Test Workflow",
    "entity": 1,
    "steps": [{
      "step_number": 1,
      "step_name": "Test Step",
      "requires_all_approvers": false,
      "approvers": [2]
    }]
  }'
```

**2. Establish SSE Connection**:

```bash
curl -N -H "Authorization: Bearer USER2_TOKEN" \
  http://localhost:3000/api/notifications/stream &
```

**3. Create Use-Case**:

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_title": "Test Project",
    "approval_workflow_id": 1,
    "framework": [1],
    ...
  }'
```

**4. Verify Notification Received**:
Should see in SSE stream:

```
data: {"type":"approval_request","title":"New Approval Request",...}
```

---

## Debugging and Logging

### Production Logging

**Note**: Debug console.log statements have been removed from production code for a cleaner user experience.

**Server-side Logging**:

- Uses structured logging via `logStructured()` function
- Logs are written to `logs/server.log`
- All approval workflow operations log their status (processing, successful, error)

**Client-side Logging**:

- Debug console logs removed from frontend
- SSE connection and notifications work silently
- Errors are displayed via the Alert system

### Enabling Debug Mode (Development Only)

If you need to debug issues in development:

1. **Backend**: Add temporary console.log statements in:
   - `utils/approvalRequest.utils.ts` - Request processing
   - `utils/approvalWorkflow.utils.ts` - Workflow operations
   - `services/notification.service.ts` - Notification sending

2. **Frontend**: Add temporary console.log statements in:
   - `hooks/useNotifications.ts` - SSE connection status
   - Check browser Network tab for SSE stream

**Remember to remove these before committing!**

---

## Getting Help

If you're still experiencing issues:

1. **Check Server Logs**:

   ```bash
   tail -f logs/server.log
   ```

2. **Enable Verbose Logging**:
   Set `LOG_LEVEL=debug` in `.env`

3. **Review Documentation**:
   - [Architecture](./architecture.md)
   - [Code Flow](./code-flow.md)
   - [API Endpoints](./api-endpoints.md)

4. **Search for Similar Issues**:
   Check if the issue has been encountered before

5. **Create Detailed Issue Report**:
   Include:
   - Error message
   - Steps to reproduce
   - Server logs
   - Database query results
   - Expected vs actual behavior
