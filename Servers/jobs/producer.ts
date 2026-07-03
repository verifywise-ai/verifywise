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
  scheduleMrmRevalidationSweep,
  scheduleAiTrustIndexSync,
} from "../services/automations/automationProducer";

export async function addAllJobs(): Promise<void> {
  await scheduleDailyNotification();
  await scheduleVendorReviewDateNotification();
  await schedulePolicyDueSoonNotification();
  await scheduleReportNotification();
  await schedulePMMHourlyCheck();
  await scheduleShadowAiJobs();
  await scheduleAgentDiscoverySync();
  await scheduleAiDetectionScanCheck();
  await scheduleAiGatewayRiskDetection();
  await scheduleAiGatewayCacheCleanup();
  await scheduleMcpGatewayCleanup();
  await scheduleMrmRevalidationSweep(); // non-obliterating — safe to run after the obliterating schedulers
  await scheduleAiTrustIndexSync();
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
