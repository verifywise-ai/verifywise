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

/**
 * Recompute one risk's stored link edges in the background.
 *
 * `jobId` collapses a burst of saves for the same risk into one run. That only
 * works because the job is removed as soon as it settles: BullMQ silently
 * ignores an `add` whose jobId still exists, so a *retained* completed or
 * failed job would suppress every later recompute for that risk forever.
 * Known limitation: a save landing while the job is already active is dropped;
 * the next save or POST /riskLinks/recompute picks it up.
 *
 * Retries because the recompute can lose a deadlock. Two runs share at most the
 * one edge between them, but a triangle of three risks recomputing at once can
 * cycle: the cap makes an edge a keeper for one endpoint and a plain incident
 * row for the other, so the score order does not fix the lock order. The
 * backfill enqueues every risk in the org at once, so this is not exotic.
 * Postgres aborts one side with 40P01, and without a retry that risk would
 * silently keep no links until its next save.
 */
export async function enqueueRiskLinkRecompute(organizationId: number, riskId: number) {
  return automationQueue.add(
    "risk_link_recompute",
    { organizationId, riskId },
    {
      jobId: `risk-link:${organizationId}:${riskId}`,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  );
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

export async function scheduleMrmRetentionPrune() {
  logger.info("Adding MRM metric retention prune job to the queue...");
  // Daily at 3 AM (the revalidation sweep runs at 4 AM — kept distinct). Prunes
  // benign aged-out mrm_metrics points per org; warn/breach history is never
  // deleted. No obliterate here — the repeatable add is idempotent by repeat key.
  await automationQueue.add(
    "mrm_retention_prune",
    { type: "mrm_retention" },
    {
      repeat: { pattern: "0 3 * * *" },
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
