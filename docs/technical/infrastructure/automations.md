# Automations & Job Scheduling

## Overview

VerifyWise uses BullMQ with Redis for background job processing and scheduled tasks. The system supports recurring jobs (cron-based), event-triggered automations, and user-configured workflows. Four queues handle different concerns: general automations, Slack notifications, vendor research runs and the load of the vendor risk database's bundled lists. MLflow sync is not queued; it runs on demand when a user clicks **Sync**.

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
  connection: { url: REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: COMPLETED_JOB_RETENTION,  // { age: 1 day, count: 1000 }
    removeOnFail: FAILED_JOB_RETENTION,         // { age: 7 days, count: 5000 }
  },
});
```

**Finished jobs.** BullMQ keeps a finished job until something removes it, and no code reads one back. A job that sets no `removeOnComplete`/`removeOnFail` of its own is kept for a day after it completes (at most 1000) and for a week after it fails (at most 5000). These are the automation emails from `enqueueAutomationAction`, `generate_report_manual` and `send_pmm_notification`, and they carry recipients and message bodies. `send_report_notification_daily` sets its own: it is removed as soon as it completes (`removeOnComplete: true`) and a failed one is kept a week, at most 5000 (`removeOnFail: FAILED_JOB_RETENTION`), like the others. Its enqueue passes a `runAt` time, which is no BullMQ option (BullMQ waits on `delay`), so the job runs as soon as it is queued, not at the hour and minute of the automation. Every scheduler of the automation queue and of the Slack queue (`slack-notification-policy`) removes a completed run at once and keeps a failed run for a week (`FAILED_JOB_RETENTION` in its template). The scheduler of the vendor research queue (`vendor_research_scan`) and the jobs of the vendor risk database (`vrdb_load`, `vrdb_relabel`) remove a failed run at once too (`removeOnFail: true`). The one-off jobs with a fixed id (`extension_sync_run`, the risk link jobs, `intake_assessment`) remove themselves as soon as they settle, because BullMQ ignores an add whose id is still in use. BullMQ applies `age` and `count` when another job of the same kind finishes, not on a timer.

### Slack Notifications Queue

**Queue Name:** `slack-notifications`

No longer receives scheduled jobs. It used to run the 9 AM `slack-notification-policy` job; policy review reminders now come from `policy_review_reminder_sweep`, which sends its Slack messages directly. The queue remains so startup can remove that retired scheduler and the worker can finish a job queued before the upgrade without sending.

```typescript
// File: Servers/services/slack/slackProducer.ts

export const notificationQueue = new Queue("slack-notifications", {
  connection: { url: REDIS_URL },
});
```

### Vendor Research Queue

**Queue Name:** `vendor-research`

Carries out the runs of the [vendor research agent](../domains/vendors.md#vendor-research-agent), one `vendor_research` job for each run. The queue also holds the job scheduler of the [scheduled scan](../domains/vendors.md#the-scheduled-scan), `vendor_research_scan`, which `scheduleVendorResearchScan` upserts at the start of the backend (`jobs/producer.ts`) and which, like the rest of the queue, is never obliterated.

```typescript
// File: Servers/services/vendorResearch/queue.ts

export const vendorResearchQueue = new Queue("vendor-research", {
  connection: { url: REDIS_URL }
});
```

A run has a queue and a worker of its own for two reasons. A run holds its place for minutes (up to about 7), while every other job on `automation-actions` is short, so on a shared queue a burst of runs kept the notifications, the recomputes and the reports waiting, and a long line of other jobs could leave a run queued past the 15 minutes after which it is not started. And the number of runs at once is a setting of research alone (`VENDOR_RESEARCH_WORKER_CONCURRENCY`). There used to be a third: the backend emptied the automation queue each time it started (`obliterate` in `scheduleVendorReviewDateNotification` and `scheduleReportNotification`), which lost the runs that were waiting. No start empties a queue any more (see [Startup Flow](#startup-flow)).

### Vendor Risk Database Queue

**Queue Name:** `vendor-risk-database`

Carries out the load of the bundled lists of the [vendor risk database](../domains/vendors.md#vendor-risk-database), one `vrdb_load` job at each start, and its status job, `vrdb_relabel`. A queue of its own, as the research has one, so that a load does not hold the places of the automations. The queue is never emptied (`obliterate`) at start.

```typescript
// File: Servers/services/vendorResearch/vrdb/queue.ts

