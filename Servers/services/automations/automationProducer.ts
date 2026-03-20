import { Queue } from "bullmq";
import { REDIS_URL } from "../../database/redis"
import logger from "../../utils/logger/fileLogger";

// Create a new queue (connected to Redis using environment variable)
export const automationQueue = new Queue("automation-actions", {
  connection: { url: REDIS_URL }
});

export async function enqueueAutomationAction(
  actionKey: string, data: Object, options: Object = {}) {
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
