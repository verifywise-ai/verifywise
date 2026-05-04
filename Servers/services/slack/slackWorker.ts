import { Worker, Job } from "bullmq";
import { REDIS_URL } from "../../database/redis";

import { sendPolicyDueSoonNotification } from "./policyDueSoonNotification";

export const createNotificationWorker = () => {
  const worker = new Worker(
    "slack-notifications",
    async (job: Job) => {
      if (job.data.type === "policies") {
        const userId = await sendPolicyDueSoonNotification();
        return { success: true, sentAt: new Date().toISOString(), userId };
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
