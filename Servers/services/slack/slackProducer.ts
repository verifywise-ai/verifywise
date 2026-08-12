import { Queue } from "bullmq";
import logger from "../../utils/logger/fileLogger";
import { REDIS_URL } from "../../database/redis";

// Create a new queue (connected to Redis using environment variable)
export const notificationQueue = new Queue("slack-notifications", {
  connection: { url: REDIS_URL },
});

export async function scheduleDailyNotification() {
  await notificationQueue.obliterate({ force: true });
  logger.info("Adding Slack notification jobs to the queue...");

  // Policy Due Soon Slack Notification Every day at 9 am
  await notificationQueue.upsertJobScheduler(
    "slack-notification-policy",
    {
      pattern: "0 9 * * *",
    },
    {
      name: "slack-notification-policy",
      data: { type: "policies" },
      opts: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  );
}
