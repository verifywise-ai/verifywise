jest.setTimeout(30000);

/**
 * The job of a research run against a real BullMQ queue and a real Redis.
 *
 * The unit spec of the producer mocks `bullmq`, so it cannot tell whether BullMQ accepts the job id
 * and the options. BullMQ validates a custom job id when the job is added (it rejects an integer
 * and a colon unless there are exactly three parts), and silently ignores an `add` whose id still
 * exists. This test adds a job with the id and the options of the producer and reads it back.
 *
 * `./setup` is deliberately NOT imported: it replaces `bullmq` and the Redis client with mocks. The
 * job goes to a queue with a name of its own, not to "automation-actions", so that a worker of
 * that queue could never pick it up. Redis is the one that REDIS_URL names (the integration
 * wrapper points it at the throwaway instance).
 */
import { Queue } from "bullmq";
import redisClient, { REDIS_URL } from "../../database/redis";
import {
  VENDOR_RESEARCH_JOB,
  VENDOR_RESEARCH_JOB_OPTIONS,
  automationQueue,
  vendorResearchJobId,
} from "../../services/automations/automationProducer";

const queue = new Queue(`vendor-research-enqueue-test-${process.pid}-${Date.now()}`, {
  connection: { url: REDIS_URL },
});

beforeAll(async () => {
  // Without a Redis to talk to, this is the hook that times out.
  await queue.waitUntilReady();
}, 10000);

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  // Importing the producer opened these two as well.
  await automationQueue.close();
  await redisClient.quit();
});

describe("the vendor research job on a real queue", () => {
  it("is accepted with the id and the options of the producer and can be read back, one job for each run", async () => {
    // The run id is new on every execution: BullMQ would silently hand back a job that is left over
    // from an earlier, aborted execution, and the test would prove nothing.
    const firstRun = Date.now();
    const secondRun = firstRun + 1;
    const add = (runId: number) =>
      queue.add(
        VENDOR_RESEARCH_JOB,
        { organizationId: 1, vendorId: 2, runId },
        { jobId: vendorResearchJobId(1, 2, runId), ...VENDOR_RESEARCH_JOB_OPTIONS },
      );

    const first = await add(firstRun);
    expect(first.id).toBe(`vendor-research-1-2-${firstRun}`);

    const stored = await queue.getJob(vendorResearchJobId(1, 2, firstRun));
    expect(stored?.name).toBe("vendor_research");
    expect(stored?.data).toEqual({ organizationId: 1, vendorId: 2, runId: firstRun });
    expect(stored?.opts).toMatchObject({
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    });

    // A new run of the same vendor is a job of its own while the earlier job is still in the queue.
    const second = await add(secondRun);
    expect(second.id).toBe(`vendor-research-1-2-${secondRun}`);
    expect((await queue.getJob(vendorResearchJobId(1, 2, secondRun)))?.data.runId).toBe(secondRun);
    expect(await queue.getJobCounts("waiting")).toEqual({ waiting: 2 });

    await stored?.remove();
    await second.remove();
    expect(await queue.getJob(vendorResearchJobId(1, 2, firstRun))).toBeUndefined();
    expect(await queue.getJob(vendorResearchJobId(1, 2, secondRun))).toBeUndefined();
  });
});
