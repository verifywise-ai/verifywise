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

### Risk Notifications

| Type | Trigger | Delivery |
|------|---------|----------|
| `model_risk_candidates` | Model gained a project, or a new model risk, leaving unseen shared-project candidates for a project risk | In-app |
| `vendor_risk_candidates` | Vendor gained a use case, or a new vendor risk, leaving unseen candidate parents for a project risk in that use case | In-app |
| `vendor_research_findings` | An automatic vendor research run completed with at least one finding; sent to the vendor's assignee | In-app |
| `risk_deadline_due_soon` | Project risk deadline within 7 days (in-app + email) or 1 day (Slack) | In-app + Email / Slack |
| `model_risk_due_soon` | Model risk target date within 7 days (in-app + email) or 1 day (Slack) | In-app + Email / Slack |

#### Vendor research notice

The vendor research agent (see [Vendors](./vendors.md#vendor-research-agent)) tells a vendor's assignee, when the vendor has one and that person is a user of the vendor's organization, that an **automatic** run stored findings. A manual run sends nothing: the person who started it is looking at the result. `handleVendorResearchJob` sends the notice after the run has ended, so a failure to send is logged and cannot change the run.

The organization check is `isUserOfOrganization` (`services/vendorResearch/assignee.ts`, a wrapper around `findUsersNotInOrganization`), the one the accept uses for the default action owner: vendor writes do not check the assignee, and the foreign key behind it accepts any user, so the assignee can belong to another organization. For such a person (or an id that cannot be a user id) no notification is written, nothing is raised, the run is unaffected, and one debug line with ids only is logged. A failing lookup is a real failure: it is logged as an error and does not change the run.

- Title `Vendor research findings`; message `1 potential risk found for "Acme". Review it in Vendors > Risks.` (or `3 potential risks found for "Acme". Review them in Vendors > Risks.`), in the recipient's language. In-app only, no email.
- Entity: `vendor` (the vendor's id and name). Link: `/vendors/risks?findingsVendorId=<vendor id>`, which opens the Risks tab with the findings section on that vendor. The existing `/vendors?vendorId=` link would open the vendor modal instead.
- `metadata`: `{ run_id, vendor_id, count }`.
- **Dedup: one notification per run.** The partial unique index `notifications_vendor_research_findings_uniq` is on `(organization_id, user_id, (metadata->>'run_id')) WHERE type = 'vendor_research_findings'`. A run belongs to one vendor, so the run id is enough to tell one notice from the next. Two attempts to announce the same run collide, and `notifyAssigneeOfVendorResearch` treats that unique violation (23505 on this index only) as a suppressed duplicate. Any other 23505 still throws.
- The enum value and the index are two migrations, in this order: `20261010161236-vendor-research-notification-type.js`, then `20261010161240-vendor-research-notification-unique.js`. A new Postgres enum value cannot be used until the statement that added it has committed, and the index predicate names it. The first migration's `down` is a no-op, as for `vendor_risk_candidates`.

#### Deadline escalation dedup

The nightly deadline sweep notifies the owner plus every org admin, so the
sent-record is per recipient per entity per threshold per deadline:
`organization_id`, `user_id`, `type`, `entity_type`, `entity_id` plus
`metadata->>'threshold_days'` and `metadata->>'deadline'`. The threshold clause
is what lets the 7-day and 1-day notices coexist on the same risk. The deadline
clause (the exact stored deadline, `deadlineNoticeKey` in
`utils/deadline.utils.ts`) re-arms both notices when the deadline is
rescheduled: a notice sent for the old deadline does not count for the new
one. A failed write leaves no record, so the next night retries exactly that
recipient.

What the sweep scans (`getRisksApproachingDeadlineQuery`,
`getModelRisksApproachingTargetDateQuery`):

- Closed items are skipped: project risks whose `mitigation_status` is
  `Completed` or `Canceled`, model risks whose `status` is `Resolved` or
  `Accepted`.
- Overdue deadlines are only looked back `DEADLINE_OVERDUE_LOOKBACK_DAYS`
  (7). That covers a missed run or a week of worker downtime, and stops the
  first run after a deploy from notifying about every deadline that ever
  passed. A recurring overdue reminder would be a separate feature.

Apart from a reschedule, the only thing that re-arms a notice is a user
deleting the notification themselves — the dedup row is the notification row,
so deleting it looks exactly like "never sent". There is no scheduled purge
(both bulk-delete helpers in `utils/notification.utils.ts` have no callers).

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
| `ASSIGNMENT_NOTIFICATION` | "You have been assigned" for a vendor, risk, project, model and so on (`notifyUserAssigned`) |

### Assignment emails

`notifyUserAssigned` (`services/inAppNotification.service.ts`) writes the in-app notification and sends the `ASSIGNMENT_NOTIFICATION` email. The template is HTML, and the text that someone else wrote reaches it in one of two ways, under the escaping rule of the [email service](../infrastructure/email-service.md#template-variable-replacement):

- **Plain slots.** The recipient's name, the assigner's name and the entity name (`recipient_name`, `assigner_name`, `entity_name`) are passed as written. `compileMjmlToHtml` escapes every value whose key does not end in `Html` or `_html`, so the service must not escape them as well: `Smith & Co` would show as `Smith &amp; Co`. The same goes for `entity_url`, which is built from the front-end address and ids and sits in an `href` (an `&` in it becomes `&amp;`, which is right there), and for the values that come from constants (role, entity type, role description, date).
- **The raw slot.** `entity_context_html` is a table that the service builds itself (`buildEntityContextHtml`) from the entity context box (framework, project, parent type, parent name, description). It is inserted as it is, so the service escapes each value with `escapeHtml` of `utils/sanitization.utils.ts` (`&`, `<`, `>`, `"` and `'`), and builds the colors of the markup from `emailColorTokens`.

A name such as `Smith & Co` shows as typed, and text that a person or a model wrote cannot add a tag, a link or an image. An accepted vendor research finding is the case that matters most: its risk and impact text come from a model that read a web page. `services/tests/inAppNotification.service.spec.ts` renders the real template with such text to prove both slots.

The subject line and the in-app notification are plain text, not HTML, and keep what was written; the app shows the notification as text.

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
  EVIDENCE_STALE = "evidence_stale",
  MODEL_RISK_CANDIDATES = "model_risk_candidates",
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
