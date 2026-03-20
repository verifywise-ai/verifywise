# Automations & Job Scheduling

## Overview

VerifyWise uses BullMQ with Redis for background job processing and scheduled tasks. The system supports recurring jobs (cron-based), event-triggered automations, and user-configured workflows. Three separate queues handle different concerns: general automations, Slack notifications, and MLFlow sync.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              JOB SCHEDULING FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │    Application   │                                                       │
│  │    (Express)     │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           │ 1. Add job to queue                                             │
│           ▼                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  Automation      │     │  Slack           │     │  MLFlow          │    │
│  │  Producer        │     │  Producer        │     │  Producer        │    │
│  └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘    │
│           │                        │                        │              │
│           │ 2. Jobs stored in Redis                         │              │
│           ▼                        ▼                        ▼              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                              Redis                                   │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │ automation-     │  │ slack-          │  │ mlflow-sync     │      │   │
│  │  │ actions         │  │ notifications   │  │                 │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                        │                        │              │
│           │ 3. Workers poll jobs                            │              │
│           ▼                        ▼                        ▼              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  Automation      │     │  Slack           │     │  MLFlow          │    │
│  │  Worker          │     │  Worker          │     │  Worker          │    │
│  │  (concurrency:10)│     │                  │     │                  │    │
│  └────────┬─────────┘     └──────────────────┘     └──────────────────┘    │
│           │                                                                 │
│           │ 4. Execute job handler                                          │
│           ▼                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Job Handlers: Email, Reports, PMM Notifications, Vendor Checks      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Queues

### Automation Queue

**Queue Name:** `automation-actions`

Handles general automation tasks: email sending, report generation, vendor notifications, PMM processing.

```typescript
// File: Servers/services/automations/automationProducer.ts

import { Queue } from "bullmq";

export const automationQueue = new Queue("automation-actions", {
  connection: { url: process.env.REDIS_URL }
});
```

### Slack Notifications Queue

**Queue Name:** `slack-notifications`

Handles Slack channel notifications for policy due dates.

```typescript
// File: Servers/services/slack/slackProducer.ts

export const slackQueue = new Queue("slack-notifications", {
  connection: { url: process.env.REDIS_URL }
});
```

### MLFlow Sync Queue

**Queue Name:** `mlflow-sync`

Handles synchronization with MLFlow model registry.

```typescript
// File: Servers/services/mlflow/mlflowSyncProducer.ts

export const mlflowQueue = new Queue("mlflow-sync", {
  connection: { url: process.env.REDIS_URL }
});
```

## Scheduled Jobs

### Job Schedule Summary

| Job Name | Cron Pattern | Time | Purpose |
|----------|--------------|------|---------|
| `send_vendor_notification` | `0 0 * * *` | Daily at midnight | Vendor review date notifications |
| `send_report_notification` | `0 0 * * *` | Daily at midnight | Scheduled report generation |
| `pmm_hourly_check` | `0 * * * *` | Every hour | PMM cycle processing |
| `slack-notification-policy` | `0 9 * * *` | Daily at 9 AM | Slack policy due notifications |
| `mlflow-sync-all-orgs` | `0 * * * *` | Every hour | MLFlow model sync |

### Cron Pattern Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday=0)
│ │ │ │ │
* * * * *
```

### Vendor Review Notifications

```typescript
// File: Servers/services/automations/automationProducer.ts

