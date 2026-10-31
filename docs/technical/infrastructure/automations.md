# Automations & Job Scheduling

## Overview

VerifyWise uses BullMQ with Redis for background job processing and scheduled tasks. The system supports recurring jobs (cron-based), event-triggered automations, and user-configured workflows. Four queues handle different concerns: general automations, Slack notifications, vendor research runs and the syncs of the vendor risk database. MLflow sync is not queued; it runs on demand when a user clicks **Sync**.

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
│  ┌──────────────────┐     ┌──────────────────┐                             │
│  │  Automation      │     │  Slack           │                             │
│  │  Producer        │     │  Producer        │                             │
│  └────────┬─────────┘     └────────┬─────────┘                             │
│           │                        │                                       │
│           │ 2. Jobs stored in Redis                                        │
│           ▼                        ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                              Redis                                   │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                           │   │
│  │  │ automation-     │  │ slack-          │                           │   │
│  │  │ actions         │  │ notifications   │                           │   │
│  │  └─────────────────┘  └─────────────────┘                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                        │                                       │
│           │ 3. Workers poll jobs                                           │
│           ▼                        ▼                                       │
│  ┌──────────────────┐     ┌──────────────────┐                             │
│  │  Automation      │     │  Slack           │                             │
│  │  Worker          │     │  Worker          │                             │
│  │  (concurrency:10)│     │                  │                             │
│  └────────┬─────────┘     └──────────────────┘                             │
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

### Vendor Research Queue

**Queue Name:** `vendor-research`

