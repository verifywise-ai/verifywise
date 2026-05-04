# Security Considerations

## Multi-Tenancy Security

### Schema-Based Isolation

All approval workflow data is isolated using PostgreSQL schema-based multi-tenancy:

```sql
-- Each tenant has their own schema
CREATE TABLE "${tenantId}".approval_workflows (...);
CREATE TABLE "${tenantId}".approval_requests (...);
```

**Security Guarantees**:

- No cross-tenant data access possible
- Each query automatically scoped to tenant schema
- Database-level isolation enforced

**Example Query**:

```typescript
const workflows = await sequelize.query(
  `
  SELECT * FROM "${tenantId}".approval_workflows
  WHERE entity = :entity
`,
  { replacements: { entity: 1 } },
);
```

### JWT Authentication Context

All endpoints extract authentication context from JWT token:

**Middleware**: `middleware/auth.middleware.ts:authenticateJWT`

**Extracted Values**:

- `req.userId` - Current user's ID
- `req.tenantId` - Organization's tenant ID (schema name)
- `req.userRoleName` - User's role name

**Security Flow**:

```
1. Client sends: Authorization: Bearer <JWT>
2. Middleware validates JWT signature
3. Middleware extracts payload
4. Sets req.userId, req.tenantId, req.userRoleName
5. Controller uses these values (guaranteed to exist)
```

---

## Authorization Model

### Role-Based Access Control

**Admin Role**:

- Create/update/delete workflows
- View all approval workflows
- Manage workflow steps and approvers

**All Authenticated Users**:

- View workflows (needed for use-case creation)
- Create approval requests
- View their own requests
- View requests they're approvers for
- Approve/reject requests they're assigned to

### Endpoint Protection

**Admin-only endpoints**:

```typescript
router.post("/approval-workflows", authenticateJWT, authorize(["Admin"]), createApprovalWorkflow);

router.put(
  "/approval-workflows/:id",
  authenticateJWT,
  authorize(["Admin"]),
  updateApprovalWorkflow,
);

router.delete(
  "/approval-workflows/:id",
  authenticateJWT,
  authorize(["Admin"]),
  deleteApprovalWorkflow,
);
```

**User-accessible endpoints**:

```typescript
// No role restriction - all authenticated users
router.get("/approval-workflows", authenticateJWT, getApprovalWorkflows);

router.post(
  "/approval-requests/:id/approve",
  authenticateJWT,
  approveRequest, // Approver validation inside controller
);
```

### Fine-Grained Authorization

Beyond role checks, controllers enforce fine-grained permissions:

**Approver Validation**:

```typescript
// Check if user is an approver for current step
const isApprover = approvers.some((a) => a.approver_id === userId);
if (!isApprover) {
  return res.status(403).json({
    error: "You are not an approver for this step",
  });
}
```

**Requester Validation**:

```typescript
// Only requester can withdraw
if (request.requested_by !== userId) {
  return res.status(403).json({
    error: "Only the requester can withdraw this request",
  });
}
```

**Double Response Prevention**:

```typescript
// Prevent approving twice
if (approval.approval_result !== "PENDING") {
  return res.status(400).json({
    error: "You have already responded to this request",
  });
}
```

---

## Notification Security

### SSE Connection Security

**Connection Storage**:

```typescript
connections.set(`${tenantId}:${userId}`, {
  response: res,
  tenantId: tenantId, // Store for validation
  userId: userId,
});
```

**Double Validation Before Sending**:

```typescript
const connection = getConnection(`${tenantId}:${userId}`);

// Validate tenant match
if (connection.tenantId !== tenantId) {
  console.error("Security: Tenant mismatch!");
  return;
}

// Validate user match
if (connection.userId !== userId) {
  console.error("Security: User mismatch!");
  return;
}

// Safe to send
connection.response.write(`data: ${JSON.stringify(notification)}\n\n`);
```

**Why Double Validation?**

- Prevents key collision attacks
- Guards against Redis message tampering
- Defense-in-depth strategy

