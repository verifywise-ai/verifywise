export * from "../services/slack/slackProducer";

import { scheduleDailyNotification } from "../services/slack/slackProducer";
import logger from "../utils/logger/fileLogger";
import { scheduleReportNotification, scheduleVendorReviewDateNotification, schedulePMMHourlyCheck, scheduleShadowAiJobs, schedulePolicyDueSoonNotification, scheduleAgentDiscoverySync, scheduleAiDetectionScanCheck, scheduleAiGatewayRiskDetection, scheduleAiGatewayCacheCleanup } from "../services/automations/automationProducer";

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