Carries out the runs of the [vendor research agent](../domains/vendors.md#vendor-research-agent), one `vendor_research` job for each run.

```typescript
// File: Servers/services/vendorResearch/queue.ts

export const vendorResearchQueue = new Queue("vendor-research", {
  connection: { url: REDIS_URL }
});
```

A run has a queue and a worker of its own for three reasons. A run holds its place for minutes (up to about 7), while every other job on `automation-actions` is short, so on a shared queue a burst of runs kept the notifications, the recomputes and the reports waiting, and a long line of other jobs could leave a run queued past the 15 minutes after which it is not started. The automation queue is emptied each time the backend starts (`obliterate` in `scheduleVendorReviewDateNotification` and `scheduleReportNotification`), which lost the runs that were waiting. And the number of runs at once is a setting of research alone (`VENDOR_RESEARCH_WORKER_CONCURRENCY`). Nothing empties the research queue.

### Vendor Risk Database Queue

**Queue Name:** `vendor-risk-database`

Carries out the syncs of the [vendor risk database](../domains/vendors.md#vendor-risk-database), one `vrdb_sync` job for each list and sync, and its status job, `vrdb_relabel`. A queue of its own, as the research has one: a sync downloads a list of tens of megabytes and must not hold the places of the automations. The queue is never emptied (`obliterate`) at start.

```typescript
// File: Servers/services/vendorResearch/vrdb/queue.ts

export const VRDB_QUEUE = "vendor-risk-database";
export const vrdbQueue = new Queue(VRDB_QUEUE, { connection: { url: REDIS_URL } });
```

Each list has a BullMQ job scheduler of its own (`vrdb_sync_<list>`, `vrdbSchedulerId`), at the list's own minute in UTC (`VRDB_SOURCES` in `vrdb/sources.ts`, see the table below). `scheduleVendorRiskDatabaseSync`, called by `addAllJobs` at the start of the backend (`jobs/producer.ts`), upserts the schedulers of the active lists (`activeMirrors`: four, while the gates of the CVE records, Q7, and of the UN list, Q6, are closed; `vrdb/gates.ts`) while `VENDOR_RESEARCH_VRDB` is `true` and `VENDOR_RESEARCH_RECORDS` is not `false` (`vrdbSyncsOn`), and removes them otherwise, so turning either off stops every download; a list behind a closed gate has no scheduler. An upsert by id changes nothing when the scheduler exists, so every start can call it. At the same start a first sync is queued for every active list that was never copied (job id `vrdb_sync_first_<list>`). A job has `attempts: 3`, an exponential back-off from one minute, and is removed when it completes or fails (`VRDB_SYNC_JOB_OPTIONS`).

**The status job.** A sync, or an answer of a read-through source (the NVD), that changed the status of a record adds `vrdb_relabel` with `{ sourceId }` (`enqueueRelabel`), under the job id `vrdb_relabel_<list>` and the options of a sync (`VRDB_RELABEL_JOB_OPTIONS`). BullMQ adds nothing while a job of that id waits or runs, so one waits per list and the changes of several syncs are taken by one job. It relabels the pending findings of every organization that cite a changed record (`relabelSource` in `vrdb/relabel.ts`, see [Vendors](../domains/vendors.md#vendor-risk-database)). A failure to add it is logged with the error's name and leaves the copy or the answer as it is: the next change adds the job again. A read-through answer starts the addition and does not wait for it (`relabelAfterAnswer` in `vrdb/lookup.ts`), so a Redis that stalls never holds the vendor's run past its time limit.

## Scheduled Jobs

### Job Schedule Summary

Recurring (cron) jobs only — see [On-Demand Jobs](#on-demand-jobs) below for jobs enqueued one-off in response to a user action.

| Job Name | Cron Pattern | Time | Purpose |
|----------|--------------|------|---------|
| `send_vendor_notification` | `0 0 * * *` | Daily at midnight | Vendor review date notifications |
| `send_report_notification` | `0 0 * * *` | Daily at midnight | Scheduled report generation |
| `pmm_hourly_check` | `0 * * * *` | Every hour | PMM cycle processing |
| `report_scheduler_tick` | `*/15 * * * *` | Every 15 minutes | Template-first scheduled report dispatch |
| `slack-notification-policy` | `0 9 * * *` | Daily at 9 AM | Slack policy due notifications |
| `vrdb_sync` (scheduler `vrdb_sync_kev`) | `23 * * * *` (UTC) | Every hour at minute 23 | Copy the CISA catalog of known exploited vulnerabilities (only with `VENDOR_RESEARCH_VRDB=true`) |
| `vrdb_sync` (scheduler `vrdb_sync_ofac`) | `41 */6 * * *` (UTC) | Every 6 hours at minute 41 | Copy the OFAC SDN list (same) |
| `vrdb_sync` (scheduler `vrdb_sync_uk_sanctions`) | `47 */6 * * *` (UTC) | Every 6 hours at minute 47 | Copy the UK Sanctions List (same) |
| `vrdb_sync` (scheduler `vrdb_sync_eu_fsf`) | `53 */6 * * *` (UTC) | Every 6 hours at minute 53 | Copy the EU consolidated list of financial sanctions (same) |
| `vrdb_sync` (scheduler `vrdb_sync_cve`) | `29 2 * * *` (UTC) | Daily at 02:29 | Read the CVE Program's changes of the days since the last sync (same, and only once the gate Q7 is open) |
| `vrdb_sync` (scheduler `vrdb_sync_un_sanctions`) | `59 */6 * * *` (UTC) | Every 6 hours at minute 59 | Copy the UN Security Council Consolidated List (same, and only once the gate Q6 is open) |

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

### Report Scheduler Tick

Powers the template-first reporting layer (see [Reporting Domain](../domains/reporting.md)). This repeatable job runs every 15 minutes and dispatches due scheduled reports.

```typescript
// Registered in Servers/jobs/producer.ts (addAllJobs)

await automationQueue.add(
  "report_scheduler_tick",
  { type: "report_scheduler_tick" },
  {
    repeat: { pattern: "*/15 * * * *" },  // Every 15 minutes
    removeOnComplete: true,
    removeOnFail: false,
  }
);
```

**Processing Logic:**
1. Finds due `scheduled_reports` where `next_run_at <= now`
2. Advances `next_run` (via `cron-parser`) **before** running, to avoid double-picking the same schedule on overlapping ticks
3. Enqueues / runs each due report through `reportRunOrchestrator`

Handled in `automationWorker.ts` alongside the other automation job types.

### On-Demand Jobs

Not every job is scheduled. Some are enqueued once, on demand, in direct response to a user action — no `repeat` pattern, no cron. The `Queue` column says which queue and so which worker carries the job out.

| Job Name | Queue | Enqueued By | Handler |
|----------|-------|-------------|---------|
| `generate_report_manual` | `automation-actions` | `generateReportsV2` / `generateReports` controller, when a user requests a manual report (see [Reporting Domain](../domains/reporting.md)) | `handleManualReportGeneration` → `executeManualRun` |
| `vendor_research` | `vendor-research` | `enqueueVendorResearch` (`services/vendorResearch/queue.ts`), called by `startVendorResearch` in `services/vendorResearch/trigger.ts` when a vendor is created or a user starts research (see [Vendors](../domains/vendors.md#vendor-research-agent)) | `handleVendorResearchJob` → `runVendorResearch`, in the [research worker](#vendor-research-worker) |

**Processing Logic:**
1. Controller creates a `report_runs` row (`status: "running"`) and enqueues `generate_report_manual` with `{ runId, request, userId, organizationId }`
2. Worker picks up the job and runs `executeManualRun`, which reuses the same `generateReport` service as scheduled runs
3. `report_runs` is updated to a terminal status (`success` or `failed`) on completion — `executeManualRun` never produces `partial_success` (that state applies only to scheduled runs with multiple delivery targets)

This job only runs while a worker process (`npm run worker`) is up — with no worker running, the run stays `status: "running"` indefinitely and the frontend poll never resolves.

**`vendor_research`:** researches one vendor for one run row that already exists as `queued` in `vendor_research_runs`. Payload: `{ organizationId, vendorId, runId }`.

- **Job id:** `vendor-research-{org}-{vendor}-{run}`, one per run and without a colon (BullMQ rejects a custom id with a colon unless it has exactly three parts). An id per vendor would make BullMQ silently ignore the `add` of a vendor's next run while the job of an earlier, swept run still sat in Redis; the partial unique index `vendor_research_runs_active_uniq` already allows one active run per vendor.
- **Options:** `attempts: 2`, exponential backoff with a 5000 ms delay, `removeOnComplete` and `removeOnFail` both `true`, so no retained job holds on to an id.
- **Retries:** the pipeline itself catches a failing model call and a web that cannot be reached at all (not one search or read of the run was answered: "The run stopped because the web could not be reached") and ends the run as `failed`. A search that fails or a page that cannot be read is a result inside the run, not a failure: the run goes on without it. So a retry only covers Redis and database failures that happen before the run is marked `running`, while it is still `queued`. A retry never pays for the model calls or the searches twice.
- **No worker:** the run stays `queued` until the 15-minute sweep fails it with `timed out`. The sweep runs when a new run is requested for the vendor and when its latest run is read, not in the background. A `queued` run older than the sweep limit stops counting toward the cooldown and the daily cap even before the sweep reaches it, because a job can be lost (for example when Redis is emptied) and nobody may open the vendor again. The backend's emptying of the `automation-actions` queue at start no longer reaches research jobs: they are on a queue of their own.
- **Redis down:** `Queue.add` does not fail, BullMQ keeps the command in the offline queue of its client. `startVendorResearch` therefore waits at most 5 seconds (`ENQUEUE_TIMEOUT_MS`) for the `add`, then fails the run as `could not enqueue` and answers 503. A job that lands after that finds the run `failed` and is skipped without a search or a model call.

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

        case "report_scheduler_tick":
          return await processReportSchedulerTick();

        case "generate_report_manual":  // one-shot, not scheduled — see On-Demand Jobs
          return await handleManualReportGeneration(job.data);

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

### Vendor Research Worker

```typescript
// File: Servers/services/vendorResearch/worker.ts

export const createVendorResearchWorker = (
  concurrency = getVendorResearchConfig().workerConcurrency,
  queueName = VENDOR_RESEARCH_QUEUE,
) => new Worker(queueName, async (job) => { /* name check, then handleVendorResearchJob(job.data) */ },
  { connection: { url: REDIS_URL }, concurrency });
```

It takes the jobs of `vendor-research` only, `VENDOR_RESEARCH_WORKER_CONCURRENCY` at a time for each worker process (5 unless set), and refuses a job with any name but `vendor_research`. A failure of the handler reaches BullMQ, which retries the job (`attempts: 2`); the pipeline itself ends a run that cannot be researched, so only Redis and database failures before the run is marked running come this far. It logs a completed job at debug level and a failed one as an error.

### Vendor Risk Database Worker

```typescript
// File: Servers/services/vendorResearch/vrdb/worker.ts

export const createVrdbWorker = (concurrency = 1, queueName = VRDB_QUEUE) =>
  new Worker(queueName, async (job) => processVrdbJob(job), { connection: { url: REDIS_URL }, concurrency });
```

It takes the jobs of `vendor-risk-database` one at a time (a list is tens of megabytes, and two syncs share no work). `processVrdbJob` refuses a job with any name but `vrdb_sync` and `vrdb_relabel` and one that names no list of the vendor risk database. A sync checks both flags and its list's gate again (an operator may turn either flag off after a scheduler fired) and runs `syncSource` (`vrdb/sync.ts`); one that changed the status of a record adds the status job of its list. The status job checks `VENDOR_RESEARCH_VRDB` and runs `relabelSource`, which throws for a failure of the database, so that BullMQ tries it again. A failed sync throws a fixed text with the list and the error code, never a message. One that failed on the way (`fetch_failed`, `unexpected`) throws `VrdbSyncFailed`, so BullMQ tries it again; one the list refused (`wrong_root`, `parse_errors`, `empty`, `shrank`, `too_large`, `feed_without_file`: a download a minute later gets the same file), or whose answer asked for a wait (`Retry-After`, which `syncSource` passes on as `retryAfterMs`), throws `VrdbSyncNotRetried`, a BullMQ `UnrecoverableError`, and the list's next scheduled sync asks again. Either way the sync has already stored the attempt in `vrdb_sync_runs` and left the copy as it was. It logs a completed job at debug level and a failed one as an error.

### Worker Initialization

```typescript
// File: Servers/jobs/worker.ts

import { createNotificationWorker } from "../services/slack/slackWorker";
import { createAutomationWorker } from "../services/automations/automationWorker";
import { createVendorResearchWorker } from "../services/vendorResearch/worker";
import { createVrdbWorker } from "../services/vendorResearch/vrdb/worker";

const notificationWorker = createNotificationWorker();
const automationWorker = createAutomationWorker();
const vendorResearchWorker = createVendorResearchWorker();
const vrdbWorker = createVrdbWorker(1);

const workers: Worker[] = [notificationWorker, automationWorker, vendorResearchWorker, vrdbWorker];

// Graceful shutdown
process.on("SIGINT", async () => {
  await Promise.all(workers.map((worker) => worker.close()));
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

26 triggers are seeded in `Servers/database/migrations/20260226234301-public-schema-tables.js`:

| Key pattern | Entities | Event name | Description |
|-------------|----------|------------|-------------|
| `<entity>_added` | vendor, model, project, task, risk, training, policy, incident | `<entity>.added` | New record created |
| `<entity>_updated` | same 8 entities | `<entity>.updated` | Record updated |
| `<entity>_deleted` | same 8 entities | `<entity>.deleted` | Record deleted |
| `vendor_review_date_approaching` | vendor | `vendor.review_date_approaching` | Review date within threshold |
| `scheduled_report` | — | `report.scheduled` | Scheduled report generation |

### Seeded Actions

One action is seeded and linked to every trigger: `send_email` (Send Email). Automations have no condition filters; an enabled automation runs its action on every event of its trigger type.

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
| `Servers/services/vendorResearch/queue.ts` | Vendor research queue and producer |
| `Servers/services/vendorResearch/worker.ts` | Vendor research queue worker |
| `Servers/services/vendorResearch/vrdb/queue.ts` | Vendor risk database queue and the schedulers of the syncs |
| `Servers/services/vendorResearch/vrdb/worker.ts` | Vendor risk database queue worker |
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