export const scheduleVendorReviewDateNotification = async () => {
  await automationQueue.add(
    "send_vendor_notification",
    { type: "review_date" },
    {
      repeat: { pattern: "0 0 * * *" },  // Daily at midnight
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
};
```

**Processing Logic:**
1. Queries all organizations
2. For each org, finds vendors with approaching review dates
3. Checks automation config for `daysBefore` parameter
4. Sends email notifications to assignees

### Report Notifications

```typescript
export const scheduleReportNotification = async () => {
  await automationQueue.add(
    "send_report_notification",
    { type: "report_notification" },
    {
      repeat: { pattern: "0 0 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
};
```

**Processing Logic:**
1. Fetches active `scheduled_report` automations
2. Checks frequency (daily/weekly/monthly)
3. Generates reports using v2 reporting system
4. Uploads reports as files
5. Sends emails with attachments

### PMM Hourly Check

```typescript
export const schedulePMMHourlyCheck = async () => {
  await automationQueue.add(
    "pmm_hourly_check",
    { type: "pmm" },
    {
      repeat: { pattern: "0 * * * *" },  // Every hour
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
};
```

**Processing Logic:**
1. Checks all organizations where current hour matches `notification_hour`
2. Creates new cycles when due
3. Sends initial notifications
4. Sends reminders for approaching due dates
5. Escalates overdue cycles

## Workers

### Automation Worker

```typescript
// File: Servers/services/automations/automationWorker.ts

import { Worker, Job } from "bullmq";

export const createAutomationWorker = () => {
  const worker = new Worker(
    "automation-actions",
    async (job: Job) => {
      switch (job.name) {
        case "send_vendor_notification":
          return await sendVendorReviewDateNotification();

        case "send_report_notification":
          return await sendReportNotification();

        case "send_report_notification_daily":
          return await sendReportNotificationEmail(job.data);

        case "pmm_hourly_check":
          return await processPMMHourlyCheck();

        case "send_pmm_notification":
          return await sendPMMNotification(job.data);

        case "send_email":
          return await sendEmail(job.data);

        default:
          console.log(`Unknown job type: ${job.name}`);
      }
    },
    {
      connection: { url: process.env.REDIS_URL },
      concurrency: 10,  // Process 10 jobs simultaneously
    }
  );

  // Event handlers
  worker.on("completed", (job) => {
    console.log(`Job ${job.id} (${job.name}) completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  return worker;
};
```

### Worker Initialization

```typescript
// File: Servers/jobs/worker.ts

import { createAutomationWorker } from "../services/automations/automationWorker";
import { createSlackWorker } from "../services/slack/slackWorker";
import { createMlflowWorker } from "../services/mlflow/mlflowSyncWorker";

export const automationWorker = createAutomationWorker();
export const slackWorker = createSlackWorker();
export const mlflowWorker = createMlflowWorker();

// Graceful shutdown
process.on("SIGINT", async () => {
  await automationWorker.close();
  await slackWorker.close();
  await mlflowWorker.close();
  process.exit(0);
});
```

## Job Handlers

### Send Email Handler

```typescript
// File: Servers/services/automations/actions/sendEmail.ts

export const sendEmail = async (data: SendEmailData) => {
  const { recipients, subject, body, attachments } = data;

  // Convert newlines to HTML <br> tags
  const htmlBody = body.replace(/\n/g, "<br>");

  try {
    await sendAutomationEmail({
      to: recipients,
      subject,
      html: htmlBody,
      attachments,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
```

### PMM Notification Handler

```typescript
// File: Servers/services/automations/automationWorker.ts

const sendPMMNotification = async (data: PMMNotificationData) => {
  const {
    templateName,
    stakeholder_email,
    stakeholder_name,
    use_case_title,
    cycle_number,
    due_date,
    days_remaining,
    monitoring_link,
    organization_name,
    attachments,
  } = data;

  // Compile MJML template
  const templatePath = path.join(__dirname, `../../templates/${templateName}.mjml`);
  const html = compileMjmlToHtml(templatePath, {
    stakeholder_name,
    use_case_title,
    cycle_number,
    due_date,
    days_remaining,
    monitoring_link,
    organization_name,
  });

  await sendAutomationEmail({
    to: [stakeholder_email],
    subject: `Post-market monitoring: ${use_case_title}`,
    html,
    attachments,
  });
};
```

## Automation Configuration

### Database Tables

**Public Schema (Shared):**

```sql
-- Available triggers
CREATE TABLE automation_triggers (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,      -- e.g., "vendor_added"
  label TEXT NOT NULL,           -- e.g., "Vendor Added"
  event_name TEXT NOT NULL,      -- e.g., "vendor.added"
  description TEXT
);

-- Available actions
CREATE TABLE automation_actions (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,      -- e.g., "send_email"
  label TEXT NOT NULL,           -- e.g., "Send Email"
  description TEXT,
  default_params JSONB DEFAULT '{}'
);

-- Trigger-action associations
CREATE TABLE automation_triggers_actions (
  trigger_id INTEGER REFERENCES automation_triggers(id),
  action_id INTEGER REFERENCES automation_actions(id),
  PRIMARY KEY (trigger_id, action_id)
);
```

**Tenant Schema (Per Organization):**

```sql
-- User-configured automations
CREATE TABLE automations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_id INTEGER REFERENCES public.automation_triggers(id),
  params JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES public.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Actions for each automation
CREATE TABLE automation_actions (
  id SERIAL PRIMARY KEY,
  automation_id INTEGER REFERENCES automations(id),
  action_type_id INTEGER REFERENCES public.automation_actions(id),
  params JSONB DEFAULT '{}',
  "order" INTEGER DEFAULT 1
);

-- Execution history
CREATE TABLE automation_execution_logs (
  id SERIAL PRIMARY KEY,
  automation_id INTEGER REFERENCES automations(id),
  triggered_at TIMESTAMP DEFAULT NOW(),
  trigger_data JSONB DEFAULT '{}',
  action_results JSONB DEFAULT '[]',
  status TEXT CHECK (status IN ('success', 'partial_success', 'failure')),
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_automation_execution_logs_automation_id
  ON automation_execution_logs(automation_id);
CREATE INDEX idx_automation_execution_logs_triggered_at
  ON automation_execution_logs(triggered_at DESC);
```

### Seeded Triggers

| Key | Label | Event Name | Description |
|-----|-------|------------|-------------|
| `vendor_added` | Vendor Added | vendor.added | New vendor created |
| `model_added` | Model Added | model.added | New model added |
| `vendor_review_date_approaching` | Vendor Review Date Approaching | vendor.review_date_approaching | Review date within threshold |
| `scheduled_report` | Scheduled Report | report.scheduled | Scheduled report generation |

## API Routes

```typescript
// File: Servers/routes/automation.route.ts

router.get("/", authenticateJWT, getAllAutomations);
router.get("/triggers", authenticateJWT, getAllAutomationTriggers);
router.get("/actions/by-triggerId/:triggerId", authenticateJWT, getAllAutomationActionsByTriggerId);
router.get("/:id", authenticateJWT, getAutomationById);
router.get("/:id/history", authenticateJWT, getAutomationHistory);
router.get("/:id/stats", authenticateJWT, getAutomationStats);
router.post("/", authenticateJWT, createAutomation);
router.put("/:id", authenticateJWT, updateAutomation);
router.delete("/:id", authenticateJWT, deleteAutomationById);
```

### Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/automations` | List all automations for tenant |
| GET | `/api/automations/triggers` | Get available trigger types |
| GET | `/api/automations/actions/by-triggerId/:id` | Get actions for a trigger |
| GET | `/api/automations/:id` | Get automation details |
| GET | `/api/automations/:id/history` | Get execution logs (paginated) |
| GET | `/api/automations/:id/stats` | Get execution statistics |
| POST | `/api/automations` | Create new automation |
| PUT | `/api/automations/:id` | Update automation |
| DELETE | `/api/automations/:id` | Delete automation |

## Execution Logging

### Log Structure

```typescript
interface IActionExecutionResult {
  action_id?: number;
  action_type: string;              // e.g., "send_email"
  status: "success" | "failure";
  result_data?: object;             // e.g., { recipients: [...] }
  error_message?: string;
  executed_at?: Date;
}

// Logging function
await logAutomationExecution(
  automationId,
  triggerData,
  actionResults,
  organizationId,
  startTime
);
```

### Status Determination

- **success** - All actions completed successfully
- **partial_success** - Some actions succeeded, some failed
- **failure** - All actions failed

### Statistics Query

```typescript
// File: Servers/utils/automationExecutionLog.utils.ts

export const getAutomationExecutionStats = async (
  automationId: number,
  organizationId: number
) => {
  const query = `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as successful,
      COUNT(*) FILTER (WHERE status = 'failure') as failed,
      AVG(execution_time_ms) as avg_execution_time
    FROM automation_execution_logs
    WHERE organization_id = :organizationId AND automation_id = :automationId
  `;
  // ...
};
```

## Template Variables

Automations support variable substitution in email subjects and bodies:

```typescript
// File: Servers/utils/automation/automation.utils.ts

export const replaceTemplateVariables = (
  template: string,
  replacements: Record<string, string>
): string => {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
};

// Usage
const subject = replaceTemplateVariables(
  "Review due for {{vendor_name}}",
  { vendor_name: "Acme Corp" }
);
// Result: "Review due for Acme Corp"
```

### Available Variables

**Vendor Notifications:**
- `{{vendor_name}}` - Vendor name
- `{{review_date}}` - Review due date
- `{{assignee_name}}` - Assigned user name
- `{{days_until_review}}` - Days remaining

**PMM Notifications:**
- `{{stakeholder_name}}` - Stakeholder name
- `{{use_case_title}}` - Use case title
- `{{cycle_number}}` - Cycle number
- `{{due_date}}` - Due date
- `{{days_remaining}}` - Days until due
- `{{monitoring_link}}` - Link to monitoring form
- `{{organization_name}}` - Organization name

## Running Workers

### Development

```bash
# Terminal 1: Start the backend (includes producer)
cd Servers
npm run watch

# Terminal 2: Start workers separately (optional)
npm run worker
```

### Production

```bash
# Workers can run as separate processes
node dist/jobs/worker.js

# Or included in main server startup
node dist/index.js  # Calls addAllJobs() on startup
```

### Startup Flow

```typescript
// File: Servers/index.ts

import { addAllJobs } from "./jobs/producer";

// Schedule all recurring jobs on startup
addAllJobs();
```

## Redis Configuration

```env
# Environment variable
REDIS_URL=redis://localhost:6379/0
```

```typescript
// File: Servers/database/redis.ts

import IORedis from "ioredis";

export const redisClient = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379/0",
  {
    maxRetriesPerRequest: null,  // Required for BullMQ
  }
);
```

## Error Handling

### Worker Error Events

```typescript
worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
  // Jobs with removeOnFail: false are kept for debugging
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});
```

### Job Retry Configuration

```typescript
await queue.add(jobName, data, {
  attempts: 3,                    // Retry up to 3 times
  backoff: {
    type: "exponential",
    delay: 1000,                  // 1s, 2s, 4s delays
  },
  removeOnComplete: true,
  removeOnFail: false,            // Keep failed jobs for inspection
});
```

## Key Files

| File | Purpose |
|------|---------|
| `Servers/jobs/producer.ts` | Job scheduling entry point |
| `Servers/jobs/worker.ts` | Worker initialization |
| `Servers/services/automations/automationProducer.ts` | Automation queue producer |
| `Servers/services/automations/automationWorker.ts` | Automation queue worker |
| `Servers/services/automations/actions/sendEmail.ts` | Email action handler |
| `Servers/services/postMarketMonitoring/pmmScheduler.ts` | PMM job processor |
| `Servers/controllers/automations.ctrl.ts` | Automation API controller |
| `Servers/routes/automation.route.ts` | Automation API routes |
| `Servers/utils/automationExecutionLog.utils.ts` | Execution logging utilities |
| `Servers/database/redis.ts` | Redis client configuration |

## Related Documentation

- [Architecture Overview](../architecture/overview.md)
- [Email Service](./email-service.md)
- [Post-Market Monitoring](../domains/post-market-monitoring.md)
