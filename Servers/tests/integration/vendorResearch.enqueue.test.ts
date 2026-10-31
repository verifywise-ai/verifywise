jest.setTimeout(30000);

/**
 * The job of a research run, and the worker that carries it out, against a real BullMQ queue and a
 * real Redis.
 *
 * The unit tests of the producer and the worker mock `bullmq`, so they cannot tell whether BullMQ
 * accepts the job id and the options, or whether the worker gets the job the producer made.
 * BullMQ validates a custom job id when the job is added (it rejects an integer and a colon unless
 * there are exactly three parts), and silently ignores an `add` whose id still exists. The first
 * test adds a job with the id and the options of the producer and reads it back; the second lets
 * the worker of the research queue carry the job out.
 *
 * `./setup` is deliberately NOT imported: it replaces `bullmq` and the Redis client with mocks.
 * The job goes to a queue with a name of its own, not to "vendor-research" or "automation-actions",
 * so that the worker of a developer's backend could never pick it up. Redis is the one that
 * REDIS_URL names (the integration wrapper points it at the throwaway instance). The pipeline is
 * replaced by a function that notes what it was given: this is a test of the queue.
 */
jest.mock("../../services/vendorResearch/job", () => ({ handleVendorResearchJob: jest.fn() }));

import { Queue } from "bullmq";
import redisClient, { REDIS_URL } from "../../database/redis";
import { handleVendorResearchJob } from "../../services/vendorResearch/job";
import {
  VENDOR_RESEARCH_JOB,
  VENDOR_RESEARCH_JOB_OPTIONS,
  vendorResearchJobId,
  vendorResearchQueue,
} from "../../services/vendorResearch/queue";
import { createVendorResearchWorker } from "../../services/vendorResearch/worker";

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
  await vendorResearchQueue.close();
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

describe("the worker of the research queue on a real queue", () => {
  it("carries out the job that the producer makes, and the job is gone once it is done", async () => {
    const runId = Date.now() + 2;
    const data = { organizationId: 1, vendorId: 2, runId };
    const jobId = vendorResearchJobId(1, 2, runId);
    const handled = new Promise<unknown>((resolve) => {
      (handleVendorResearchJob as jest.Mock).mockImplementation(async (received) =>
        resolve(received),
      );
    });

    const worker = createVendorResearchWorker(1, queue.name);
    try {
      await worker.waitUntilReady();
      await queue.add(VENDOR_RESEARCH_JOB, data, { jobId, ...VENDOR_RESEARCH_JOB_OPTIONS });

      await expect(handled).resolves.toEqual(data);

      // removeOnComplete: a settled job must not keep its id, or BullMQ would ignore a new add.
      for (let waited = 0; waited < 3000 && (await queue.getJob(jobId)); waited += 50) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(await queue.getJob(jobId)).toBeUndefined();
    } finally {
      await worker.close();
    }
  });
});
