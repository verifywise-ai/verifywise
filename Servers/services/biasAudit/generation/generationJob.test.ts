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

  it("returns the corpora whose job is gone, finished or has lost its worker", async () => {
    getJob.mockImplementation(
      async (id: string) =>
        ({
          "corpus-1": withState("waiting"),
          "corpus-2": withState("delayed"),
          "corpus-3": null,
          "corpus-4": withState("failed"),
          // An active job asked about here has no lease and a stale heartbeat.
          "corpus-5": withState("active"),
        })[id],
    );
    await expect(corporaWithoutPendingJob([1, 2, 3, 4, 5])).resolves.toEqual([3, 4, 5]);
  });

  it("returns null when the queue errors", async () => {
    getJob.mockRejectedValue(new Error("redis down"));
    await expect(corporaWithoutPendingJob([1])).resolves.toBeNull();
  });

  it("returns null instead of waiting when the queue does not answer", async () => {
    jest.useFakeTimers();
    try {
      getJob.mockReturnValue(new Promise(() => undefined));
      const result = corporaWithoutPendingJob([1, 2]);
      await jest.advanceTimersByTimeAsync(2_000);
      await expect(result).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("looks the corpora up in parallel", async () => {
    getJob.mockReturnValue(new Promise(() => undefined));
    jest.useFakeTimers();
    try {
      const result = corporaWithoutPendingJob([1, 2, 3]);
      expect(getJob).toHaveBeenCalledTimes(3);
      await jest.advanceTimersByTimeAsync(2_000);
      await result;
    } finally {
      jest.useRealTimers();
    }
  });
});
