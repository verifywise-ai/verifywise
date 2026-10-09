import { Queue } from "bullmq";
import { REDIS_URL } from "../../database/redis";
import logger from "../../utils/logger/fileLogger";

// Create a new queue (connected to Redis using environment variable)
export const automationQueue = new Queue("automation-actions", {
  connection: { url: REDIS_URL },
});

export async function enqueueAutomationAction(
  actionKey: string,
  data: object,
  options: object = {},
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
 * row for the other, so the score order does not fix the lock order. That cap
 * asymmetry is the mechanism on its own; `getRecomputeOwnedLinksQuery` having no
 * ORDER BY is a second, independent route, so adding one does not remove the
 * need for this retry. The backfill enqueues every risk in the org at once
 * against a worker running ten at a time, so none of this is exotic.
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

/**
 * The vendor risk counterpart of enqueueRiskLinkRecompute: rebuild the
 * `related_to` suggestions between one vendor risk and the others. Same jobId
 * collapsing, removal on settle and deadlock retry, for the same reasons.
 */
export async function enqueueVendorRiskLinkRecompute(organizationId: number, vendorRiskId: number) {
  return automationQueue.add(
    "vendor_risk_link_recompute",
    { organizationId, vendorRiskId },
    {
      jobId: `vendor-risk-link:${organizationId}:${vendorRiskId}`,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  );
}

/**
 * One job for many risks: the scan for related risks and other bulk rescoring.
 * The batch reads the org's scoring rows once instead of once per risk (see
 * recomputeRiskLinksBatch). `key` names the batch so a second identical
 * request while one is queued collapses into it, as the per-risk jobId does.
 * No retry of its own: a risk that fails is re-queued as a per-risk job, which
 * has one.
 */
export async function enqueueRiskLinkRecomputeBatch(
  organizationId: number,
  riskIds: number[],
  key: string,
) {
  return automationQueue.add(
    "risk_link_recompute_batch",
    { organizationId, riskIds },
    {
      jobId: `risk-link-batch:${organizationId}:${key}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

/** The vendor risk counterpart of enqueueRiskLinkRecomputeBatch. */
export async function enqueueVendorRiskLinkRecomputeBatch(
  organizationId: number,
  vendorRiskIds: number[],
  key: string,
) {
  return automationQueue.add(
    "vendor_risk_link_recompute_batch",
    { organizationId, vendorRiskIds },
    {
      jobId: `vendor-risk-link-batch:${organizationId}:${key}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

/**
 * One direction pass over one connected component.
 *
 * The jobId is derived from the component's smallest id, which is stable
 * because `connectedComponents` sorts. An admin double-clicking the button, or
 * two admins clicking it at once, therefore costs one LLM call rather than two.
 *
 * `attempts: 3` matches the recompute job, but the failure it covers is
 * different: the service swallows model errors and returns 0, so a retry here
 * only ever re-runs a job that failed on Redis or on a database error, never
 * one that failed on the model's answer.
 */
export async function enqueueRiskLinkDirection(organizationId: number, riskIds: number[]) {
  if (riskIds.length === 0) {
    throw new Error("enqueueRiskLinkDirection requires at least one risk id");
  }
  return automationQueue.add(
    "risk_link_direction",
    { organizationId, riskIds },
    {
      jobId: `risk-link-direction:${organizationId}:${Math.min(...riskIds)}`,
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

export async function scheduleFileExpirySweep() {
  logger.info("Adding file expiry sweep job to the queue...");
  // Daily at 4:30 AM (2/3/4 AM slots are taken by other jobs — kept distinct).
  // Notifies uploaders when files.expiry_date is within the 7-day pre-expiry
  // window (T-6..T-0). No state written back — the window itself is the dedup.
  // No obliterate here — the repeatable add is idempotent by repeat key.
  await automationQueue.upsertJobScheduler(
    "file_expiry_sweep",
    { pattern: "30 4 * * *" },
    {
      name: "file_expiry_sweep",
      data: { type: "file_expiry" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleEvidenceFreshnessSweep() {
  logger.info("Adding evidence freshness sweep job to the queue...");
  // Daily at 5 AM -- 3 AM is the MRM retention prune and 4 AM the revalidation
  // sweep, so this slot is free. No obliterate here -- the scheduler upsert is
  // idempotent by scheduler id.
  await automationQueue.upsertJobScheduler(
    "evidence_freshness_sweep",
    { pattern: "0 5 * * *" },
    {
      name: "evidence_freshness_sweep",
      data: {},
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleDeadlineEscalationSweep() {
  logger.info("Adding deadline escalation sweep job to the queue...");
  // Daily at 7 AM, after the 6 AM AI detection scan check and before the 8 AM
  // report notification; the workflow autopilot scans share the slot. No
  // obliterate here -- the scheduler upsert is idempotent by scheduler id.
  await automationQueue.upsertJobScheduler(
    "deadline_escalation_sweep",
    { pattern: "0 7 * * *" },
    {
      name: "deadline_escalation_sweep",
      data: {},
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleStaleInheritanceNotifySweep() {
  logger.info("Adding stale-inheritance notification sweep job to the queue...");
  // Daily at 5:30 AM -- between the 5 AM evidence sweep and the 6 AM AI
  // detection check. No obliterate: the scheduler upsert is idempotent by
  // scheduler id.
  await automationQueue.upsertJobScheduler(
    "stale_inheritance_notify_sweep",
    { pattern: "30 5 * * *" },
    {
      name: "stale_inheritance_notify_sweep",
      data: {},
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}

export async function scheduleApprovalOverdueSweep() {
  logger.info("Adding approval overdue sweep job to the queue...");
  // Hourly at minute 17 -- off the congested slots (top of hour: PMM check;
  // */5: AI detection scan; */15: report tick). Hourly matches the
  // wall-clock-hour granularity of approval step SLAs. No obliterate here --
  // the scheduler upsert is idempotent by scheduler id.
  await automationQueue.upsertJobScheduler(
    "approval_overdue_sweep",
    { pattern: "17 * * * *" },
    {
      name: "approval_overdue_sweep",
      data: {},
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
