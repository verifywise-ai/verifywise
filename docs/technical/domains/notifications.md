# Notifications System

## Overview

The Notifications domain provides real-time and asynchronous notification delivery across VerifyWise. It uses Server-Sent Events (SSE) with Redis Pub/Sub for real-time delivery, email templates for asynchronous notifications, and Slack webhooks for team alerts.

## Key Features

- Real-time SSE streaming with Redis Pub/Sub
- Email notifications with rate limiting
- Slack webhook integration with routing
- Multi-tenant isolation
- Automatic reconnection handling
- Connection heartbeat management

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Backend   │────▶│    Redis    │────▶│   Backend   │
│  Publisher  │     │   Pub/Sub   │     │  Subscriber │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ SSE Stream  │
                                        │ Controller  │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Frontend   │
                                        │   Client    │
                                        └─────────────┘
```

## Real-Time Notifications (SSE)

### API Endpoint

```
GET /api/notifications/stream
Authorization: Bearer <token>
```

### SSE Headers

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

### Connection Management

The server maintains an in-memory map of active connections:

```typescript
// Connection key format
const connectionKey = `${tenantId}:${userId}`;

// Connection storage
connections.set(connectionKey, {
  response: res,
  tenantId: tenantId,
  lastActivity: Date.now()
});
```

### Heartbeat Mechanism

- Heartbeat sent every 30 seconds
- Format: `: heartbeat\n\n`
- Keeps connection alive through proxies
- Stale connections cleaned up after 1 hour

### Message Format

```
data: {"title":"New Approval","message":"...","type":"approval_request","entityId":123}\n\n
```

## Redis Pub/Sub

### Channel

```
Channel: approval-notifications
```

### Published Message Structure

```json
{
  "tenantId": "tenant_abc123",
  "userId": 123,
  "notification": {
    "title": "New Approval Request",
    "message": "John requested approval for Use Case X",
    "type": "approval_request",
    "entityId": 456,
    "entityType": "use_case"
  },
  "timestamp": "2025-01-17T10:00:00Z"
}
```

### Subscriber Security

Before delivering notifications:

1. Validate message format (tenantId, userId, notification required)
2. Verify stored connection's tenantId matches message tenantId
3. Verify userId matches
4. Only deliver if active SSE connection exists

## Notification Types

### Approval Workflow Notifications

| Type | Trigger | Recipients |
|------|---------|------------|
| `approval_request` | New request created | Step approvers |
| `approval_approved` | Request approved | Requester |
| `approval_rejected` | Request rejected | Requester |
| `approval_complete` | All steps complete | Requester |

### Project Notifications

| Type | Trigger | Delivery |
|------|---------|----------|
| `user_added` | Member added to project | Email |
| `role_changed_to_admin` | Role promoted | Email |
| `project_created` | New project | Email |

### Slack Routing Categories

```typescript
enum SlackNotificationRoutingType {
  MEMBERSHIP_AND_ROLES = "Membership and roles",
  PROJECTS_AND_ORGANIZATIONS = "Projects and organizations",
  POLICY_REMINDERS_AND_STATUS = "Policy reminders and status",
  EVIDENCE_AND_TASK_ALERTS = "Evidence and task alerts",
  CONTROL_OR_POLICY_CHANGES = "Control or policy changes"
}
```

## Email Notifications

### Rate Limiting

```typescript
const rateLimitConfig = {
  tokenRefillRate: 500,  // 2 tokens per second
  minDelay: 600,         // ms between sends
  maxTokens: 3,          // burst capacity
  backoffMultiplier: 2,
  maxBackoff: 10000      // ms
};
```

### Email Templates

| Template | Purpose |
|----------|---------|
| `ACCOUNT_CREATION` | New user welcome |
| `PASSWORD_RESET` | Password reset link |
| `PROJECT_CREATED_ADMIN` | Project creation |
| `USER_ADDED_PROJECT_*` | Member addition (by role) |
| `MEMBER_ROLE_CHANGED_*` | Role changes |
| `POLICY_DUE_SOON` | Policy review reminders |

### Queue Processing

```
Email Queue Flow:
1. Email added to queue
2. Rate limiter checks tokens
3. If tokens available → send immediately
4. If tokens exhausted → wait with backoff
5. Backoff: 600ms → 1200ms → 2400ms → 10000ms max
```

## Frontend Hook

### useNotifications Hook

```typescript
const {
  isConnected,
  reconnect,
  disconnect,
} = useNotifications({
  enabled: true,
  autoReconnect: true,
  reconnectDelay: 3000,
  onNotification: (notification) => {
    // Custom handler
  }
});
```

### SSE Parsing

The hook manually parses SSE format:

```typescript
// Messages separated by \n\n
// Data lines start with "data: "
// Heartbeat comments start with ":"
```

### Alert Mapping

| Notification Type | Alert Variant |
|-------------------|---------------|
| `approval_request` | info |
| `approval_approved` | success |
| `approval_rejected` | error |
| `approval_complete` | success |

## Notification Service Functions

### Real-Time Notifications

```typescript
// Generic publisher
sendNotification(tenantId, userId, notification)

// Approval workflow specific
notifyStepApprovers(requestId, stepNumber, tenantId)
notifyRequesterApproved(requestId, tenantId)
notifyRequesterRejected(requestId, comments, tenantId)
```

### Email Notifications

```typescript
// Project notifications
sendUserAddedToProjectNotification(userId, projectId, role)
sendMemberRoleChangedEditorToAdminNotification(userId, projectId)
sendProjectCreatedNotification(adminId, projectId)

