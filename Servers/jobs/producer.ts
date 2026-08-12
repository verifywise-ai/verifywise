export * from "../services/slack/slackProducer";

import { scheduleDailyNotification } from "../services/slack/slackProducer";
import logger from "../utils/logger/fileLogger";
import {
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
  scheduleAiTrustIndexSync,
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
  // bullmq v6 is stricter about obliterate/scheduler state and may throw in
  // constrained CI environments. Schedule each job independently so one failing
  // scheduler cannot take down the whole server startup sequence.
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
  await safeSchedule("mrm-revalidation-sweep", scheduleMrmRevalidationSweep); // non-obliterating — safe to run after the obliterating schedulers
  await safeSchedule("mrm-retention-prune", scheduleMrmRetentionPrune); // non-obliterating — safe to run after the obliterating schedulers
  await safeSchedule("ai-trust-index-sync", scheduleAiTrustIndexSync);
  // Ordering constraint: obliterate-using schedulers (e.g. vendor-review,
  // report-notification) must run BEFORE all non-obliterating ones, or they wipe
  // jobs the non-obliterating schedulers already added. scheduleMrmRevalidationSweep
  // is non-obliterating, so its placement here (after the obliterating ones) is fine.
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
