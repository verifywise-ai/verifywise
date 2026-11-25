const mockWorkerOn = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: mockWorkerOn })),
}));
jest.mock("../../../database/redis", () => ({ REDIS_URL: "redis://localhost:6379" }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../job", () => ({ handleVendorResearchJob: jest.fn() }));
jest.mock("../scan", () => ({ runVendorResearchScan: jest.fn() }));

import { Job, Worker } from "bullmq";
import logger from "../../../utils/logger/fileLogger";
import { handleVendorResearchJob } from "../job";
import { runVendorResearchScan } from "../scan";
import { createVendorResearchWorker } from "../worker";

const asMock = (fn: unknown) => fn as jest.Mock;

/** The function the worker was given to carry out a job. */
const processor = () => asMock(Worker).mock.calls[0][1] as (job: Job) => Promise<unknown>;

/** The options the worker was created with. */
const options = () => asMock(Worker).mock.calls[0][2];

const researchJob = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "vendor-research-1-2-3",
    name: "vendor_research",
    data: { organizationId: 1, vendorId: 2, runId: 3 },
    ...overrides,
  }) as unknown as Job;

/** The job that the scheduler of the scan adds each hour. */
const scanJob = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "repeat:vendor_research_scan:1893500000000",
    name: "vendor_research_scan",
    data: {},
    ...overrides,
  }) as unknown as Job;

/** The function the worker registered for an event. */
const listener = (event: string) =>
  mockWorkerOn.mock.calls.find(([name]) => name === event)?.[1] as (...args: unknown[]) => void;

describe("createVendorResearchWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asMock(handleVendorResearchJob).mockResolvedValue(undefined);
    asMock(runVendorResearchScan).mockResolvedValue({ organizations: 0, started: 0 });
  });

  it("takes the jobs of the research queue, on the Redis of the application", () => {
    createVendorResearchWorker();

    expect(Worker).toHaveBeenCalledTimes(1);
    expect(Worker).toHaveBeenCalledWith("vendor-research", expect.any(Function), {
      connection: { url: "redis://localhost:6379" },
      concurrency: expect.any(Number),
    });
  });

  // For a test against a real Redis, which must not take the jobs of a developer's own queue.
  it("takes the jobs of another queue when it is given one", () => {
    createVendorResearchWorker(1, "vendor-research-test");

    expect(Worker).toHaveBeenCalledWith("vendor-research-test", expect.any(Function), {
      connection: { url: "redis://localhost:6379" },
      concurrency: 1,
    });
  });

  it("returns the worker", () => {
    expect(createVendorResearchWorker().on).toBe(mockWorkerOn);
  });

  describe("how many runs it carries out at the same time", () => {
    const realEnv = process.env;

    afterEach(() => {
      jest.restoreAllMocks();
      // A boolean, so that a failure cannot print the real environment.
      expect(process.env === realEnv).toBe(true);
    });

    it("is five when nothing is set", () => {
      jest.replaceProperty(process, "env", {});

      createVendorResearchWorker();

      expect(options().concurrency).toBe(5);
    });

    it("is the number of VENDOR_RESEARCH_WORKER_CONCURRENCY", () => {
      jest.replaceProperty(process, "env", { VENDOR_RESEARCH_WORKER_CONCURRENCY: "7" });

      createVendorResearchWorker();

      expect(options().concurrency).toBe(7);
    });

    it("is the number it is given, whatever the environment says", () => {
      jest.replaceProperty(process, "env", { VENDOR_RESEARCH_WORKER_CONCURRENCY: "7" });

      createVendorResearchWorker(2);

      expect(options().concurrency).toBe(2);
    });
  });

  describe("the job it carries out", () => {
    it("runs the research of the run that the job names", async () => {
      createVendorResearchWorker();

      await processor()(researchJob());

      expect(handleVendorResearchJob).toHaveBeenCalledTimes(1);
      expect(handleVendorResearchJob).toHaveBeenCalledWith({
        organizationId: 1,
        vendorId: 2,
        runId: 3,
      });
    });

    // The failure that reaches BullMQ is the one it retries: Redis or the database before the run
    // is marked running.
    it("lets a failure of the handler through, so that BullMQ retries the job", async () => {
      asMock(handleVendorResearchJob).mockRejectedValue(new Error("the database is down"));
      createVendorResearchWorker();

      await expect(processor()(researchJob())).rejects.toThrow("the database is down");
    });

    it("refuses a job of another name and researches nothing", async () => {
      createVendorResearchWorker();

      await expect(processor()(researchJob({ name: "send_email" }))).rejects.toThrow(
        "Unknown job: send_email",
      );
      expect(handleVendorResearchJob).not.toHaveBeenCalled();
      expect(runVendorResearchScan).not.toHaveBeenCalled();
    });
  });

  describe("the job of the scan", () => {
    it("runs the scan, and researches no vendor itself", async () => {
      createVendorResearchWorker();

      await processor()(scanJob());

      expect(runVendorResearchScan).toHaveBeenCalledTimes(1);
      expect(handleVendorResearchJob).not.toHaveBeenCalled();
    });

    it("does not run the scan for the research of a run", async () => {
      createVendorResearchWorker();

      await processor()(researchJob());

      expect(runVendorResearchScan).not.toHaveBeenCalled();
    });

    // The job has a single attempt: the failure is logged by the listener of the worker, and the
    // scan of the next hour does the work again.
    it("lets a failure of the scan through, so that the job is marked as failed", async () => {
      asMock(runVendorResearchScan).mockRejectedValue(new Error("the database is down"));
      createVendorResearchWorker();

      await expect(processor()(scanJob())).rejects.toThrow("the database is down");
    });
  });

  describe("what it reports", () => {
    it("says that a job is done", () => {
      createVendorResearchWorker();

      listener("completed")(researchJob());

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("vendor-research-1-2-3"));
    });

    it("says which job failed and why", () => {
      createVendorResearchWorker();

      listener("failed")(researchJob(), new Error("boom"));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/vendor-research-1-2-3.*boom/),
      );
    });

    // BullMQ calls the listener without a job when a job has gone from Redis.
    it("reports a failure that has no job", () => {
      createVendorResearchWorker();

      expect(() => listener("failed")(undefined, new Error("boom"))).not.toThrow();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
    });
  });
});