// Policy notifications
sendPolicyDueSoonNotification(policyId, dueDate)
```

## Post-Market Monitoring Notifications

### Notification Data

```typescript
interface IPMMNotificationData {
  stakeholder_name: string;
  stakeholder_email: string;
  use_case_title: string;
  use_case_id: number;
  cycle_number: number;
  due_date: string;
  days_remaining: number;
  monitoring_link: string;
  organization_name: string;
}
```

### PMM Notification Types

| Type | Timing | Recipients |
|------|--------|------------|
| Initial | At cycle start | Stakeholder |
| Reminder | After reminder_days | Stakeholder |
| Escalation | After escalation_days | AI Chief |
| Completion | On submission | All stakeholders |
| Flagged concern | On flag | All stakeholders |

## Connection Lifecycle

```
1. Client connects: GET /api/notifications/stream
2. Server validates JWT, extracts tenantId + userId
3. Connection stored in memory map
4. Heartbeat starts (30s interval)
5. Client receives real-time notifications
6. On disconnect: connection removed from map
7. Stale cleanup runs every 60s (1hr threshold)
```

## Multi-Tenant Isolation

### Tenant Verification

```typescript
// On message received from Redis
if (storedConnection.tenantId !== message.tenantId) {
  console.warn("Tenant ID mismatch - potential security issue");
  return; // Do not deliver
}
```

### Connection Key Pattern

```typescript
// Key includes both tenant and user
const key = `${tenantId}:${userId}`;

// Ensures:
// - Users only receive their own notifications
// - Tenants are isolated from each other
```

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `controllers/notification.ctrl.ts` | SSE endpoint handler |
| `routes/notification.route.ts` | Route definition |
| `services/notification.service.ts` | Redis publisher |
| `services/notificationSubscriber.service.ts` | Redis subscriber |
| `services/notificationService.ts` | Email rate limiter |
| `services/userNotification/projectNotifications.ts` | Project emails |
| `services/slack/slackNotificationService.ts` | Slack integration |
| `services/postMarketMonitoring/pmmScheduler.ts` | PMM notifications |

### Frontend

| File | Purpose |
|------|---------|
| `application/hooks/useNotifications.ts` | SSE hook |
| `application/repository/approvalRequest.repository.ts` | Approval API |

### Database

| File | Purpose |
|------|---------|
| `migrations/20260108000000-create-approval-workflows-tables.js` | Schema |
| `domain.layer/enums/slack.enum.ts` | Slack routing types |
| `domain.layer/enums/approval-workflow.enum.ts` | Approval enums |

## Error Handling

### Connection Errors

```typescript
// Frontend reconnection
if (autoReconnect && !isConnected) {
  setTimeout(reconnect, reconnectDelay);
}
```

### Email Errors

```typescript
// Sanitized error logging (no PII)
const sanitizedError = {
  code: error.code,
  message: error.message.replace(/[^@]+@[^@]+/g, '[REDACTED]')
};
```

## Notification Types and Entity Types

```typescript
enum NotificationType {
  TASK_ASSIGNED = "task_assigned",
  REVIEW_REQUESTED = "review_requested",
  REVIEW_APPROVED = "review_approved",
  REVIEW_REJECTED = "review_rejected",
  APPROVAL_REQUESTED = "approval_requested",
  APPROVAL_COMPLETE = "approval_complete",
  VENDOR_REVIEW_DUE = "vendor_review_due",
  POLICY_DUE_SOON = "policy_due_soon",
  TRAINING_ASSIGNED = "training_assigned",
  // ... more types
}

enum NotificationEntityType {
  TASK = "task",
  RISK = "risk",
  VENDOR = "vendor",
  POLICY = "policy",
  USE_CASE = "use_case",
  TRAINING = "training",
  MODEL = "model",
  INCIDENT = "incident",
}
```

## Sending Notifications

### Single Notification

```typescript
import { sendInAppNotification } from "../services/inAppNotification.service";

await sendInAppNotification(
  tenantId,
  {
    user_id: userId,
    type: NotificationType.TASK_ASSIGNED,
    title: "New task assigned",
    message: "You have been assigned to: Review vendor",
    entity_type: NotificationEntityType.TASK,
    entity_id: taskId,
    entity_name: "Review vendor",
    action_url: `/tasks?taskId=${taskId}`,
  },
  true,  // Also send email notification
  {
    template: EMAIL_TEMPLATES.TASK_ASSIGNED,
    subject: "New task assigned",
    variables: { taskTitle: "Review vendor", assignerName: "John Doe" }
  }
);
```

### Bulk Notifications

```typescript
import { sendBulkInAppNotifications } from "../services/inAppNotification.service";

await sendBulkInAppNotifications(
  tenantId,
  {
    user_ids: [1, 2, 3, 4],
    type: NotificationType.POLICY_DUE_SOON,
    title: "Policy due soon",
    message: "Policy XYZ is due in 3 days",
    entity_type: NotificationEntityType.POLICY,
    entity_id: policyId,
    entity_name: "Policy XYZ",
    action_url: `/policies/${policyId}`,
  }
);
```

### Convenience Functions

```typescript
import { notifyTaskAssigned } from "../services/inAppNotification.service";

await notifyTaskAssigned(
  tenantId,
  assigneeId,
  { id: taskId, title: "Review vendor", priority: "high", due_date: "2026-03-01" },
  "John Doe",  // assigner name
  "https://app.verifywise.ai"
);
```

## Related Documentation

- [Automations](../infrastructure/automations.md)
- [Email Service](../infrastructure/email-service.md)
- [Integrations](../infrastructure/integrations.md) - Slack webhooks
- [Approvals](./approvals.md)