export const VRDB_QUEUE = "vendor-risk-database";
export const vrdbQueue = new Queue(VRDB_QUEUE, { connection: { url: REDIS_URL } });
```

Nothing on this queue is recurring, and nothing downloads a list: each release ships the lists as bundles in `Servers/data/vrdb/` (see [Vendors](../domains/vendors.md#vendor-risk-database)). `scheduleVendorRiskDatabaseLoad`, called by `addAllJobs` at the start of the backend (`jobs/producer.ts`), first removes the per-list schedulers that builds before the bundles registered (`vrdb_sync_<list>`, `legacySyncSchedulerId`, for every list id), so that no upgraded deployment keeps downloading. Then, while `VENDOR_RESEARCH_RECORDS` is not `false` (`vrdbRecordsOn`; the database has no flag of its own), it queues one job `vrdb_load` (`VRDB_LOAD_JOB`, no data) under the deduplication id `vrdb_load`, so that while one load waits or runs, the load that another replica's start adds is dropped. A job has `attempts: 3`, an exponential back-off from one minute, and is removed when it completes or fails (`VRDB_JOB_OPTIONS`). The load (`loadBundledSources` in `vrdb/loadBundled.ts`) reads the bundle of each list the gates allow (`activeMirrors`: 32 lists, while the gates of the UN list, Q6, and of the AI Incident Database, Q29, are closed; the LEI records of GLEIF, the NVD and the SEC are read through at run time) and applies only the bundles whose hash differs from the last one loaded, so a restart writes nothing. A bundled list is out of date 60 days after its bundle was built (`BUNDLED_STALE_AFTER_HOURS`, through `staleAfterHoursOf` in `vrdb/sources.ts`); a list that was never loaded is out of date as well.

**The status job.** A load, or an answer of a read-through source (the NVD), that changed the status of a record adds `vrdb_relabel` with `{ sourceId }` (`enqueueRelabel`), and so does a completed research run, after its commit and without waiting, for each list whose records its saved findings cite (`relabelCitedLists` in `services/vendorResearch/pipeline.ts`; a failure to add it is logged), under the deduplication id `vrdb_relabel_<list>` with `keepLastIfActive` and the queue's job options (`VRDB_JOB_OPTIONS`). BullMQ drops an add while a job of that id waits, so one waits per list and the changes of several loads or answers are taken by one job; an add while the job runs is kept and queued when the run ends, so a change that lands during a run is not lost. It relabels the pending findings of every organization that cite a changed record (`relabelSource` in `vrdb/relabel.ts`, see [Vendors](../domains/vendors.md#vendor-risk-database)). A failure to add it is logged with the error's name and leaves the copy or the answer as it is: the next change adds the job again. A read-through answer starts the addition and does not wait for it (`relabelAfterAnswer` in `vrdb/lookup.ts`), so a Redis that stalls never holds the vendor's run past its time limit.

## Scheduled Jobs

### Job Schedule Summary

Recurring (cron) jobs only — see [On-Demand Jobs](#on-demand-jobs) below for jobs enqueued one-off in response to a user action.

| Job Name | Cron Pattern | Time | Purpose |
|----------|--------------|------|---------|
| `send_vendor_notification` | `0 0 * * *` | Daily at midnight | Vendor review date notifications |
| `send_report_notification` | `0 0 * * *` | Daily at midnight | Scheduled report generation |
| `pmm_hourly_check` | `0 * * * *` | Every hour | PMM cycle processing |
| `report_scheduler_tick` | `*/15 * * * *` | Every 15 minutes | Template-first scheduled report dispatch |
| `extension_sync_tick` | `*/5 * * * *` | Every 5 minutes | Sync engine: queues one `extension_sync_run` per org whose schedule is due (interval and failure backoff) for every extension with a sync provider (see [Extensions → Scheduled sync](./extensions.md#scheduled-sync)). Retires the old `jira_assets_scheduled_sync_check` scheduler, whose name the worker still accepts for one release |
| `policy_review_reminder_sweep` | `0 8 * * *` | Daily at 8 AM | Policy review reminders: once within 7 days of the review date, once overdue, to owner and reviewers (in-app, email, Slack). Replaced `send_policy_due_soon_notification` and `slack-notification-policy`, whose schedulers startup removes (see [Policies](../domains/policies.md)) |
| `approval_overdue_sweep` | `17 * * * *` | Every hour at minute 17 | Approval SLA escalation: the active step of each pending approval request whose `due_at` has passed is claimed once (`escalated_at`), and its escalation user is notified in-app and by email (`services/automations/actions/approvalOverdueSweep.ts`) |
| `data_retention_prune` | `30 3 * * *` | Daily at 03:30 | Prunes each organization's audit records older than its `audit_retention_months`: the audit ledger from its oldest end (with checkpoints), then each audit table, in batches. Organizations without a period are skipped. See [Data retention](../domains/data-retention.md) |
| `vendor_research_scan` (queue `vendor-research`) | `11 * * * *` (UTC) | Every hour at minute 11 | Scheduled vendor research: for each organization that chose a scan interval in Research settings, starts at most 5 due vendors while the runs of the last 24 hours are under half of the daily cap. See [Vendors → The scheduled scan](../domains/vendors.md#the-scheduled-scan) |

The vendor risk database has no recurring job. At every start the backend queues one `vrdb_load` job on `vendor-risk-database`, which loads the lists that the release ships as bundles, and removes the per-list `vrdb_sync_<list>` schedulers of builds before the bundles (see [Vendor Risk Database Queue](#vendor-risk-database-queue)).

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

export async function scheduleVendorReviewDateNotification() {
  await automationQueue.upsertJobScheduler(
    "send_vendor_notification",
    { pattern: "0 0 * * *", tz: "UTC" },  // Daily at midnight UTC
    {
      name: "send_vendor_notification",
      data: { type: "review_date" },
      opts: { removeOnComplete: true, removeOnFail: FAILED_JOB_RETENTION },
    }
  );
}
```