### Redis Pub/Sub Security

**Message Structure**:

```typescript
{
  tenantId: "a4ayc80OGd",
  userId: 123,
  notification: {
    title: "New Approval Request",
    message: "...",
    type: "approval_request"
  }
}
```

**Subscriber Filtering**:

```typescript
subscriber.on("message", (channel, message) => {
  const { tenantId, userId, notification } = JSON.parse(message);

  // Only send if connection exists AND tenant/user match
  const connection = getConnection(`${tenantId}:${userId}`);
  if (connection && connection.tenantId === tenantId && connection.userId === userId) {
    connection.response.write(`data: ${JSON.stringify(notification)}\n\n`);
  }
});
```

**Security Properties**:

- No broadcast to all users (targeted delivery)
- Tenant isolation enforced
- User isolation enforced
- No cross-tenant message leaks

---

## Data Security

### Transaction Safety

All approval operations wrapped in transactions:

```typescript
const transaction = await sequelize.transaction();
try {
  // Create approval request
  await createApprovalRequest(..., transaction);

  // Create request steps
  await createRequestSteps(..., transaction);

  // Create step approvals
  await createStepApprovals(..., transaction);

  // Commit atomically
  await transaction.commit();

  // Send notifications after commit
  notifyStepApprovers(...);
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

**Security Benefits**:

- All-or-nothing operations (no partial state)
- Rollback on error (no orphaned records)
- Consistent state guaranteed

### Notification Timing Security

Notifications sent **AFTER** transaction commits:

**Why This Matters**:

- Prevents notifying about uncommitted data
- Avoids race conditions
- Ensures data visibility to all connections

**Before (Vulnerable)**:

```typescript
await createApprovalRequest(..., transaction);
notifyStepApprovers(...);  // ❌ Query sees 0 approvers
await transaction.commit();
```

**After (Secure)**:

```typescript
await createApprovalRequest(..., transaction);
const notificationInfo = { requestId, stepNumber, ... };
await transaction.commit();  // ✅ Commit first
notifyStepApprovers(notificationInfo);  // ✅ Now visible
```

### Input Validation

All endpoints validate input:

**Workflow Creation**:

```typescript
if (!workflow_title || !entity || !steps || steps.length === 0) {
  return res.status(400).json({
    error: "Validation failed",
    details: { ... }
  });
}
```

**Step Validation**:

```typescript
if (!step_name || !approvers || approvers.length === 0) {
  return res.status(400).json({
    error: "Step name and approvers are required",
  });
}
```

**Parameterized Queries**:

```typescript
// ✅ Safe from SQL injection
const result = await sequelize.query(
  `
  SELECT * FROM "${tenantId}".approval_requests
  WHERE id = :requestId
`,
  { replacements: { requestId } },
);

// ❌ NEVER do this
const result = await sequelize.query(`
  SELECT * FROM "${tenantId}".approval_requests
  WHERE id = ${requestId}
`);
```

---

## Common Security Scenarios

### Scenario 1: Cross-Tenant Access Attempt

**Attack**: User from Tenant A tries to approve request from Tenant B

**Protection**:

1. JWT contains `tenantId: "tenantA"`
2. All queries use `"${tenantId}".approval_requests`
3. Request from Tenant B is in schema `tenantB`
4. Query returns 0 results (not found)
5. Attack fails at database level

### Scenario 2: Unauthorized Approval Attempt

**Attack**: User tries to approve request they're not an approver for

**Protection**:

```typescript
// Check if user is an approver for current step
const approvers = await getApproversForStep(requestId, currentStep);
const isApprover = approvers.some((a) => a.approver_id === userId);

if (!isApprover) {
  return res.status(403).json({
    error: "You are not an approver for this step",
  });
}
```

### Scenario 3: Double Approval Attempt

**Attack**: User tries to approve same request twice

**Protection**:

```typescript
const approval = await getApprovalRecord(requestStepId, userId);

