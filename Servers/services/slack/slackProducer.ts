import { Queue } from "bullmq";
import { REDIS_URL } from "../../database/redis";

// Create a new queue (connected to Redis using environment variable)
export const notificationQueue = new Queue("slack-notifications", {
  connection: { url: REDIS_URL },
});

/**
 * Remove the retired 9 AM policy Slack job (P-H3). The policy review reminder
 * sweep sends those Slack messages now. Job schedulers live in Redis, so
 * without this a deployment that ran the old code would keep firing it.
 */
export async function removeRetiredSlackPolicyScheduler() {
  await notificationQueue.removeJobScheduler("slack-notification-policy");
}
