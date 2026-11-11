import type { Queue } from "bullmq";
import logger from "../utils/logger/fileLogger";

/**
 * BullMQ 5's `Queue.add(name, data, { repeat })` stored a repeatable job under
 * the md5 hex digest of `name:jobId:endDate:tz:pattern`.
 */
const BULLMQ5_REPEAT_KEY = /^[0-9a-f]{32}$/;

/**
 * Removes the repeatable jobs BullMQ 5 left in `queue`, each with its next
 * queued run.
 *
 * Releases before v2.5 scheduled with `Queue.add(name, data, { repeat })`. The
 * job schedulers that replaced those calls share the queue's repeat set, and
 * BullMQ 6 keeps running a BullMQ 5 entry beside its replacement, so an install
 * upgraded from such a release would run those jobs twice.
 *
 * An entry is BullMQ 5's when it has no iteration count, which every job
 * scheduler has, or when its key is BullMQ 5's md5 digest: a BullMQ 6 worker
 * gives the entry an iteration count once it runs its job. Scheduler ids here
 * are job names, so neither test matches them. A queue without such entries
 * loses nothing, so every start can run this.
 */
export async function removeLegacyRepeatableJobs(
  queue: Pick<Queue, "name" | "getJobSchedulers" | "removeJobScheduler">,
): Promise<void> {
  const legacy = (await queue.getJobSchedulers()).filter(
    (entry) => entry.iterationCount === undefined || BULLMQ5_REPEAT_KEY.test(entry.key),
  );
  for (const entry of legacy) {
    await queue.removeJobScheduler(entry.key);
  }
  if (legacy.length > 0) {
    logger.info(`Removed ${legacy.length} BullMQ 5 repeatable job(s) from the ${queue.name} queue`);
  }
}
