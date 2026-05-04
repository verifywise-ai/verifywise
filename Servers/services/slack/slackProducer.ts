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
  await notificationQueue.add(
    "slack-notification-policy",
    { type: "policies" },
    {
      repeat: {
        pattern: "0 9 * * *",
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}