**Processing logic** (`Servers/services/automations/vendorReviewReminders.ts`):
1. For each organization, loads every action of every active `vendor_review_date_approaching` automation. An organization with none gets nothing: there is no reminder without an automation.
2. For each automation, finds the vendors whose review date falls on today plus its `daysBefore` (a whole number ≥ 0, else 0). Days are UTC calendar days, as on the Home queue.
3. A `Reviewed` vendor is dropped by the Home queue's rule (`VENDOR_REVIEW_OPEN_CONDITION` in `homeQueue/sources/vendorReviews.source.ts`): only once its review date has passed. A reminder date is never in the past, so the next cycle's reminder still goes out after a review is marked Reviewed.
4. Queues every action of the automation, in order, with the vendor's template values (`{{vendor.review_date}}` is the UTC day, or "Not set").
5. Sends the reviewer (or the assignee when no reviewer is set) one in-app notice per vendor per run, however many automations match.
6. A failing organization or automation is logged and skipped; the rest still run.

### Report Notifications

```typescript
export async function scheduleReportNotification() {
  await automationQueue.upsertJobScheduler(
    "send_report_notification",
    { pattern: "0 0 * * *" },
    {
      name: "send_report_notification",
      data: { type: "report_notification" },
      opts: { removeOnComplete: true, removeOnFail: FAILED_JOB_RETENTION },
    }
  );
}
```

**Processing Logic:**
1. Fetches active `scheduled_report` automations
2. Checks frequency (daily/weekly/monthly)
3. Generates reports using v2 reporting system
4. Uploads reports as files
5. Sends emails with attachments

### PMM Hourly Check

