export * from "../services/slack/slackProducer";

import { notificationQueue, scheduleDailyNotification } from "../services/slack/slackProducer";
import { scheduleVendorResearchScan } from "../services/vendorResearch/queue";
import { scheduleVendorRiskDatabaseSync } from "../services/vendorResearch/vrdb/queue";
import logger from "../utils/logger/fileLogger";
import { removeLegacyRepeatableJobs } from "./legacyRepeatableJobs";
import {
  automationQueue,
  scheduleReportNotification,
  scheduleVendorReviewDateNotification,
  schedulePMMHourlyCheck,
  scheduleShadowAiJobs,
  schedulePolicyDueSoonNotification,
  scheduleAgentDiscoverySync,
  scheduleAiDetectionScanCheck,
  scheduleAiGatewayRiskDetection,
  scheduleAiGatewayCacheCleanup,
  scheduleMcpGatewayCleanup,
  scheduleProactiveRiskAnomalyDetection,
  scheduleProactiveComplianceScoreCheck,
  scheduleProactiveTaskOverdueCheck,
  scheduleProactiveWeeklyDigest,
  scheduleWorkflowAutopilotJobs,
  scheduleReportSchedulerTick,
  scheduleMrmRevalidationSweep,
  scheduleMrmRetentionPrune,
  scheduleDataRetentionPrune,
  scheduleFileExpirySweep,
  scheduleIntakeConfirmationSweep,
  scheduleLifecycleConfirmationSweep,
  scheduleAiTrustIndexSync,
  scheduleEvidenceFreshnessSweep,
  scheduleDeadlineEscalationSweep,
  scheduleStaleInheritanceNotifySweep,
  scheduleExtensionSyncTick,
  scheduleApprovalOverdueSweep,
} from "../services/automations/automationProducer";

async function safeSchedule(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    logger.error(`Failed to schedule ${name}:`, error);
    // Do not rethrow: scheduler setup must never prevent the HTTP server from
    // starting or handling requests.
  }
}

export async function addAllJobs(): Promise<void> {
  // bullmq v6 is stricter about scheduler state and may throw in constrained CI
  // environments. Schedule each job independently so one failing scheduler
  // cannot take down the whole server startup sequence.
  //
  // Every start of every backend replica runs this, so nothing here empties a
  // queue: the automation queue also holds one-off jobs (extension sync runs,
  // manual reports, emails, risk link recomputes) that users or other replicas
  // queued or are running. Upserting a scheduler by id is idempotent. A
  // scheduler taken out of the code stays in Redis until it is removed by id, as
  // scheduleExtensionSyncTick does for the old Jira check.
  await safeSchedule("automation-legacy-repeatables", () =>
    removeLegacyRepeatableJobs(automationQueue),
  );
  await safeSchedule("slack-legacy-repeatables", () =>
    removeLegacyRepeatableJobs(notificationQueue),
  );
  await safeSchedule("daily-notification", scheduleDailyNotification);
  await safeSchedule("vendor-review-date-notification", scheduleVendorReviewDateNotification);
  await safeSchedule("policy-due-soon-notification", schedulePolicyDueSoonNotification);
  await safeSchedule("report-notification", scheduleReportNotification);
  await safeSchedule("pmm-hourly-check", schedulePMMHourlyCheck);
  await safeSchedule("shadow-ai-jobs", scheduleShadowAiJobs);
  await safeSchedule("agent-discovery-sync", scheduleAgentDiscoverySync);
  await safeSchedule("ai-detection-scan-check", scheduleAiDetectionScanCheck);
  await safeSchedule("ai-gateway-risk-detection", scheduleAiGatewayRiskDetection);
  await safeSchedule("ai-gateway-cache-cleanup", scheduleAiGatewayCacheCleanup);
  await safeSchedule("mcp-gateway-cleanup", scheduleMcpGatewayCleanup);
  await safeSchedule("proactive-risk-anomaly-detection", scheduleProactiveRiskAnomalyDetection);
  await safeSchedule("proactive-compliance-score-check", scheduleProactiveComplianceScoreCheck);
  await safeSchedule("proactive-task-overdue-check", scheduleProactiveTaskOverdueCheck);
  await safeSchedule("proactive-weekly-digest", scheduleProactiveWeeklyDigest);
  await safeSchedule("workflow-autopilot-jobs", scheduleWorkflowAutopilotJobs);
  await safeSchedule("report-scheduler-tick", scheduleReportSchedulerTick);
  await safeSchedule("mrm-revalidation-sweep", scheduleMrmRevalidationSweep);
  await safeSchedule("mrm-retention-prune", scheduleMrmRetentionPrune);
  await safeSchedule("data-retention-prune", scheduleDataRetentionPrune);
  await safeSchedule("file-expiry-sweep", scheduleFileExpirySweep);
  await safeSchedule("intake-confirmation-sweep", scheduleIntakeConfirmationSweep);
  await safeSchedule("lifecycle-confirmation-sweep", scheduleLifecycleConfirmationSweep);
  await safeSchedule("evidence-freshness-sweep", scheduleEvidenceFreshnessSweep);
  await safeSchedule("deadline-escalation-sweep", scheduleDeadlineEscalationSweep);
  await safeSchedule("stale-inheritance-notify-sweep", scheduleStaleInheritanceNotifySweep);
  await safeSchedule("approval-overdue-sweep", scheduleApprovalOverdueSweep);
  await safeSchedule("vendor-research-scan", scheduleVendorResearchScan);
  await safeSchedule("vendor-risk-database-sync", scheduleVendorRiskDatabaseSync); // removes its schedulers while VENDOR_RESEARCH_RECORDS is false
  await safeSchedule("ai-trust-index-sync", scheduleAiTrustIndexSync);
  await safeSchedule("extension-sync-tick", scheduleExtensionSyncTick);
}

if (require.main === module) {
  addAllJobs()
    .then(() => {
      logger.info("Added All Jobs successfully!!");
      process.exit();
    })
    .catch((_error) => {
      // logFailure({
      //   eventType: "Update",
      //   description: "Added Jobs to the Queue",
      //   functionName: "addAllJobs",
      //   fileName: "producer.ts",
      //   error: error,
      // });
      process.exit(1);
    });
}
