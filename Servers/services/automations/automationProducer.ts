import { Queue } from "bullmq";
import { REDIS_URL } from "../../database/redis";
import logger from "../../utils/logger/fileLogger";

// Create a new queue (connected to Redis using environment variable)
export const automationQueue = new Queue("automation-actions", {
  connection: { url: REDIS_URL },
});

export async function enqueueAutomationAction(
  actionKey: string,
  data: Object,
  options: Object = {},
) {
  return automationQueue.add(actionKey, data, options);
}

export async function scheduleVendorReviewDateNotification() {
  await automationQueue.obliterate({ force: true });
  logger.info("Adding Vendor Review Date Notification jobs to the queue...");
  // Vendor Review Date Notification Every day at 12 am
  await automationQueue.upsertJobScheduler(
    "send_vendor_notification",
    {
      pattern: "0 0 * * *",
    },
    {
      name: "send_vendor_notification",
      data: { type: "review_date" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function schedulePolicyDueSoonNotification() {
  logger.info("Adding Policy Due Soon Notification jobs to the queue...");
  // Policy Due Soon Notification every day at 8 AM
  await automationQueue.upsertJobScheduler(
    "send_policy_due_soon_notification",
    {
      pattern: "0 8 * * *",
    },
    {
      name: "send_policy_due_soon_notification",
      data: { type: "policy_due_soon" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleReportNotification() {
  await automationQueue.obliterate({ force: true });
  logger.info("Adding Report Notification jobs to the queue...");
  // Report Notification Every day at 12 am
  await automationQueue.upsertJobScheduler(
    "send_report_notification",
    {
      pattern: "0 0 * * *",
    },
    {
      name: "send_report_notification",
      data: { type: "report_notification" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function schedulePMMHourlyCheck() {
  logger.info("Adding PMM hourly check jobs to the queue...");
  // PMM hourly check - runs every hour at minute 0 to handle timezone-aware notifications
  await automationQueue.upsertJobScheduler(
    "pmm_hourly_check",
    {
      pattern: "0 * * * *", // Every hour at minute 0
    },
    {
      name: "pmm_hourly_check",
      data: { type: "pmm" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleShadowAiJobs() {
  logger.info("Adding Shadow AI scheduled jobs to the queue...");

  // Daily rollup: aggregate yesterday's raw events at 1:00 AM
  await automationQueue.upsertJobScheduler(
    "shadow_ai_daily_rollup",
    { pattern: "0 1 * * *" },
    {
      name: "shadow_ai_daily_rollup",
      data: { type: "shadow_ai" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );

  // Monthly rollup: aggregate last month's daily rollups at 1:00 AM on 1st
  await automationQueue.upsertJobScheduler(
    "shadow_ai_monthly_rollup",
    { pattern: "0 1 1 * *" },
    {
      name: "shadow_ai_monthly_rollup",
      data: { type: "shadow_ai" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );

  // Nightly risk scoring: recalculate all tool risk scores at 1:30 AM
  await automationQueue.upsertJobScheduler(
    "shadow_ai_risk_scoring",
    { pattern: "30 1 * * *" },
    {
      name: "shadow_ai_risk_scoring",
      data: { type: "shadow_ai" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );

  // Purge old events: delete events older than 30 days at 2:00 AM
  await automationQueue.upsertJobScheduler(
    "shadow_ai_purge_events",
    { pattern: "0 2 * * *" },
    {
      name: "shadow_ai_purge_events",
      data: { type: "shadow_ai" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );

  // AI Gateway: monthly budget reset (runs at 00:05 on the 1st of each month)
  await automationQueue.upsertJobScheduler(
    "ai_gateway_budget_reset",
    { pattern: "5 0 1 * *" },
    {
      name: "ai_gateway_budget_reset",
      data: { type: "ai_gateway" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleAgentDiscoverySync() {
  logger.info("Adding Agent Discovery Sync jobs to the queue...");
  // Agent discovery sync every 6 hours
  await automationQueue.upsertJobScheduler(
    "agent_discovery_sync",
    { pattern: "0 */6 * * *" },
    {
      name: "agent_discovery_sync",
      data: { type: "agent_discovery" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleAiDetectionScanCheck() {
  logger.info("Adding AI Detection scheduled scan check jobs to the queue...");
  // Check for due scheduled scans every 5 minutes
  await automationQueue.upsertJobScheduler(
    "ai_detection_scheduled_scan_check",
    { pattern: "*/5 * * * *" },
    {
      name: "ai_detection_scheduled_scan_check",
      data: { type: "ai_detection" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleAiGatewayRiskDetection() {
  logger.info("Adding AI Gateway risk detection jobs to the queue...");
  // Daily risk detection at 6 AM
  await automationQueue.upsertJobScheduler(
    "ai_gateway_risk_detection",
    { pattern: "0 6 * * *" },
    {
      name: "ai_gateway_risk_detection",
      data: { type: "ai_gateway_risk" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleAiGatewayCacheCleanup() {
  logger.info("Adding AI Gateway cache cleanup jobs to the queue...");
  // Daily cache cleanup at 3 AM — purge expired entries
  await automationQueue.upsertJobScheduler(
    "ai_gateway_cache_cleanup",
    { pattern: "0 3 * * *" },
    {
      name: "ai_gateway_cache_cleanup",
      data: { type: "ai_gateway_cache" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleMcpGatewayCleanup() {
  logger.info("Adding MCP Gateway cleanup jobs to the queue...");
  // Daily at 3 AM — purge expired audit logs and decided approval requests
  await automationQueue.upsertJobScheduler(
    "mcp_audit_cleanup",
    { pattern: "0 3 * * *" },
    {
      name: "mcp_audit_cleanup",
      data: { type: "mcp_gateway" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleProactiveRiskAnomalyDetection() {
  logger.info("Adding Proactive Risk Anomaly Detection jobs to the queue...");
  // Detect spikes in high/critical risks every 6 hours
  await automationQueue.upsertJobScheduler(
    "proactive_risk_anomaly_detection",
    { pattern: "0 */6 * * *" },
    {
      name: "proactive_risk_anomaly_detection",
      data: { type: "proactive" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleMrmRevalidationSweep() {
  logger.info("Adding MRM revalidation sweep job to the queue...");
  // Daily at 4 AM — sweep open validations whose next_due has passed and fire the
  // scheduled revalidation trigger for each (dedup-safe; annotates already-open
  // tasks). No obliterate here — the repeatable add is idempotent by repeat key.
  await automationQueue.upsertJobScheduler(
    "mrm_revalidation_sweep",
    { pattern: "0 4 * * *" },
    {
      name: "mrm_revalidation_sweep",
      data: { type: "mrm_revalidation" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleProactiveComplianceScoreCheck() {
  logger.info("Adding Proactive Compliance Score Check jobs to the queue...");
  // Weekly compliance score drop check — Mondays at 1 AM
  await automationQueue.upsertJobScheduler(
    "proactive_compliance_score_check",
    { pattern: "0 1 * * 1" },
    {
      name: "proactive_compliance_score_check",
      data: { type: "proactive" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleProactiveTaskOverdueCheck() {
  logger.info("Adding Proactive Task Overdue Check jobs to the queue...");
  // Overdue task escalation — daily at 9 AM
  await automationQueue.upsertJobScheduler(
    "proactive_task_overdue_check",
    { pattern: "0 9 * * *" },
    {
      name: "proactive_task_overdue_check",
      data: { type: "proactive" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleProactiveWeeklyDigest() {
  logger.info("Adding Proactive Weekly Digest jobs to the queue...");
  // Weekly digest — Mondays at 9 AM
  await automationQueue.upsertJobScheduler(
    "proactive_weekly_digest",
    { pattern: "0 9 * * 1" },
    {
      name: "proactive_weekly_digest",
      data: { type: "proactive" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

/**
 * Phase 6 / issue 3813 — schedule the time-based autopilot workflow triggers.
 *  - policy_renewal: daily, fans out per policy due within 30 days
 *  - framework_gap_remediation: daily, one run per org (workflow self-skips)
 *  - audit_preparation: quarterly, one run per org
 */
export async function scheduleReportSchedulerTick() {
  logger.info("Adding Report Scheduler tick jobs to the queue...");
  // Enterprise reporting: find due scheduled reports and run them every 15 minutes
  await automationQueue.upsertJobScheduler(
    "report_scheduler_tick",
    { pattern: "*/15 * * * *" },
    {
      name: "report_scheduler_tick",
      data: { type: "reporting" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleWorkflowAutopilotJobs() {
  logger.info("Adding Autopilot workflow scheduled jobs to the queue...");

  // Policy renewal scan — daily at 7 AM
  await automationQueue.upsertJobScheduler(
    "workflow_policy_renewal",
    { pattern: "0 7 * * *" },
    {
      name: "workflow_policy_renewal",
      data: { type: "workflow" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );

  // Framework gap remediation scan — daily at 7 AM
  await automationQueue.upsertJobScheduler(
    "workflow_framework_gap",
    { pattern: "0 7 * * *" },
    {
      name: "workflow_framework_gap",
      data: { type: "workflow" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );

  // Audit preparation scan — quarterly at 5 AM on the 1st of Jan/Apr/Jul/Oct
  await automationQueue.upsertJobScheduler(
    "workflow_audit_preparation",
    { pattern: "0 5 1 1,4,7,10 *" },
    {
      name: "workflow_audit_preparation",
      data: { type: "workflow" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleMrmRetentionPrune() {
  logger.info("Adding MRM metric retention prune job to the queue...");
  // Daily at 3 AM (the revalidation sweep runs at 4 AM — kept distinct). Prunes
  // benign aged-out mrm_metrics points per org; warn/breach history is never
  // deleted. No obliterate here — the repeatable add is idempotent by repeat key.
  await automationQueue.upsertJobScheduler(
    "mrm_retention_prune",
    { pattern: "0 3 * * *" },
    {
      name: "mrm_retention_prune",
      data: { type: "mrm_retention" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleAiTrustIndexSync() {
  logger.info("Adding AI Trust Index weekly sync job to the queue...");
  // Monday 06:00 UTC. jobId keyed weekly is set at runtime is not needed here;
  // the handler self-guards via last_run_week. Repeatable add is idempotent by repeat key.
  await automationQueue.upsertJobScheduler(
    "ai_trust_index_sync",
    { pattern: "0 6 * * 1", tz: "UTC" },
    {
      name: "ai_trust_index_sync",
      data: {},
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}