if (approval.approval_result !== "PENDING") {
  return res.status(400).json({
    error: "You have already responded to this request",
  });
}
```

### Scenario 4: Notification Interception

**Attack**: Attacker tries to receive notifications for other users

**Protection**:

1. SSE connection requires valid JWT
2. Connection keyed by `${tenantId}:${userId}` from JWT
3. Notifications published with target `tenantId` and `userId`
4. Double validation before sending (tenant + user match)
5. No way to receive notifications for different user

---

## Security Best Practices

### For Developers

1. **Always Use Transaction Context**

   ```typescript
   // ✅ Good
   await createRecord(..., transaction);

   // ❌ Bad
   await createRecord(...);  // Auto-commit
   ```

2. **Always Validate User Permissions**

   ```typescript
   // ✅ Good
   if (request.requested_by !== userId) {
     return res.status(403).json({ error: "..." });
   }

   // ❌ Bad
   // Trust that user has permission
   ```

3. **Always Use Parameterized Queries**

   ```typescript
   // ✅ Good
   { replacements: { id: userId } }

   // ❌ Bad
   WHERE id = ${userId}
   ```

4. **Never Log Sensitive Data**

   ```typescript
   // ✅ Good
   console.log("Request approved", { requestId });

   // ❌ Bad
   console.log("Request data:", request); // May contain sensitive info
   ```

5. **Always Send Notifications After Commit**

   ```typescript
   // ✅ Good
   await transaction.commit();
   notifyApprovers(...);

   // ❌ Bad
   notifyApprovers(...);
   await transaction.commit();
   ```

### For Administrators

1. **Principle of Least Privilege**
   - Only assign Admin role when necessary
   - Use regular roles for approvers
   - Audit role assignments regularly

2. **Monitor for Suspicious Activity**
   - Watch for repeated 403 errors (unauthorized access attempts)
   - Check for unusual approval patterns
   - Review SSE connection logs

3. **Regular Security Audits**
   - Review workflow approver assignments
   - Check for orphaned approval requests
   - Validate tenant isolation

4. **Keep Dependencies Updated**
   - Regularly update `jsonwebtoken`
   - Update `sequelize` for security patches
   - Update Redis client

---

## Security Checklist

Before deploying to production:

- [ ] All endpoints use `authenticateJWT` middleware
- [ ] Admin endpoints use `authorize(["Admin"])` middleware
- [ ] All database queries use tenant-scoped schemas
- [ ] All queries use parameterized values (no string interpolation)
- [ ] All approval operations wrapped in transactions
- [ ] Notifications sent after transaction commits
- [ ] SSE connections validate tenant and user
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak sensitive information
- [ ] Redis connection uses authentication (if in production)
- [ ] JWT secret is strong and rotated regularly
- [ ] Database connection uses least-privilege credentials

---

## Threat Model

### Threats Mitigated

✅ **SQL Injection**: Parameterized queries
✅ **Cross-Tenant Data Access**: Schema-based isolation
✅ **Unauthorized Approvals**: Approver validation
✅ **Notification Interception**: Double validation
✅ **CSRF**: JWT-based authentication (not cookies)
✅ **Replay Attacks**: JWT expiration
✅ **Double Approvals**: Status checking

### Potential Threats (Future Considerations)

⚠️ **Rate Limiting**: Not currently implemented
⚠️ **Brute Force**: No account lockout
⚠️ **DDoS**: No connection limits
⚠️ **Audit Logging**: Limited audit trail

---

## Incident Response

If a security issue is discovered:

1. **Immediate Actions**:
   - Disable affected endpoints if necessary
   - Check logs for extent of breach
   - Notify affected users

2. **Investigation**:
   - Query `approval_requests` for suspicious activity
   - Check SSE connection logs
   - Review recent approvals

3. **Remediation**:
   - Patch vulnerability
   - Rotate JWT secrets if compromised
   - Consider reverting suspicious approvals

4. **Prevention**:
   - Add regression test
   - Update security documentation
   - Review related code
