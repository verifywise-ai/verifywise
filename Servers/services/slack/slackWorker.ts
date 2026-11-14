import { Worker, Job } from "bullmq";
import { REDIS_URL } from "../../database/redis";
import logger from "../../utils/logger/fileLogger";

export const createNotificationWorker = () => {
  const worker = new Worker(
    "slack-notifications",
    async (job: Job) => {
      if (job.data.type === "policies") {
        // Retired (P-H3): the policy review reminder sweep sends these Slack
        // messages now. Kept so a job queued before the deploy completes
        // without sending anything.
        logger.info("Skipping retired Slack job slack-notification-policy");
        return { success: true, skipped: true };
      } else {
        throw new Error(`Unknown job type: ${job.data.type}`);
      }
    },
    { connection: { url: REDIS_URL } },
  );

  worker.on("completed", (_job) => {
    // const userId = job.returnvalue?.userId;
    // logSuccess({
    //   eventType: "Update",
    //   description: "Completed Job Processing",
    //   functionName: "createNotificationWorker",
    //   fileName: "slackWorker.ts",
    //   userId,
    // });
  });

  worker.on("failed", (_job, _err) => {
    // logFailure({
    //   eventType: "Update",
    //   description: "Processed Jobs",
    //   functionName: "createNotificationWorker",
    //   fileName: "slackWorker.ts",
    //   error: err,
    // });
  });

  return worker;
};
