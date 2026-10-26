const add = jest.fn();
const getJob = jest.fn();
const queues: any[] = [];
const workers: any[] = [];
jest.mock("bullmq", () => {
  class Queue {
    add = add;
    getJob = getJob;
    constructor(
      public name: string,
      public opts: unknown,
    ) {
      queues.push(this);
    }
  }
  class Worker {
    handlers: Record<string, (...a: any[]) => unknown> = {};
    constructor(
      public name: string,
      public processor: (...a: any[]) => unknown,
      public opts: unknown,
    ) {
      workers.push(this);
    }
    on(event: string, fn: (...a: any[]) => unknown) {
      this.handlers[event] = fn;
      return this;
    }
  }
  class DelayedError extends Error {}
  class UnrecoverableError extends Error {}
  return { Queue, Worker, DelayedError, UnrecoverableError };
});
jest.mock("../../../database/redis", () => ({ REDIS_URL: "redis://test:6379/0" }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
const utils = { updateCorpusStatusQuery: jest.fn() };
jest.mock("../../../utils/biasAudit.utils", () => utils);
jest.mock("./generateCorpus", () => {
  class CorpusBusyError extends Error {
    constructor(
      corpusId: number,
      readonly leaseExpiresAt: Date | null,
    ) {
      super(`Corpus ${corpusId} is busy.`);
    }
  }
  class LeaseLostError extends Error {}
  class CorpusModelChangedError extends Error {}
  return {
    runCorpusGeneration: jest.fn(),
    CorpusBusyError,
    LeaseLostError,
    CorpusModelChangedError,
    LEASE_SECONDS: 120,
  };
});

import { DelayedError, UnrecoverableError } from "bullmq";
import {
  ConflictException,
  NotFoundException,
} from "../../../domain.layer/exceptions/custom.exception";
import * as generateCorpus from "./generateCorpus";
import {
  corporaWithoutPendingJob,
  CORPUS_QUEUE,
  QUEUE_LOOKUP_TIMEOUT_MS,
  QUEUE_RETRY_AFTER_MS,
  createCorpusGenerationWorker,
  enqueueCorpusGeneration,
  onCorpusJobFailed,
  processCorpusJob,
} from "./generationJob";

const run = generateCorpus.runCorpusGeneration as unknown as jest.Mock;
const { CorpusBusyError, LeaseLostError } = generateCorpus;

const fakeJob = (over: Record<string, unknown> = {}) =>
  ({
    data: { corpusId: 3, organizationId: 1 },
    attemptsMade: 1,
    opts: { attempts: 3 },
    moveToDelayed: jest.fn(),
    ...over,
  }) as any;

beforeEach(() => {
  run.mockReset();
  add.mockReset();
  getJob.mockReset();
  utils.updateCorpusStatusQuery.mockReset().mockResolvedValue(true);
});

describe("processCorpusJob", () => {
  it("runs generation for the job's corpus and organization", async () => {
    run.mockResolvedValue({ status: "complete", recordCount: 700, modelsObserved: {} });
    const out = await processCorpusJob(fakeJob(), "tok");
    expect(run).toHaveBeenCalledWith({ corpusId: 3, organizationId: 1 });
    expect(out).toEqual({ status: "complete", recordCount: 700 });
  });

  it("delays a busy corpus until its lease expires, without spending an attempt", async () => {
    const expires = new Date("2026-10-18T12:00:00Z");
    run.mockRejectedValue(new CorpusBusyError(3, expires));
    const job = fakeJob();
    await expect(processCorpusJob(job, "tok")).rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalledWith(expires.getTime() + 1000, "tok");
  });

  it("delays a busy corpus with no recorded expiry by one lease length", async () => {
    const now = 1_760_000_000_000;
    const spy = jest.spyOn(Date, "now").mockReturnValue(now);
    try {
      run.mockRejectedValue(new CorpusBusyError(3, null));
      const job = fakeJob();
      await expect(processCorpusJob(job, "tok")).rejects.toBeInstanceOf(DelayedError);
      expect(job.moveToDelayed).toHaveBeenCalledWith(now + 120 * 1000 + 1000, "tok");
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    ["not running", new ConflictException("Corpus 3 is not running (failed).", "Corpus")],
    ["missing", new NotFoundException("Corpus 3 was not found", "Corpus", 3)],
  ])("does not retry a corpus that is %s", async (_label, error) => {
    run.mockRejectedValue(error);
    const err = await processCorpusJob(fakeJob(), "tok").catch((e) => e);
    expect(err).toBeInstanceOf(UnrecoverableError);
    expect(err.message).toBe(error.message);
  });

  it("rethrows any other error so BullMQ retries from the log", async () => {
    const error = new Error("gateway 503");
    run.mockRejectedValue(error);
    await expect(processCorpusJob(fakeJob(), "tok")).rejects.toBe(error);
  });
});

describe("onCorpusJobFailed", () => {
  it("does nothing before the last attempt, since the retry resumes from the log", async () => {
    await onCorpusJobFailed(fakeJob({ attemptsMade: 2 }), new Error("x"));
    expect(utils.updateCorpusStatusQuery).not.toHaveBeenCalled();
  });

  it("marks the corpus failed with a failure code after the last attempt", async () => {
    await onCorpusJobFailed(fakeJob({ attemptsMade: 3 }), new Error("gateway 503"));
    expect(utils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      { corpusId: 3, status: "failed", failureCode: "generation_error" },
      1,
    );
  });

  it("uses a typed error's own code as the failure code", async () => {
    const error = Object.assign(new Error("not configured"), { code: "gateway_not_configured" });
    await onCorpusJobFailed(fakeJob({ attemptsMade: 3 }), error);
    expect(utils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      { corpusId: 3, status: "failed", failureCode: "gateway_not_configured" },
      1,
    );
  });

  it("leaves a corpus another runner holds alone", async () => {
    await onCorpusJobFailed(fakeJob({ attemptsMade: 3 }), new LeaseLostError(3));
    expect(utils.updateCorpusStatusQuery).not.toHaveBeenCalled();
  });

  it("tolerates a missing job and a failing status write", async () => {
    await expect(onCorpusJobFailed(undefined, new Error("x"))).resolves.toBeUndefined();
    utils.updateCorpusStatusQuery.mockRejectedValue(new Error("db down"));
    await expect(
      onCorpusJobFailed(fakeJob({ attemptsMade: 3 }), new Error("x")),
    ).resolves.toBeUndefined();
  });
});

describe("enqueueCorpusGeneration", () => {
  it("adds one job per corpus, retried three times with exponential backoff", async () => {
    await enqueueCorpusGeneration(3, 42);
    expect(queues).toHaveLength(1);
    expect(queues[0].name).toBe(CORPUS_QUEUE);
    expect(queues[0].opts).toEqual({ connection: { url: "redis://test:6379/0" } });
    expect(add).toHaveBeenCalledWith(
      "generate",
      { corpusId: 3, organizationId: 42 },
      expect.objectContaining({
        jobId: "corpus-3",
        attempts: 3,
        backoff: expect.objectContaining({ type: "exponential" }),
      }),
    );
    // One queue, reused.
    await enqueueCorpusGeneration(4, 42);
    expect(queues).toHaveLength(1);
  });

  it("removes finished jobs, so a resumed corpus can be queued again under its id", async () => {
    await enqueueCorpusGeneration(3, 42);
    expect(add.mock.calls[0][2]).toMatchObject({ removeOnComplete: true, removeOnFail: true });
  });
});

describe("createCorpusGenerationWorker", () => {
  it("runs one corpus at a time on the corpus queue and marks a last failure", async () => {
    const worker = createCorpusGenerationWorker() as any;
    expect(CORPUS_QUEUE).toBe("bias-audit-corpus-generation");
    expect(worker.name).toBe(CORPUS_QUEUE);
    expect(worker.opts).toEqual({
      connection: { url: "redis://test:6379/0" },
      concurrency: 1,
      lockDuration: 10 * 60_000,
    });
    expect(worker.handlers.failed).toBe(onCorpusJobFailed);

    run.mockResolvedValue({ status: "blocked", recordCount: 690, modelsObserved: {} });
    await worker.processor(fakeJob(), "tok");
    expect(run).toHaveBeenCalledWith({ corpusId: 3, organizationId: 1 });
  });
});

describe("corporaWithoutPendingJob", () => {
  const withState = (state: string) => ({ getState: async () => state });
  // Each test starts well past any skip window an earlier one opened.
  let clock = Date.now();
  beforeEach(() => {
    clock += 10 * QUEUE_RETRY_AFTER_MS;
    jest.useFakeTimers({ now: clock });
  });
  afterEach(() => jest.useRealTimers());

  it("returns the corpora whose job is gone or finished", async () => {
    getJob.mockImplementation(
      async (id: string) =>
        ({
          "corpus-1": withState("waiting"),
          "corpus-2": withState("delayed"),
          "corpus-3": null,
          "corpus-4": withState("failed"),
          // Just taken by the worker, before it claims the lease.
          "corpus-5": withState("active"),
        })[id],
    );
    await expect(corporaWithoutPendingJob([1, 2, 3, 4, 5])).resolves.toEqual([3, 4]);
  });

  it("leaves a corpus alone when its lookup errors", async () => {
    getJob.mockRejectedValue(new Error("NOAUTH"));
    await expect(corporaWithoutPendingJob([1, 2])).resolves.toEqual([]);
    // Errors do not pause the sweep: the next one asks again.
    getJob.mockReset().mockResolvedValue(null);
    await expect(corporaWithoutPendingJob([1])).resolves.toEqual([1]);
  });

  it("leaves a corpus whose job cannot be read alone and sweeps the rest", async () => {
    getJob.mockImplementation(async (id: string) => {
      if (id === "corpus-7") throw new Error("corrupt job");
      return null;
    });
    await expect(corporaWithoutPendingJob([7, 8])).resolves.toEqual([8]);
  });

  it("sweeps the corpora that answered when one lookup hangs", async () => {
    getJob.mockImplementation((id: string) =>
      id === "corpus-3" ? new Promise(() => undefined) : Promise.resolve(null),
    );
    const result = corporaWithoutPendingJob([1, 2, 3]);
    expect(getJob).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(QUEUE_LOOKUP_TIMEOUT_MS);
    await expect(result).resolves.toEqual([1, 2]);
  });

  it("returns null and skips the queue for a while when no lookup answers", async () => {
    getJob.mockReturnValue(new Promise(() => undefined));
    const first = corporaWithoutPendingJob([1, 2]);
    await jest.advanceTimersByTimeAsync(QUEUE_LOOKUP_TIMEOUT_MS);
    await expect(first).resolves.toBeNull();
    getJob.mockReset().mockResolvedValue(null);
    await expect(corporaWithoutPendingJob([1])).resolves.toBeNull();
    expect(getJob).not.toHaveBeenCalled();
    jest.setSystemTime(Date.now() + QUEUE_RETRY_AFTER_MS);
    await expect(corporaWithoutPendingJob([1])).resolves.toEqual([1]);
  });
});
