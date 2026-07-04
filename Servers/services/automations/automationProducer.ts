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
  await automationQueue.add(
    "send_vendor_notification",
    { type: "review_date" },
    {
      repeat: {
        pattern: "0 0 * * *",
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function schedulePolicyDueSoonNotification() {
  logger.info("Adding Policy Due Soon Notification jobs to the queue...");
  // Policy Due Soon Notification every day at 8 AM
  await automationQueue.add(
    "send_policy_due_soon_notification",
    { type: "policy_due_soon" },
    {
      repeat: {
        pattern: "0 8 * * *",
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleReportNotification() {
  await automationQueue.obliterate({ force: true });
  logger.info("Adding Report Notification jobs to the queue...");
  // Report Notification Every day at 12 am
  await automationQueue.add(
    "send_report_notification",
    { type: "report_notification" },
    {
      repeat: {
        pattern: "0 0 * * *",
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function schedulePMMHourlyCheck() {
  logger.info("Adding PMM hourly check jobs to the queue...");
  // PMM hourly check - runs every hour at minute 0 to handle timezone-aware notifications
  await automationQueue.add(
    "pmm_hourly_check",
    { type: "pmm" },
    {
      repeat: {
        pattern: "0 * * * *", // Every hour at minute 0
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleShadowAiJobs() {
  logger.info("Adding Shadow AI scheduled jobs to the queue...");

  // Daily rollup: aggregate yesterday's raw events at 1:00 AM
  await automationQueue.add(
    "shadow_ai_daily_rollup",
    { type: "shadow_ai" },
    {
      repeat: { pattern: "0 1 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  // Monthly rollup: aggregate last month's daily rollups at 1:00 AM on 1st
  await automationQueue.add(
    "shadow_ai_monthly_rollup",
    { type: "shadow_ai" },
    {
      repeat: { pattern: "0 1 1 * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  // Nightly risk scoring: recalculate all tool risk scores at 1:30 AM
  await automationQueue.add(
    "shadow_ai_risk_scoring",
    { type: "shadow_ai" },
    {
      repeat: { pattern: "30 1 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  // Purge old events: delete events older than 30 days at 2:00 AM
  await automationQueue.add(
    "shadow_ai_purge_events",
    { type: "shadow_ai" },
    {
      repeat: { pattern: "0 2 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  // AI Gateway: monthly budget reset (runs at 00:05 on the 1st of each month)
  await automationQueue.add(
    "ai_gateway_budget_reset",
    { type: "ai_gateway" },
    {
      repeat: { pattern: "5 0 1 * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleAgentDiscoverySync() {
  logger.info("Adding Agent Discovery Sync jobs to the queue...");
  // Agent discovery sync every 6 hours
  await automationQueue.add(
    "agent_discovery_sync",
    { type: "agent_discovery" },
    {
      repeat: { pattern: "0 */6 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleAiDetectionScanCheck() {
  logger.info("Adding AI Detection scheduled scan check jobs to the queue...");
  // Check for due scheduled scans every 5 minutes
  await automationQueue.add(
    "ai_detection_scheduled_scan_check",
    { type: "ai_detection" },
    {
      repeat: { pattern: "*/5 * * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleAiGatewayRiskDetection() {
  logger.info("Adding AI Gateway risk detection jobs to the queue...");
  // Daily risk detection at 6 AM
  await automationQueue.add(
    "ai_gateway_risk_detection",
    { type: "ai_gateway_risk" },
    {
      repeat: { pattern: "0 6 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleAiGatewayCacheCleanup() {
  logger.info("Adding AI Gateway cache cleanup jobs to the queue...");
  // Daily cache cleanup at 3 AM — purge expired entries
  await automationQueue.add(
    "ai_gateway_cache_cleanup",
    { type: "ai_gateway_cache" },
    {
      repeat: { pattern: "0 3 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleMcpGatewayCleanup() {
  logger.info("Adding MCP Gateway cleanup jobs to the queue...");
  // Daily at 3 AM — purge expired audit logs and decided approval requests
  await automationQueue.add(
    "mcp_audit_cleanup",
    { type: "mcp_gateway" },
    {
      repeat: { pattern: "0 3 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleProactiveRiskAnomalyDetection() {
  logger.info("Adding Proactive Risk Anomaly Detection jobs to the queue...");
  // Detect spikes in high/critical risks every 6 hours
  await automationQueue.add(
    "proactive_risk_anomaly_detection",
    { type: "proactive" },
    {
      repeat: { pattern: "0 */6 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleMrmRevalidationSweep() {
  logger.info("Adding MRM revalidation sweep job to the queue...");
  // Daily at 4 AM — sweep open validations whose next_due has passed and fire the
  // scheduled revalidation trigger for each (dedup-safe; annotates already-open
  // tasks). No obliterate here — the repeatable add is idempotent by repeat key.
  await automationQueue.add(
    "mrm_revalidation_sweep",
    { type: "mrm_revalidation" },
    {
      repeat: { pattern: "0 4 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleProactiveComplianceScoreCheck() {
  logger.info("Adding Proactive Compliance Score Check jobs to the queue...");
  // Weekly compliance score drop check — Mondays at 1 AM
  await automationQueue.add(
    "proactive_compliance_score_check",
    { type: "proactive" },
    {
      repeat: { pattern: "0 1 * * 1" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleProactiveTaskOverdueCheck() {
  logger.info("Adding Proactive Task Overdue Check jobs to the queue...");
  // Overdue task escalation — daily at 9 AM
  await automationQueue.add(
    "proactive_task_overdue_check",
    { type: "proactive" },
    {
      repeat: { pattern: "0 9 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleProactiveWeeklyDigest() {
  logger.info("Adding Proactive Weekly Digest jobs to the queue...");
  // Weekly digest — Mondays at 9 AM
  await automationQueue.add(
    "proactive_weekly_digest",
    { type: "proactive" },
    {
      repeat: { pattern: "0 9 * * 1" },
      removeOnComplete: true,
      removeOnFail: false,
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
  await automationQueue.add(
    "report_scheduler_tick",
    { type: "reporting" },
    {
      repeat: { pattern: "*/15 * * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleWorkflowAutopilotJobs() {
  logger.info("Adding Autopilot workflow scheduled jobs to the queue...");

  // Policy renewal scan — daily at 7 AM
  await automationQueue.add(
    "workflow_policy_renewal",
    { type: "workflow" },
    {
      repeat: { pattern: "0 7 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  // Framework gap remediation scan — daily at 7 AM
  await automationQueue.add(
    "workflow_framework_gap",
    { type: "workflow" },
    {
      repeat: { pattern: "0 7 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  // Audit preparation scan — quarterly at 5 AM on the 1st of Jan/Apr/Jul/Oct
  await automationQueue.add(
    "workflow_audit_preparation",
    { type: "workflow" },
    {
      repeat: { pattern: "0 5 1 1,4,7,10 *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

export async function scheduleAiTrustIndexSync() {
  logger.info("Adding AI Trust Index weekly sync job to the queue...");
  // Monday 06:00 UTC. jobId keyed weekly is set at runtime is not needed here;
  // the handler self-guards via last_run_week. Repeatable add is idempotent by repeat key.
  await automationQueue.add(
    "ai_trust_index_sync",
    {},
    {
      repeat: { pattern: "0 6 * * 1", tz: "UTC" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}
