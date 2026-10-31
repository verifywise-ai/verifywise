const mockAdd = jest.fn();
const mockObliterate = jest.fn();
const mockUpsertJobScheduler = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    obliterate: mockObliterate,
    upsertJobScheduler: mockUpsertJobScheduler,
  })),
  Worker: jest.fn(),
}));
jest.mock("../../../database/redis", () => ({ REDIS_URL: "redis://localhost:6379" }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { Queue } from "bullmq";
import {
  VENDOR_RESEARCH_JOB,
  VENDOR_RESEARCH_JOB_OPTIONS,
  VENDOR_RESEARCH_QUEUE,
  VENDOR_RESEARCH_SCAN_JOB,
  enqueueVendorResearch,
  scheduleVendorResearchScan,
  vendorResearchJobId,
} from "../queue";

describe("the queue of the research runs", () => {
  // The queue of the automations has a worker with ten places for every kind of job, and the
  // backend empties it each time it starts. A run of several minutes does not belong in it.
  it("is a queue of its own, on the Redis of the application, and the only one that loading it opens", () => {
    expect(VENDOR_RESEARCH_QUEUE).toBe("vendor-research");
    expect((Queue as unknown as jest.Mock).mock.calls).toEqual([
      ["vendor-research", { connection: { url: "redis://localhost:6379" } }],
    ]);
  });
});

describe("enqueueVendorResearch", () => {
  beforeEach(() => mockAdd.mockReset());

  it("adds one vendor_research job with the ids of the run, an id of its own, two attempts and removal on settle", async () => {
    await enqueueVendorResearch(1, 2, 3);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      "vendor_research",
      { organizationId: 1, vendorId: 2, runId: 3 },
      {
        jobId: "vendor-research-1-2-3",
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it("returns what the queue returns", async () => {
    const job = { id: "vendor-research-1-2-3" };
    mockAdd.mockResolvedValue(job);

    await expect(enqueueVendorResearch(1, 2, 3)).resolves.toBe(job);
  });

  // An id per vendor would make BullMQ ignore the add of a new run while the job of an earlier,
  // swept run is still in Redis. The id has no colon: BullMQ rejects a custom id with a colon
  // unless it has exactly three parts.
  it("gives each run its own job id, in the same organization and for the same vendor", () => {
    expect(vendorResearchJobId(1, 2, 3)).toBe("vendor-research-1-2-3");
    expect(vendorResearchJobId(1, 2, 4)).not.toBe(vendorResearchJobId(1, 2, 3));
    expect(vendorResearchJobId(10, 2, 3)).not.toBe(vendorResearchJobId(1, 20, 3));
    expect(vendorResearchJobId(1, 2, 3)).not.toContain(":");
  });

  it("exports the job name and the options the integration test adds a job with", () => {
    expect(VENDOR_RESEARCH_JOB).toBe("vendor_research");
    expect(VENDOR_RESEARCH_JOB_OPTIONS).toEqual({
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  });
});

describe("scheduleVendorResearchScan", () => {
  beforeEach(() => {
    mockUpsertJobScheduler.mockReset();
    mockObliterate.mockReset();
  });

  // The scan has its own name, so that the worker can tell it from the research of one run.
  it("has a job name of its own", () => {
    expect(VENDOR_RESEARCH_SCAN_JOB).toBe("vendor_research_scan");
    expect(VENDOR_RESEARCH_SCAN_JOB).not.toBe(VENDOR_RESEARCH_JOB);
  });

  // Every hour, at a minute off the slots where the other schedulers pile up. The approval overdue
  // sweep shares it, on the automation queue. A failed or a removed job is not kept: the scan of the
  // next hour does its work again.
  it("repeats one job of the scan on the research queue, at 17 minutes past every hour", async () => {
    await scheduleVendorResearchScan();

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      "vendor_research_scan",
      { pattern: "17 * * * *" },
      {
        name: "vendor_research_scan",
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );
  });

  // The runs that are waiting in this queue must survive a restart of the backend, and so must the
  // jobs of the other schedulers: the upsert is idempotent by scheduler id.
  it("does not empty the queue", async () => {
    await scheduleVendorResearchScan();

    expect(mockObliterate).not.toHaveBeenCalled();
  });

  it("lets a refusal of the queue through, for the caller to log", async () => {
    mockUpsertJobScheduler.mockRejectedValue(new Error("redis is down"));

    await expect(scheduleVendorResearchScan()).rejects.toThrow("redis is down");
  });
});