```typescript
export async function schedulePMMHourlyCheck() {
  await automationQueue.upsertJobScheduler(
    "pmm_hourly_check",
    { pattern: "0 * * * *" },  // Every hour
    {
      name: "pmm_hourly_check",
      data: { type: "pmm" },
      opts: { removeOnComplete: true, removeOnFail: FAILED_JOB_RETENTION },
    }
  );
}
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
// scheduleReportSchedulerTick, registered in Servers/jobs/producer.ts (addAllJobs)

await automationQueue.upsertJobScheduler(
  "report_scheduler_tick",
  { pattern: "*/15 * * * *" },  // Every 15 minutes
  {
    name: "report_scheduler_tick",
    data: { type: "reporting" },
    opts: { removeOnComplete: true, removeOnFail: FAILED_JOB_RETENTION },
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
| `extension_sync_run` | `automation-actions` | `startManualRun` (`POST /api/extensions/:key/runs` and Jira Assets' deprecated `POST /sync`) and the tick, via `enqueueExtensionSyncRun`; job id fixed per extension and org (`ext-sync-<key>-<orgId>`); `{ key, orgId, kind, triggeredBy, payload }`, one attempt, removed on complete and on fail. The old `jira_assets_sync_run` name is accepted for one release | `runExtensionSyncJob` (claims at pickup) → `runClaimed` |

**Processing Logic:**
1. Controller creates a `report_runs` row (`status: "running"`) and enqueues `generate_report_manual` with `{ runId, request, userId, organizationId }`
2. Worker picks up the job and runs `executeManualRun`, which reuses the same `generateReport` service as scheduled runs
3. `report_runs` is updated to a terminal status (`success` or `failed`) on completion — `executeManualRun` never produces `partial_success` (that state applies only to scheduled runs with multiple delivery targets)

This job only runs while a worker process (`npm run worker`) is up — with no worker running, the run stays `status: "running"` indefinitely and the frontend poll never resolves.

**`vendor_research`:** researches one vendor for one run row that already exists as `queued` in `vendor_research_runs`. Payload: `{ organizationId, vendorId, runId }`.

- **Job id:** `vendor-research-{org}-{vendor}-{run}`, one per run and without a colon (BullMQ rejects a custom id with a colon unless it has exactly three parts). An id per vendor would make BullMQ silently ignore the `add` of a vendor's next run while the job of an earlier, swept run still sat in Redis; the partial unique index `vendor_research_runs_active_uniq` already allows one active run per vendor.
- **Options:** `attempts: 2`, exponential backoff with a 5000 ms delay, `removeOnComplete` and `removeOnFail` both `true`, so no retained job holds on to an id.
- **Retries:** the pipeline itself catches a failing model call and a web that cannot be reached at all (not one search or read of the run was answered: "The run stopped because the web could not be reached") and ends the run as `failed`. A search that fails or a page that cannot be read is a result inside the run, not a failure: the run goes on without it. So a retry only covers Redis and database failures that happen before the run is marked `running`, while it is still `queued`. A retry never pays for the model calls or the searches twice.
- **No worker:** the run stays `queued` until the 15-minute sweep fails it with `timed out`. The sweep runs when a new run is requested for the vendor and when its latest run is read, not in the background. A `queued` run older than the sweep limit stops counting toward the cooldown and the daily cap even before the sweep reaches it, because a job can be lost (for example when Redis is emptied) and nobody may open the vendor again.
- **Redis down:** `Queue.add` does not fail, BullMQ keeps the command in the offline queue of its client. `startVendorResearch` therefore waits at most 5 seconds (`ENQUEUE_TIMEOUT_MS`) for the `add`, then fails the run as `could not enqueue` and answers 503. A job that lands after that finds the run `failed` and is skipped without a search or a model call.

`extension_sync_run` also needs a worker. Without one, the job just waits: nothing is claimed until a worker picks it up, so no run goes stale while queued. A second job for the same org is not queued while one waits. The panel's poll ends with "The sync is taking longer than expected" after 20 minutes. Queue calls made for an HTTP request time out after 5 seconds (503 "Background jobs are unavailable").

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
) => new Worker(queueName, async (job) => { /* name check, then handleVendorResearchJob(job.data) or runVendorResearchScan() */ },
  { connection: { url: REDIS_URL }, concurrency });
```

It takes the jobs of `vendor-research` only, `VENDOR_RESEARCH_WORKER_CONCURRENCY` at a time for each worker process (5 unless set). It takes `vendor_research` (one run) and `vendor_research_scan` (the scan, which only starts runs and finishes in moments) and refuses any other name. A failure of the handler of a run reaches BullMQ, which retries the job (`attempts: 2`); the pipeline itself ends a run that cannot be researched, so only Redis and database failures before the run is marked running come this far. The job of the scan has a single attempt and is not kept: a scan that fails is logged, and the scan of the next hour does its work. It logs a completed job at debug level and a failed one as an error.

### Vendor Risk Database Worker

```typescript
// File: Servers/services/vendorResearch/vrdb/worker.ts

export const createVrdbWorker = (concurrency = 1, queueName = VRDB_QUEUE) =>
  new Worker(queueName, async (job) => processVrdbJob(job), { connection: { url: REDIS_URL }, concurrency });
```

Each worker process takes the jobs of `vendor-risk-database` one at a time. The image runs a worker process in the backend container as well as in the worker container (`Servers/start.sh` starts `node dist/jobs/worker.js` beside the API; see [Vendors](../domains/vendors.md#two-worker-processes)), but the load is one job, deduplicated by its id, so the starts of several replicas give one load while it waits or runs. The worker sets no `lockDuration`, so the default of BullMQ holds: a lock of 30 seconds renewed every 15 seconds while the event loop is free, and a job that stalls is handed to a worker again (once). A load applied twice is safe: the apply of a list locks its row in `vrdb_sources` (`FOR UPDATE`), and a bundle already loaded is skipped by its hash. `processVrdbJob` refuses a job with any name but `vrdb_load` and `vrdb_relabel`, and a status job that names no list of the vendor risk database. The load checks the records switch again (an operator may turn the records off after the job was queued) and runs `loadBundledSources`; it downloads nothing. For each list whose load changed the status of a record it adds the status job of that list (a failure to add it is logged by the error's name). A list whose bundle is missing or unreadable is noted as failed and keeps its copy, and a database failure on one list does not stop the others. The status job needs no switch (it reads stored copies only) and runs `relabelSource`, which throws for a failure of the database, so that BullMQ tries it again. The worker logs a completed job at debug level and a failed one as an error, by the error's name.

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

Where this process runs: the image's command, `Servers/start.sh`, starts it in the background (`node dist/jobs/worker.js &`) before the API, so every backend container runs one, and the worker container of `docker-compose.yml`, `kubernetes/worker-deployment.yaml` and the Helm chart runs another (`command: ["node", "dist/jobs/worker.js"]`). The development backend's `npm run watch` starts one beside the API too. Every queue above is therefore taken by at least two processes, each with its own environment and network: a setting a worker reads (the vendor research variables, for example) has to be set on the backend and on the worker alike. Whether the backend container should stop starting a worker when a separate one is deployed is an open decision.

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

### Dispatch of risk and policy events

Risk and policy triggers run every action of every active automation, ordered by automation id and then action order, enqueued one after another after the save commits (`getEventAutomationActionsQuery`, `enqueueAutomationActions` in `Servers/utils/automation/automationActions.utils.ts`). Automations that existed before every-action dispatch keep their old behaviour until someone edits and saves them: only the event's first action runs (`automations.legacy_first_action_only`, set by migration `20261114200100-legacy-automation-first-action`; the dispatch keeps the single first legacy row by action order, then automation id). Saving the automation in the editor clears the flag; the active toggle does not. New automations run every action. Other triggers (AI Detection) use `getActiveAutomationActionsQuery` and always run every action.

### Seeded Triggers

26 triggers are seeded in `Servers/database/migrations/20260226234301-public-schema-tables.js`, and 3 AI Detection triggers in `20261112143741-ai-detection-notifications-and-triggers.js` (29 in all):

| Key pattern | Entities | Event name | Description |
|-------------|----------|------------|-------------|
| `<entity>_added` | vendor, model, project, task, risk, training, policy, incident | `<entity>.added` | New record created |
| `<entity>_updated` | same 8 entities | `<entity>.updated` | Record updated |
| `<entity>_deleted` | same 8 entities | `<entity>.deleted` | Record deleted |
| `vendor_review_date_approaching` | vendor | `vendor.review_date_approaching` | Review date within threshold |
| `scheduled_report` | — | `report.scheduled` | Scheduled report generation |
| `ai_detection_scan_completed` | AI Detection scan | `ai_detection.scan_completed` | Scan finished |
| `ai_detection_high_risk_finding` | AI Detection scan | `ai_detection.high_risk_finding` | Scan has high-risk findings (exposed secrets included) the previous scan of the repository did not have |
| `ai_detection_scan_failed` | AI Detection scan | `ai_detection.scan_failed` | Scan failed |

The AI Detection triggers are fired by `services/aiDetection/scanNotifications.ts`, which enqueues every active automation of the trigger (template variables are listed in [AI Detection](../domains/ai-detection.md#automations-triggers)).

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

Every backend start runs `addAllJobs`, on every replica, so it never empties a queue. The automation queue also holds the [on-demand jobs](#on-demand-jobs) (`extension_sync_run`, `generate_report_manual`, `send_email`, the risk link recomputes), which users or other replicas queued or are running. Each step runs on its own (`safeSchedule`): one that fails is logged and the rest still run.

- **Schedulers are upserted.** `upsertJobScheduler` is idempotent by scheduler id: another start leaves one next job per scheduler, and a changed pattern takes effect at the next start.
- **Retiring a scheduler.** Deleting a `schedule*` function leaves its scheduler in Redis. Remove it by id at startup, as `scheduleExtensionSyncTick` does with `removeJobScheduler("jira_assets_scheduled_sync_check")` and `scheduleFileExpirySweep` does with the v2.5.x id `evidence_expiry_sweep`.
- **BullMQ 5 leftovers.** Releases before v2.5 scheduled with `queue.add(name, data, { repeat })`, and BullMQ 6 keeps running such an entry beside the scheduler that replaced it. `addAllJobs` therefore first removes them from both queues with `removeLegacyRepeatableJobs` (`Servers/jobs/legacyRepeatableJobs.ts`): entries without an iteration count, or under BullMQ 5's md5 key. On a queue without such entries it removes nothing.
- **Never `obliterate` or `drain` these queues at startup.** Either deletes the on-demand jobs, and `obliterate({ force: true })` also deletes jobs a worker is running, whose worker then fails with "Missing key for job". Obliterate deletes the schedulers too.

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
  // Failed jobs stay in the failed set for a week (see Finished jobs)
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
  removeOnFail: { age: 7 * 24 * 3600 },  // Keep failed jobs a week for inspection
});
```

## Key Files

| File | Purpose |
|------|---------|
| `Servers/jobs/producer.ts` | Job scheduling entry point |
| `Servers/jobs/legacyRepeatableJobs.ts` | Removes BullMQ 5 repeatable jobs at startup |
| `Servers/jobs/worker.ts` | Worker initialization |
| `Servers/services/automations/automationProducer.ts` | Automation queue producer |
| `Servers/services/automations/automationWorker.ts` | Automation queue worker |
| `Servers/services/vendorResearch/queue.ts` | Vendor research queue and producer, and the scheduler of the hourly scan |
| `Servers/services/vendorResearch/worker.ts` | Vendor research queue worker |
| `Servers/services/vendorResearch/vrdb/queue.ts` | Vendor risk database queue, the `vrdb_load` job queued at start and the removal of the legacy per-list sync schedulers |
| `Servers/services/vendorResearch/vrdb/loadBundled.ts` | Load of the bundled lists (`Servers/data/vrdb/`) into the vendor risk database |
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
